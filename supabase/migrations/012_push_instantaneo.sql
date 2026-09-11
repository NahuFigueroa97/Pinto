-- ============================================================
-- PINTÓ — 012: Push instantáneo
-- Ejecutar DESPUÉS de 011_push_checkin_blocks.sql
--
-- Problema: con la entrega a cargo de pg_cron cada minuto, un mensaje
-- tardaba entre 0 y 60 segundos en llegar (promedio ~30 s). Para un chat
-- eso se siente roto.
--
-- Solución: un trigger sobre notification_queue dispara la Edge Function
-- apenas se encola algo (latencia de 1-3 s, que es la de FCM), y el cron
-- pasa de ser el mecanismo de entrega a ser un barrido de reintentos
-- cada 5 minutos.
-- ============================================================

-- ============================================================
-- PREFLIGHT
-- ============================================================

DO $preflight$
BEGIN
  IF to_regclass('public.notification_queue') IS NULL THEN
    RAISE EXCEPTION 'Falta public.notification_queue → corré 011_push_checkin_blocks.sql primero';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE EXCEPTION 'Falta la extensión pg_net → habilitala en Database > Extensions';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE EXCEPTION 'Falta la extensión pg_cron → habilitala en Database > Extensions';
  END IF;
END;
$preflight$;

-- ============================================================
-- 1. Contador de intentos
--
-- Sin esto, una notificación que falla queda en 'failed' para siempre:
-- nadie la reintenta. Con el cron degradado a red de seguridad, el
-- reintento es justamente su razón de ser.
-- ============================================================

ALTER TABLE public.notification_queue
  ADD COLUMN IF NOT EXISTS attempts int NOT NULL DEFAULT 0;

-- ============================================================
-- 2. La URL de la Edge Function, en Vault
--
-- No se hardcodea el project ref en una migración: cambia entre entornos
-- y ya nos pasó de tener uno viejo dando vueltas en el README.
--
-- Cargala UNA vez con tu ref real (Database > SQL Editor):
--
--   select vault.create_secret(
--     'https://TU_REF.supabase.co/functions/v1/send-push',
--     'edge_function_url',
--     'Endpoint de send-push'
--   );
--
-- El service_role_key ya debería estar en Vault desde la puesta en marcha
-- del cron (ver docs/FCM_PUSH_NOTIFICATIONS.md).
-- ============================================================

-- Helper: devuelve los headers ya armados, o NULL si falta algún secret.
CREATE OR REPLACE FUNCTION public.push_request_headers()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_key text;
BEGIN
  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets WHERE name = 'service_role_key';

  IF v_key IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || v_key
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.push_endpoint_url()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'edge_function_url';
$$;

-- ============================================================
-- 3. Disparo inmediato
--
-- Dos detalles que importan:
--
-- a) No hay carrera con el COMMIT. net.http_post() no manda nada: hace un
--    INSERT en la cola de pg_net dentro de la MISMA transacción. El worker
--    de pg_net solo ve filas commiteadas, así que la request sale recién
--    cuando la notificación ya es visible. Si mandara el HTTP en el acto,
--    la Edge Function podría leer la cola antes del commit y no encontrar
--    nada.
--
-- b) Una sola llamada por transacción. El fan-out del chat de un plan
--    inserta una fila por miembro dentro de la misma transacción; sin el
--    guard serían N invocaciones de la función para el mismo lote (la
--    primera vacía la cola y las otras N-1 no hacen nada). Se usa un GUC
--    transaction-local, que no toma locks ni serializa transacciones
--    concurrentes: dos personas escribiendo a la vez siguen generando dos
--    llamadas, que es lo correcto.
-- ============================================================

CREATE OR REPLACE FUNCTION public.dispatch_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_url     text;
  v_headers jsonb;
BEGIN
  IF COALESCE(current_setting('pinto.push_dispatched', true), '') = '1' THEN
    RETURN NULL;
  END IF;
  PERFORM set_config('pinto.push_dispatched', '1', true);  -- true = local a la transacción

  v_url     := public.push_endpoint_url();
  v_headers := public.push_request_headers();

  IF v_url IS NULL OR v_headers IS NULL THEN
    -- Nunca romper el INSERT que originó la notificación: si falta un
    -- secret, el mensaje/reserva se guarda igual y el barrido del cron
    -- entrega la notificación más tarde.
    RAISE WARNING '[push] falta edge_function_url o service_role_key en Vault; queda para el barrido del cron';
    RETURN NULL;
  END IF;

  PERFORM net.http_post(url := v_url, headers := v_headers);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS on_notification_queued ON public.notification_queue;
CREATE TRIGGER on_notification_queued
  AFTER INSERT ON public.notification_queue
  FOR EACH ROW EXECUTE FUNCTION public.dispatch_push();

-- ============================================================
-- 4. Barrido de reintentos
--
-- Cubre: pg_net caído, cold start fallido de la Edge Function, error
-- transitorio de FCM, o un secret que faltaba cuando se encoló.
-- ============================================================

CREATE OR REPLACE FUNCTION public.sweep_notifications()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_reintentos int;
  v_pendientes int;
  v_url        text;
  v_headers    jsonb;
BEGIN
  -- Devolver a la cola lo que falló hace poco y todavía tiene intentos.
  -- 'skipped' NO se reintenta: significa que el usuario no tiene ningún
  -- dispositivo registrado, y eso no se arregla reintentando.
  UPDATE public.notification_queue
  SET status = 'pending', attempts = attempts + 1, error = NULL
  WHERE status = 'failed'
    AND attempts < 3
    AND created_at > now() - interval '1 hour';
  GET DIAGNOSTICS v_reintentos = ROW_COUNT;

  SELECT count(*) INTO v_pendientes
  FROM public.notification_queue WHERE status = 'pending';

  IF v_pendientes = 0 THEN
    RETURN jsonb_build_object('reencolados', v_reintentos, 'pendientes', 0, 'invocada', false);
  END IF;

  v_url     := public.push_endpoint_url();
  v_headers := public.push_request_headers();

  IF v_url IS NULL OR v_headers IS NULL THEN
    RETURN jsonb_build_object(
      'error', 'falta edge_function_url o service_role_key en Vault',
      'reencolados', v_reintentos, 'pendientes', v_pendientes, 'invocada', false);
  END IF;

  PERFORM net.http_post(url := v_url, headers := v_headers);

  RETURN jsonb_build_object(
    'reencolados', v_reintentos, 'pendientes', v_pendientes, 'invocada', true);
END;
$$;

-- ============================================================
-- 5. Reprogramar el cron
--
-- Pasa de cada minuto (era el mecanismo de entrega) a cada 5 minutos
-- (ahora es solo la red de seguridad). El trigger hace el trabajo real.
-- ============================================================

DO $recron$
BEGIN
  -- El job viejo puede llamarse 'send-push' según cómo se haya creado
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-push') THEN
    PERFORM cron.unschedule('send-push');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-push-sweep') THEN
    PERFORM cron.unschedule('send-push-sweep');
  END IF;

  PERFORM cron.schedule(
    'send-push-sweep',
    '*/5 * * * *',
    'select public.sweep_notifications();'
  );
END;
$recron$;

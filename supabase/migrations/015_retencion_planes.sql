-- ============================================================
-- PINTÓ — 015: Política de retención de planes pasados
-- Ejecutar DESPUÉS de 014_ofertas_comerciales.sql
--
-- Qué pasa con un plan una vez que ya ocurrió.
--
-- Lo que había:
--   - cleanup_expired_plans() cerraba los planes vencidos a los 7 días ✓
--   - cleanup_old_chat_messages() borraba chat de más de 90 días, pero por
--     antigüedad ABSOLUTA: un plan del martes pasado que ya pasó se guardaba
--     su chat 3 meses más.
--   - plan_photos NO se limpiaba nunca. Ni la fila, ni el archivo en
--     Storage. Eso crece para siempre y se factura todos los meses.
--   - social_plan_requests tampoco.
--
-- Decisión de fondo: NO se borran los planes.
--   plan_reviews.plan_id tiene ON DELETE CASCADE, así que borrar un plan
--   viejo se llevaría puestas las reseñas que sostienen reputation_score.
--   La fila del plan pesa nada; lo que cuesta plata son las fotos y el chat.
--   Se borra lo pesado y lo sensible, y se conserva el historial.
-- ============================================================

DO $preflight$
BEGIN
  IF to_regclass('public.social_plans') IS NULL
     OR to_regclass('public.plan_photos') IS NULL THEN
    RAISE EXCEPTION 'Faltan migraciones previas (003 y 008)';
  END IF;
END;
$preflight$;

-- ============================================================
-- LA POLÍTICA
--
--   Plan 'open' vencido      → se cierra a los 7 días     (ya existía)
--   Chat del plan            → 30 días después del plan
--   Solicitudes              → 30 días después del plan
--   Fotos (fila + archivo)   → 180 días después del plan
--   Miembros                 → se conservan  (historial del perfil)
--   El plan                  → se conserva   (sostiene las reseñas)
--   Reseñas                  → se conservan  (sostienen la reputación)
--
-- Los plazos cuentan desde la FECHA DEL PLAN, no desde que se creó la fila:
-- lo que importa es hace cuánto ocurrió la juntada.
-- ============================================================

-- ============================================================
-- 1. COLA DE BORRADO EN STORAGE
--
-- Borrar de storage.objects saca la fila de metadatos pero NO el archivo:
-- los bytes viven en S3 y se siguen facturando. La baja real hay que
-- pedirla por la API de Storage, así que el SQL encola las rutas y una
-- Edge Function las borra de verdad.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.storage_cleanup_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket text NOT NULL,
  path   text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  error text,
  UNIQUE (bucket, path)
);

CREATE INDEX IF NOT EXISTS idx_storage_cleanup_pending
  ON public.storage_cleanup_queue(created_at) WHERE deleted_at IS NULL;

ALTER TABLE public.storage_cleanup_queue ENABLE ROW LEVEL SECURITY;
-- Sin policies: solo la service_role (Edge Function) y las funciones
-- SECURITY DEFINER la tocan. Ningún cliente tiene por qué verla.

/** Extrae la ruta dentro del bucket desde una URL pública de Storage. */
CREATE OR REPLACE FUNCTION public.storage_path_from_url(p_url text, p_bucket text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = ''
AS $$
DECLARE
  marker text := '/' || p_bucket || '/';
  pos int;
BEGIN
  IF p_url IS NULL THEN RETURN NULL; END IF;
  -- Las data URL del fallback de subida no son archivos de Storage
  IF p_url LIKE 'data:%' THEN RETURN NULL; END IF;

  pos := position(marker IN p_url);
  IF pos = 0 THEN RETURN NULL; END IF;

  RETURN split_part(substr(p_url, pos + length(marker)), '?', 1);
END;
$$;

-- ============================================================
-- 2. CHAT: 30 DÍAS DESPUÉS DEL PLAN
-- ============================================================

CREATE OR REPLACE FUNCTION public.cleanup_plan_chat()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE n int;
BEGIN
  DELETE FROM public.plan_chat_messages m
  USING public.social_plans sp
  WHERE m.plan_id = sp.id
    AND sp.plan_date < CURRENT_DATE - INTERVAL '30 days';
  GET DIAGNOSTICS n = ROW_COUNT;

  -- Red de seguridad por antigüedad absoluta, para mensajes cuyo plan ya
  -- no exista o tenga una fecha rara.
  DELETE FROM public.plan_chat_messages
  WHERE created_at < NOW() - INTERVAL '90 days';

  RETURN n;
END;
$$;

-- ============================================================
-- 3. SOLICITUDES: 30 DÍAS DESPUÉS DEL PLAN
-- ============================================================

CREATE OR REPLACE FUNCTION public.cleanup_plan_requests()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE n int;
BEGIN
  DELETE FROM public.social_plan_requests r
  USING public.social_plans sp
  WHERE r.plan_id = sp.id
    AND sp.plan_date < CURRENT_DATE - INTERVAL '30 days';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- ============================================================
-- 4. FOTOS: 180 DÍAS DESPUÉS DEL PLAN, ARCHIVO INCLUIDO
--
-- Seis meses es el plazo largo a propósito: son las fotos de una juntada,
-- tienen valor sentimental. Pero no pueden vivir para siempre en un bucket
-- que se paga por GB.
-- ============================================================

CREATE OR REPLACE FUNCTION public.cleanup_plan_photos()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE n int;
BEGIN
  -- Encolar los archivos ANTES de borrar las filas: después de borrarlas
  -- ya no hay forma de saber qué había en Storage.
  INSERT INTO public.storage_cleanup_queue (bucket, path, reason)
  SELECT 'plan-photos',
         public.storage_path_from_url(ph.photo_url, 'plan-photos'),
         'plan_photos > 180 días'
  FROM public.plan_photos ph
  JOIN public.social_plans sp ON sp.id = ph.plan_id
  WHERE sp.plan_date < CURRENT_DATE - INTERVAL '180 days'
    AND public.storage_path_from_url(ph.photo_url, 'plan-photos') IS NOT NULL
  ON CONFLICT (bucket, path) DO NOTHING;

  DELETE FROM public.plan_photos ph
  USING public.social_plans sp
  WHERE ph.plan_id = sp.id
    AND sp.plan_date < CURRENT_DATE - INTERVAL '180 days';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- ============================================================
-- 5. AVISO ANTES DE BORRAR
--
-- Borrar las fotos de una juntada sin avisar es la clase de cosa que hace
-- que alguien desinstale la app. Se avisa 7 días antes, una sola vez, a
-- quien subió cada foto.
-- ============================================================

ALTER TABLE public.social_plans
  ADD COLUMN IF NOT EXISTS photos_expiry_notified_at timestamptz;

CREATE OR REPLACE FUNCTION public.notify_photos_expiring()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  r record;
  n int := 0;
BEGIN
  FOR r IN
    SELECT DISTINCT sp.id AS plan_id, sp.title, ph.user_id
    FROM public.social_plans sp
    JOIN public.plan_photos ph ON ph.plan_id = sp.id
    WHERE sp.photos_expiry_notified_at IS NULL
      AND sp.plan_date < CURRENT_DATE - INTERVAL '173 days'
      AND sp.plan_date >= CURRENT_DATE - INTERVAL '180 days'
  LOOP
    PERFORM public.enqueue_notification(
      r.user_id,
      'Tus fotos se borran en 7 días',
      'Las fotos de "' || r.title || '" se eliminan la semana que viene. Descargá las que quieras guardar.',
      '/planes/fotos?id=' || r.plan_id,
      jsonb_build_object('type', 'photos_expiring', 'planId', r.plan_id)
    );
    n := n + 1;
  END LOOP;

  UPDATE public.social_plans sp
  SET photos_expiry_notified_at = now()
  WHERE sp.photos_expiry_notified_at IS NULL
    AND sp.plan_date < CURRENT_DATE - INTERVAL '173 days'
    AND sp.plan_date >= CURRENT_DATE - INTERVAL '180 days';

  RETURN n;
END;
$$;

-- ============================================================
-- 6. AVATARES HUÉRFANOS
--
-- Cada cambio de foto de perfil deja el archivo anterior si cambió la
-- extensión (avatar.jpg → avatar.png). Son pocos bytes pero se acumulan.
-- ============================================================

CREATE OR REPLACE FUNCTION public.cleanup_orphan_avatars()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE n int;
BEGIN
  INSERT INTO public.storage_cleanup_queue (bucket, path, reason)
  SELECT 'avatars', o.name, 'avatar huérfano'
  FROM storage.objects o
  WHERE o.bucket_id = 'avatars'
    AND o.created_at < now() - INTERVAL '7 days'
    AND NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.avatar_url LIKE '%/avatars/' || o.name || '%'
    )
  ON CONFLICT (bucket, path) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- ============================================================
-- 7. TODO JUNTO EN EL BARRIDO DIARIO
-- ============================================================

CREATE OR REPLACE FUNCTION public.run_all_cleanups()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_chat int; v_requests int; v_photos int; v_avatars int; v_warned int;
  v_feed int; v_reports int; v_plans int; v_notifs int;
BEGIN
  -- Avisar ANTES de borrar, nunca después
  v_warned := public.notify_photos_expiring();

  v_chat     := public.cleanup_plan_chat();
  v_requests := public.cleanup_plan_requests();
  v_photos   := public.cleanup_plan_photos();
  v_avatars  := public.cleanup_orphan_avatars();

  SELECT count(*) INTO v_feed FROM public.activity_feed
    WHERE created_at < NOW() - INTERVAL '60 days';
  SELECT count(*) INTO v_reports FROM public.user_reports
    WHERE status IN ('resolved','dismissed') AND created_at < NOW() - INTERVAL '180 days';
  SELECT count(*) INTO v_plans FROM public.social_plans
    WHERE status = 'open' AND plan_date < (CURRENT_DATE - INTERVAL '7 days');
  SELECT count(*) INTO v_notifs FROM public.notification_queue
    WHERE created_at < NOW() - INTERVAL '30 days';

  PERFORM public.cleanup_old_feed();
  PERFORM public.cleanup_old_reports();
  PERFORM public.cleanup_expired_plans();
  PERFORM public.cleanup_old_messages();
  PERFORM public.cleanup_notification_queue();

  RETURN jsonb_build_object(
    'plan_chat_deleted',      v_chat,
    'plan_requests_deleted',  v_requests,
    'plan_photos_deleted',    v_photos,
    'avatars_queued',         v_avatars,
    'photo_expiry_warnings',  v_warned,
    'feed_items_deleted',     v_feed,
    'reports_deleted',        v_reports,
    'plans_closed',           v_plans,
    'notifications_deleted',  v_notifs,
    'storage_pending',        (SELECT count(*) FROM public.storage_cleanup_queue WHERE deleted_at IS NULL),
    'executed_at',            NOW()
  );
END;
$$;

-- Programar el barrido diario si pg_cron está disponible.
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-cleanup') THEN
      PERFORM cron.unschedule('daily-cleanup');
    END IF;
    PERFORM cron.schedule('daily-cleanup', '0 4 * * *', 'select public.run_all_cleanups();');
  ELSE
    RAISE WARNING 'pg_cron no está habilitado: run_all_cleanups() no queda programada';
  END IF;
END;
$cron$;

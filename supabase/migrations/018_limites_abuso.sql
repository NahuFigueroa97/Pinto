-- ============================================================
-- PINTÓ — 018: Límites de frecuencia y de tamaño
-- Ejecutar DESPUÉS de 017_privacidad_social.sql
--
-- La clave anónima viaja adentro del APK — es pública por diseño. O sea que
-- cualquiera puede hablarle a PostgREST directamente, sin pasar por la app,
-- y todo lo que se valide únicamente en el cliente no se valida.
--
-- Hoy no hay ningún límite: con un script y esa clave se puede inundar el
-- chat de un plan, crear diez mil planes o ahogar la cola de denuncias.
-- Nada de eso hace falta que sea malicioso: un bucle mal escrito alcanza.
--
-- Los límites de acá son deliberadamente holgados: no molestan a nadie que
-- use la app como se espera, y cortan el abuso automatizado.
-- ============================================================

DO $preflight$
BEGIN
  IF to_regclass('public.plan_chat_messages') IS NULL
     OR to_regclass('public.social_plans') IS NULL THEN
    RAISE EXCEPTION 'Faltan migraciones previas (003_sprint2.sql, 008_v3_features.sql)';
  END IF;
END;
$preflight$;

-- ============================================================
-- 1. TAMAÑO DEL CONTENIDO
--
-- Sin tope, un solo mensaje puede ser de megabytes: rompe la pantalla de
-- todos los del grupo y se descarga en cada carga del chat.
-- ============================================================

ALTER TABLE public.plan_chat_messages
  DROP CONSTRAINT IF EXISTS chat_content_largo;
ALTER TABLE public.plan_chat_messages
  ADD CONSTRAINT chat_content_largo
  CHECK (char_length(content) BETWEEN 1 AND 2000) NOT VALID;

-- ============================================================
-- 2. FRECUENCIA
--
-- Un contador por ventana sería más exacto, pero exige otra tabla y su
-- propia limpieza. Contar las filas recientes del propio usuario usa los
-- índices que ya existen y no agrega nada que mantener.
-- ============================================================

/**
 * Corta si el usuario ya insertó demasiadas filas recientes en la tabla.
 *
 * Los parámetros vienen del CREATE TRIGGER, así que un solo cuerpo sirve
 * para todas las tablas: TG_ARGV[0] = columna de usuario, [1] = máximo,
 * [2] = ventana, [3] = mensaje para el usuario.
 */
CREATE OR REPLACE FUNCTION public.enforce_rate_limit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_col      text := TG_ARGV[0];
  v_max      int  := TG_ARGV[1]::int;
  v_ventana  interval := TG_ARGV[2]::interval;
  v_mensaje  text := TG_ARGV[3];
  v_actor    uuid;
  v_cuantos  int;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;   -- triggers del servidor y seeds no se limitan
  END IF;

  -- to_jsonb en vez de EXECUTE 'SELECT ($1).col' USING NEW: pasar un
  -- registro como parámetro de EXECUTE depende de que el planificador
  -- infiera el tipo compuesto y falla de formas poco obvias. Esto no.
  v_actor := (to_jsonb(NEW) ->> v_col)::uuid;
  IF v_actor IS DISTINCT FROM auth.uid() THEN
    RETURN NEW;   -- otras policies ya se ocupan de la suplantación
  END IF;

  EXECUTE format(
    'SELECT count(*) FROM %I.%I WHERE %I = $1 AND created_at > now() - $2',
    TG_TABLE_SCHEMA, TG_TABLE_NAME, v_col
  ) INTO v_cuantos USING v_actor, v_ventana;

  IF v_cuantos >= v_max THEN
    RAISE EXCEPTION '%', v_mensaje USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- 20 mensajes por minuto: escribiendo rápido no se llega, un bot sí.
DROP TRIGGER IF EXISTS rate_chat_messages ON public.plan_chat_messages;
CREATE TRIGGER rate_chat_messages
  BEFORE INSERT ON public.plan_chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_rate_limit(
    'user_id', '20', '1 minute',
    'Estás enviando mensajes muy rápido. Esperá un momento.');

-- 10 planes por día es muchísimo para una persona real.
DROP TRIGGER IF EXISTS rate_social_plans ON public.social_plans;
CREATE TRIGGER rate_social_plans
  BEFORE INSERT ON public.social_plans
  FOR EACH ROW EXECUTE FUNCTION public.enforce_rate_limit(
    'creator_id', '10', '1 day',
    'Llegaste al límite de planes por día.');

-- Pedir sumarse a 40 planes en un día no es uso normal.
DROP TRIGGER IF EXISTS rate_plan_requests ON public.social_plan_requests;
CREATE TRIGGER rate_plan_requests
  BEFORE INSERT ON public.social_plan_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_rate_limit(
    'user_id', '40', '1 day',
    'Pediste sumarte a demasiados planes hoy. Probá mañana.');

-- La cola de denuncias la revisa gente: si se inunda, deja de servir.
DROP TRIGGER IF EXISTS rate_user_reports ON public.user_reports;
CREATE TRIGGER rate_user_reports
  BEFORE INSERT ON public.user_reports
  FOR EACH ROW EXECUTE FUNCTION public.enforce_rate_limit(
    'reporter_id', '20', '1 day',
    'Enviaste muchas denuncias hoy. Si es urgente, escribinos.');

-- ============================================================
-- OJO: LO QUE ESTO NO CUBRE
--
-- El filtro de contenido (src/lib/moderation.ts) sigue corriendo sólo en el
-- cliente, así que se saltea igual que todo lo demás. No se replica acá a
-- propósito: una lista de palabras en SQL se desincroniza de la del cliente
-- en la primera corrección y los falsos positivos en un chat entre amigos
-- —donde se putea de cariño— cuestan más de lo que evitan.
--
-- Lo que Google Play exige para contenido de usuarios es que haya forma de
-- DENUNCIAR y de BLOQUEAR, y las dos existen (user_reports, user_blocks).
-- El filtro automático es una ayuda de UX, no la defensa.
--
-- Si en algún momento hace falta filtrar de verdad, el lugar es un trigger
-- que marque para revisión en vez de rechazar, no una lista que rebote
-- mensajes.
-- ============================================================

-- ============================================================
-- PINTÓ — 020: Los negocios se publican solos y se verifican con el uso
-- Ejecutar DESPUÉS de 019_bandeja_notificaciones.sql
--
-- Hasta acá, todo negocio nuevo nacía en 'pending' y no aparecía en la app
-- hasta que un administrador lo aprobaba a mano. Eso convierte a una persona
-- en el cuello de botella de todo el lado comercial: si nadie entra a
-- aprobar, para el dueño del bar la app simplemente no funciona, y él no
-- tiene forma de saber por qué.
--
-- El cambio: publican al instante, marcados como "Sin verificar" y con
-- límites. La verificación se gana con uso real, sin que nadie mire nada.
--
-- LA SEÑAL: el canje del QR.
--
-- Un negocio donde varias personas DISTINTAS llegaron, mostraron el código y
-- se los validaron es demostrablemente real — más de lo que probaría una
-- llamada telefónica o un mail. Y no cuesta nada: la infraestructura ya
-- existe (checkins, redeem_reservation).
-- ============================================================

DO $preflight$
BEGIN
  IF to_regclass('public.checkins') IS NULL OR to_regclass('public.user_reports') IS NULL THEN
    RAISE EXCEPTION 'Faltan migraciones previas (001_schema.sql, 008_v3_features.sql)';
  END IF;
END;
$preflight$;

-- ============================================================
-- 1. NACER PUBLICADO, NO PENDIENTE
-- ============================================================

CREATE OR REPLACE FUNCTION public.force_business_unverified()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;
  IF public.get_user_role() IS DISTINCT FROM 'admin' THEN
    -- Publicado, pero sin ninguno de los privilegios que se ganan.
    NEW.status      := 'active';
    NEW.is_verified := false;
    NEW.is_featured := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_business_insert_pending ON public.businesses;
DROP TRIGGER IF EXISTS on_business_insert_unverified ON public.businesses;
CREATE TRIGGER on_business_insert_unverified
  BEFORE INSERT ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.force_business_unverified();

DROP FUNCTION IF EXISTS public.force_business_pending();

-- Los que quedaron esperando aprobación que nunca llegó. No se los verifica:
-- se los publica sin verificar, igual que a uno nuevo.
UPDATE public.businesses SET status = 'active' WHERE status = 'pending';

-- ============================================================
-- 2. QUÉ NO PUEDE HACER UN NEGOCIO SIN VERIFICAR
--
-- El objetivo no es castigar: es que verificarse CONVENGA, y que mientras
-- tanto el daño que puede hacer uno falso quede acotado.
-- ============================================================

-- Tope de promos activas mientras no esté verificado. Se aplica ADEMÁS del
-- límite del plan contratado: manda el más chico de los dos.
CREATE OR REPLACE FUNCTION public.unverified_max_campaigns()
RETURNS int LANGUAGE sql IMMUTABLE AS $$ SELECT 2 $$;

CREATE OR REPLACE FUNCTION public.enforce_campaign_quota()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_plan     public.pricing_plans;
  v_active   int;
  v_max      int;
  v_verified boolean;
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;
  IF NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'active' THEN
    RETURN NEW;   -- ya contaba como activa
  END IF;

  v_plan := public.business_plan(NEW.business_id);
  v_max  := v_plan.max_campaigns;

  SELECT b.is_verified INTO v_verified
  FROM public.businesses b WHERE b.id = NEW.business_id;

  IF NOT COALESCE(v_verified, false) THEN
    v_max := LEAST(COALESCE(v_max, 2147483647), public.unverified_max_campaigns());
  END IF;

  IF v_max IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_active FROM public.campaigns c
  WHERE c.business_id = NEW.business_id AND c.status = 'active';

  IF v_active >= v_max THEN
    IF NOT COALESCE(v_verified, false) THEN
      RAISE EXCEPTION
        'Mientras tu negocio no esté verificado podés tener % promos activas. Se verifica solo cuando % personas distintas canjeen en tu local.',
        v_max, public.checkins_para_verificar()
        USING ERRCODE = 'check_violation';
    END IF;
    RAISE EXCEPTION 'Tu plan permite % promos activas.', v_max
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

/**
 * Destacar en la home es de negocios verificados.
 *
 * protect_campaign_featured() ya impide que el dueño se destaque solo, pero
 * no impedía que un admin destacara a uno sin verificar — y destacar es
 * justamente poner algo arriba de todo sin que nadie lo haya comprobado.
 */
CREATE OR REPLACE FUNCTION public.block_featured_unverified()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NEW.is_featured AND NOT EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = NEW.business_id AND b.is_verified
  ) THEN
    RAISE EXCEPTION 'No se puede destacar la promo de un negocio sin verificar.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_campaign_featured_guard ON public.campaigns;
CREATE TRIGGER on_campaign_featured_guard
  BEFORE INSERT OR UPDATE OF is_featured ON public.campaigns
  FOR EACH ROW WHEN (NEW.is_featured)
  EXECUTE FUNCTION public.block_featured_unverified();

-- ============================================================
-- 3. VERIFICACIÓN AUTOMÁTICA POR CANJES REALES
-- ============================================================

/** Cuántas personas distintas tienen que canjear. */
CREATE OR REPLACE FUNCTION public.checkins_para_verificar()
RETURNS int LANGUAGE sql IMMUTABLE AS $$ SELECT 5 $$;

/**
 * Verifica el negocio si ya se lo ganó.
 *
 * Se cuentan PERSONAS distintas, no canjes: si no, el dueño se autoverifica
 * generando cinco reservas con su propia cuenta y canjeándoselas.
 *
 * Y no se verifica nada que tenga denuncias abiertas: sería exactamente al
 * revés de lo que la etiqueta promete.
 */
CREATE OR REPLACE FUNCTION public.maybe_verify_business(p_business_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_personas int;
  v_denuncias int;
BEGIN
  IF p_business_id IS NULL THEN RETURN false; END IF;

  IF EXISTS (SELECT 1 FROM public.businesses b
             WHERE b.id = p_business_id AND (b.is_verified OR b.status <> 'active')) THEN
    RETURN false;
  END IF;

  SELECT count(DISTINCT c.user_id) INTO v_personas
  FROM public.checkins c
  WHERE c.business_id = p_business_id
    -- El dueño canjeándose a sí mismo no cuenta como visita de un cliente.
    AND c.user_id <> (SELECT b.owner_user_id FROM public.businesses b WHERE b.id = p_business_id);

  IF v_personas < public.checkins_para_verificar() THEN
    RETURN false;
  END IF;

  SELECT count(*) INTO v_denuncias
  FROM public.user_reports r
  WHERE r.target_type = 'business' AND r.target_id = p_business_id AND r.status = 'pending';

  IF v_denuncias > 0 THEN
    RETURN false;
  END IF;

  UPDATE public.businesses SET is_verified = true, updated_at = now()
  WHERE id = p_business_id;

  PERFORM public.enqueue_notification(
    (SELECT b.owner_user_id FROM public.businesses b WHERE b.id = p_business_id),
    '✅ Tu negocio quedó verificado',
    'Ya podés destacar promos y no tenés más el tope de promos activas.',
    '/negocio',
    jsonb_build_object('type', 'business_verified', 'businessId', p_business_id)
  );

  RETURN true;
END;
$$;

/** Cada canje es una oportunidad de que el negocio se gane la verificación. */
CREATE OR REPLACE FUNCTION public.verify_on_checkin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  PERFORM public.maybe_verify_business(NEW.business_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_checkin_verify_business ON public.checkins;
CREATE TRIGGER on_checkin_verify_business
  AFTER INSERT ON public.checkins
  FOR EACH ROW EXECUTE FUNCTION public.verify_on_checkin();

-- Los que ya tenían canjes de sobra antes de esta migración.
DO $backfill$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.businesses WHERE status = 'active' AND NOT is_verified LOOP
    PERFORM public.maybe_verify_business(r.id);
  END LOOP;
END;
$backfill$;

-- ============================================================
-- 4. DENUNCIAR UN NEGOCIO, Y QUE SE OCULTE SOLO
--
-- No se podía denunciar un negocio: target_type sólo aceptaba plan, user y
-- photo. Con los negocios publicándose sin revisión previa, esa es
-- justamente la denuncia que más falta hace.
-- ============================================================

ALTER TABLE public.user_reports DROP CONSTRAINT IF EXISTS user_reports_target_type_check;
ALTER TABLE public.user_reports
  ADD CONSTRAINT user_reports_target_type_check
  CHECK (target_type IN ('plan', 'user', 'photo', 'business'));

/** Cuántas personas distintas tienen que denunciar para ocultarlo. */
CREATE OR REPLACE FUNCTION public.denuncias_para_ocultar()
RETURNS int LANGUAGE sql IMMUTABLE AS $$ SELECT 3 $$;

/**
 * Oculta el negocio solo cuando lo denuncian varias personas distintas.
 *
 * Personas distintas, no denuncias: user_reports ya tiene UNIQUE(reporter_id,
 * target_type, target_id), así que una persona no puede sumar dos.
 *
 * Es reversible con un toque desde el panel. La alternativa —esperar a que
 * un humano entre— deja operando a quien estafa durante todo ese tiempo, y
 * el humano puede tardar días.
 */
CREATE OR REPLACE FUNCTION public.suspend_reported_business()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_denunciantes int;
BEGIN
  IF NEW.target_type <> 'business' THEN RETURN NEW; END IF;

  SELECT count(DISTINCT r.reporter_id) INTO v_denunciantes
  FROM public.user_reports r
  WHERE r.target_type = 'business' AND r.target_id = NEW.target_id AND r.status = 'pending';

  IF v_denunciantes >= public.denuncias_para_ocultar() THEN
    UPDATE public.businesses
    SET status = 'suspended', updated_at = now()
    WHERE id = NEW.target_id AND status = 'active';

    -- Que el dueño se entere por qué desapareció, en vez de descubrirlo solo.
    PERFORM public.enqueue_notification(
      (SELECT b.owner_user_id FROM public.businesses b WHERE b.id = NEW.target_id),
      'Tu negocio quedó oculto temporalmente',
      'Recibimos varias denuncias y lo pausamos mientras las revisamos. Escribinos si creés que es un error.',
      '/negocio',
      jsonb_build_object('type', 'business_suspended', 'businessId', NEW.target_id)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_report_suspend_business ON public.user_reports;
CREATE TRIGGER on_report_suspend_business
  AFTER INSERT ON public.user_reports
  FOR EACH ROW EXECUTE FUNCTION public.suspend_reported_business();

-- ============================================================
-- 5. QUE EL DUEÑO VEA EN QUÉ ESTÁ
-- ============================================================

CREATE OR REPLACE FUNCTION public.business_limits(p_business_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_plan     public.pricing_plans;
  v_active   int;
  v_featured int;
  v_verified boolean;
  v_personas int;
  v_faltan   int;
  v_max      int;
BEGIN
  v_plan := public.business_plan(p_business_id);

  SELECT b.is_verified INTO v_verified FROM public.businesses b WHERE b.id = p_business_id;
  v_verified := COALESCE(v_verified, false);

  SELECT count(*) INTO v_active FROM public.campaigns c
  WHERE c.business_id = p_business_id AND c.status = 'active';

  SELECT count(*) INTO v_featured FROM public.campaigns c
  WHERE c.business_id = p_business_id AND c.is_featured;

  SELECT count(DISTINCT c.user_id) INTO v_personas
  FROM public.checkins c
  WHERE c.business_id = p_business_id
    AND c.user_id <> (SELECT b.owner_user_id FROM public.businesses b WHERE b.id = p_business_id);

  v_faltan := GREATEST(0, public.checkins_para_verificar() - COALESCE(v_personas, 0));

  v_max := v_plan.max_campaigns;
  IF NOT v_verified THEN
    v_max := LEAST(COALESCE(v_max, 2147483647), public.unverified_max_campaigns());
  END IF;

  RETURN jsonb_build_object(
    'plan',       jsonb_build_object('slug', v_plan.slug, 'name', v_plan.name,
                                     'price_monthly', v_plan.price_monthly,
                                     'features', v_plan.features),
    'campaigns',  jsonb_build_object('used', v_active,   'max', v_max),
    'featured',   jsonb_build_object('used', v_featured, 'max', CASE WHEN v_verified THEN v_plan.max_featured ELSE 0 END),
    'can_create', v_max IS NULL OR v_active < v_max,
    'max_tiers',  COALESCE((v_plan.features ->> 'tiers')::int, 1),
    -- Para que el panel pueda decir exactamente cuánto falta, en vez de
    -- "verificate" a secas.
    'verification', jsonb_build_object(
      'verified',        v_verified,
      'people_so_far',   COALESCE(v_personas, 0),
      'people_needed',   public.checkins_para_verificar(),
      'people_missing',  v_faltan
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.business_limits(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.checkins_para_verificar() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.unverified_max_campaigns() TO authenticated, anon;

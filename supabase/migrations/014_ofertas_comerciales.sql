-- ============================================================
-- PINTÓ — 014: Ofertas comerciales y monetización
-- Ejecutar DESPUÉS de 013_rutas_notificacion.sql
--
-- Cierra el circuito que le da sentido a la app: el negocio publica una
-- promo CONDICIONADA, los usuarios arman un plan para desbloquearla, y el
-- check-in verifica que las condiciones se cumplan.
--
--   "Café 45% off si vienen 3 o más personas, de lunes a viernes hasta las 19"
--
-- Antes las condiciones vivían en `price_text`, un campo de texto libre que
-- ningún código podía interpretar: no se podía validar nada, ni mostrar
-- cuánta gente falta, ni calcular el descuento en el mostrador.
--
-- Y `pricing_plans` / `business_subscriptions` existían desde la 001 pero
-- NADIE las leía: la parte monetaria era una tabla vacía. Acá se enforzan.
-- ============================================================

-- ============================================================
-- PREFLIGHT
-- ============================================================

DO $preflight$
DECLARE faltan text[] := '{}';
BEGIN
  IF to_regclass('public.campaigns') IS NULL THEN
    faltan := faltan || 'tabla public.campaigns (001_schema.sql)';
  END IF;
  IF to_regclass('public.pricing_plans') IS NULL THEN
    faltan := faltan || 'tabla public.pricing_plans (001_schema.sql)';
  END IF;
  IF to_regclass('public.social_plans') IS NULL THEN
    faltan := faltan || 'tabla public.social_plans (003_sprint2.sql)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname='public' AND p.proname='redeem_reservation') THEN
    faltan := faltan || 'función public.redeem_reservation() (011_push_checkin_blocks.sql)';
  END IF;
  IF array_length(faltan,1) > 0 THEN
    RAISE EXCEPTION E'Faltan migraciones previas:\n  - %', array_to_string(faltan, E'\n  - ');
  END IF;
END;
$preflight$;

-- ============================================================
-- 1. ZONA HORARIA DEL NEGOCIO
--
-- "hasta las 19" es hora local del local, no UTC. Sin esto, una franja
-- horaria evaluada con now() se corre 3 horas en Argentina — el mismo
-- error que ya apareció con los planes de hoy desapareciendo del listado.
-- ============================================================

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/Argentina/Catamarca';

-- ============================================================
-- 2. CONDICIONES DE LA PROMO
--
-- Todo lo que antes vivía en `price_text` como texto libre.
-- ============================================================

ALTER TABLE public.campaigns
  -- Días de la semana en los que aplica. 0=domingo ... 6=sábado.
  -- NULL = todos los días.
  ADD COLUMN IF NOT EXISTS valid_weekdays int[],
  -- Franja horaria del día. NULL = sin restricción.
  ADD COLUMN IF NOT EXISTS valid_from_time time,
  ADD COLUMN IF NOT EXISTS valid_until_time time,
  -- Cupos de canje
  ADD COLUMN IF NOT EXISTS max_redemptions_total int,
  ADD COLUMN IF NOT EXISTS max_redemptions_per_user int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS redemptions_count int NOT NULL DEFAULT 0,
  -- Letra chica que el usuario ve antes de reservar
  ADD COLUMN IF NOT EXISTS terms text;

DO $ck$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campaigns_valid_weekdays_ck') THEN
    ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_valid_weekdays_ck
      CHECK (valid_weekdays IS NULL OR (
        array_length(valid_weekdays, 1) BETWEEN 1 AND 7
        AND valid_weekdays <@ ARRAY[0,1,2,3,4,5,6]
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campaigns_redemptions_ck') THEN
    ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_redemptions_ck
      CHECK (
        (max_redemptions_total IS NULL OR max_redemptions_total > 0)
        AND max_redemptions_per_user > 0
        AND redemptions_count >= 0
      );
  END IF;
END;
$ck$;

-- ============================================================
-- 3. ESCALERA DE DESCUENTOS POR TAMAÑO DE GRUPO
--
-- Una fila = el caso simple ("3 o más → 45%"). Varias filas = escalera:
--
--     2 personas → 20%
--     4 personas → 35%
--     6 personas → 50%
--
-- La escalera es la que le da sentido a la app: premia armar el grupo más
-- grande, que es exactamente lo que hace un "plan" de Pintó. Un cupón
-- individual no necesita una red social; este sí.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.campaign_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  min_people int NOT NULL CHECK (min_people >= 1),
  discount_type text NOT NULL DEFAULT 'percent'
    CHECK (discount_type IN ('percent', 'fixed', 'free_item', 'two_for_one')),
  -- percent: 45 = 45% off | fixed: 1500 = $1500 off | free_item/two_for_one: sin valor
  discount_value numeric CHECK (discount_value IS NULL OR discount_value >= 0),
  -- Texto que ve el usuario. Si es NULL se arma solo desde type/value.
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, min_people)
);

CREATE INDEX IF NOT EXISTS idx_campaign_tiers_campaign
  ON public.campaign_tiers(campaign_id, min_people DESC);

ALTER TABLE public.campaign_tiers ENABLE ROW LEVEL SECURITY;

-- Lectura pública: es parte de la oferta, igual que la campaña
DROP POLICY IF EXISTS "tiers_select" ON public.campaign_tiers;
CREATE POLICY "tiers_select" ON public.campaign_tiers FOR SELECT USING (true);

DROP POLICY IF EXISTS "tiers_manage" ON public.campaign_tiers;
CREATE POLICY "tiers_manage" ON public.campaign_tiers FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.campaigns c
    JOIN public.businesses b ON b.id = c.business_id
    WHERE c.id = campaign_tiers.campaign_id AND b.owner_user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.campaigns c
    JOIN public.businesses b ON b.id = c.business_id
    WHERE c.id = campaign_tiers.campaign_id AND b.owner_user_id = auth.uid()
  ));

-- Etiqueta legible a partir del tipo y el valor
CREATE OR REPLACE FUNCTION public.tier_label(p_type text, p_value numeric)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$
  SELECT CASE p_type
    WHEN 'percent'      THEN trim(to_char(p_value, 'FM999990.99')) || '% OFF'
    WHEN 'fixed'        THEN '$' || trim(to_char(p_value, 'FM999G999G990')) || ' OFF'
    WHEN 'two_for_one'  THEN '2x1'
    WHEN 'free_item'    THEN 'Producto gratis'
    ELSE 'Beneficio'
  END;
$$;

-- ============================================================
-- 4. ¿APLICA LA PROMO AHORA, PARA ESTE GRUPO?
--
-- Una sola función que responde todo lo que la app necesita saber:
-- la usa la ficha de la promo, el detalle del plan (para mostrar cuánta
-- gente falta) y el check-in (para calcular el descuento real).
-- ============================================================

CREATE OR REPLACE FUNCTION public.campaign_offer(
  p_campaign_id uuid,
  p_party_size  int DEFAULT 1,
  p_at          timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  c          public.campaigns%ROWTYPE;
  tz         text;
  local_ts   timestamp;
  local_dow  int;
  local_time time;
  v_tier     public.campaign_tiers%ROWTYPE;
  v_next     public.campaign_tiers%ROWTYPE;
  reasons    text[] := '{}';
BEGIN
  SELECT * INTO c FROM public.campaigns WHERE id = p_campaign_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La promo no existe');
  END IF;

  SELECT b.timezone INTO tz FROM public.businesses b WHERE b.id = c.business_id;
  tz := COALESCE(tz, 'America/Argentina/Catamarca');

  -- Hora local DEL NEGOCIO, no UTC ni la del teléfono
  local_ts   := p_at AT TIME ZONE tz;
  local_dow  := EXTRACT(DOW FROM local_ts)::int;
  local_time := local_ts::time;

  -- --- condiciones que no dependen del grupo ---
  IF c.status <> 'active' THEN
    reasons := reasons || 'La promo no está activa';
  END IF;
  IF p_at < c.starts_at THEN
    reasons := reasons || 'Todavía no empezó';
  END IF;
  IF p_at > c.ends_at THEN
    reasons := reasons || 'Ya terminó';
  END IF;
  IF c.valid_weekdays IS NOT NULL AND NOT (local_dow = ANY (c.valid_weekdays)) THEN
    reasons := reasons || 'No aplica este día de la semana';
  END IF;
  IF c.valid_from_time IS NOT NULL AND local_time < c.valid_from_time THEN
    reasons := reasons || ('Aplica desde las ' || to_char(c.valid_from_time, 'HH24:MI'));
  END IF;
  IF c.valid_until_time IS NOT NULL AND local_time > c.valid_until_time THEN
    reasons := reasons || ('Aplica hasta las ' || to_char(c.valid_until_time, 'HH24:MI'));
  END IF;
  IF c.max_redemptions_total IS NOT NULL AND c.redemptions_count >= c.max_redemptions_total THEN
    reasons := reasons || 'Se agotaron los cupos';
  END IF;

  -- --- el mejor escalón que alcanza este grupo ---
  SELECT * INTO v_tier FROM public.campaign_tiers t
  WHERE t.campaign_id = p_campaign_id AND t.min_people <= p_party_size
  ORDER BY t.min_people DESC LIMIT 1;

  -- --- el siguiente escalón, para poder decir "faltan N" ---
  SELECT * INTO v_next FROM public.campaign_tiers t
  WHERE t.campaign_id = p_campaign_id AND t.min_people > p_party_size
  ORDER BY t.min_people ASC LIMIT 1;

  RETURN jsonb_build_object(
    'ok', array_length(reasons, 1) IS NULL AND v_tier.id IS NOT NULL,
    'reasons', to_jsonb(reasons),
    'party_size', p_party_size,
    'local_time', to_char(local_time, 'HH24:MI'),
    'timezone', tz,
    'tier', CASE WHEN v_tier.id IS NULL THEN NULL ELSE jsonb_build_object(
      'min_people',     v_tier.min_people,
      'discount_type',  v_tier.discount_type,
      'discount_value', v_tier.discount_value,
      'label', COALESCE(v_tier.label, public.tier_label(v_tier.discount_type, v_tier.discount_value))
    ) END,
    'next_tier', CASE WHEN v_next.id IS NULL THEN NULL ELSE jsonb_build_object(
      'min_people',  v_next.min_people,
      'people_missing', v_next.min_people - p_party_size,
      'label', COALESCE(v_next.label, public.tier_label(v_next.discount_type, v_next.discount_value))
    ) END,
    'slots_left', CASE WHEN c.max_redemptions_total IS NULL THEN NULL
                       ELSE GREATEST(0, c.max_redemptions_total - c.redemptions_count) END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.campaign_offer(uuid, int, timestamptz) TO authenticated, anon;

-- ============================================================
-- 5. CHECK-IN QUE APLICA EL DESCUENTO
--
-- redeem_reservation() ya validaba la reserva y sumaba el sello. Ahora
-- además calcula qué descuento corresponde al grupo que efectivamente se
-- presentó, y lo deja registrado en redemptions.
-- ============================================================

ALTER TABLE public.redemptions
  ADD COLUMN IF NOT EXISTS party_size int,
  ADD COLUMN IF NOT EXISTS discount_type text,
  ADD COLUMN IF NOT EXISTS discount_value numeric,
  ADD COLUMN IF NOT EXISTS discount_label text;

CREATE OR REPLACE FUNCTION public.redeem_reservation(p_code text, p_party_size int DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_res       public.reservations%ROWTYPE;
  v_business  public.businesses%ROWTYPE;
  v_card      public.loyalty_cards%ROWTYPE;
  v_stamp     public.loyalty_stamps%ROWTYPE;
  v_code      text;
  v_user_name text;
  v_party     int;
  v_offer     jsonb;
  v_tier      jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  v_code := upper(trim(COALESCE(p_code, '')));
  IF v_code LIKE 'PINTO:%' THEN
    v_code := substr(v_code, 7);
  END IF;

  SELECT * INTO v_res FROM public.reservations r WHERE r.checkin_code = v_code;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Código inválido');
  END IF;

  SELECT b.* INTO v_business
  FROM public.campaigns c JOIN public.businesses b ON b.id = c.business_id
  WHERE c.id = v_res.campaign_id;

  IF NOT FOUND OR v_business.owner_user_id <> auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Esta reserva no es de tu negocio');
  END IF;

  IF v_res.status = 'completed' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Esta reserva ya fue validada');
  END IF;
  IF v_res.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Esta reserva está cancelada');
  END IF;

  -- El negocio puede corregir cuánta gente vino realmente: lo que importa
  -- para el descuento es el grupo que se presentó, no el que reservó.
  v_party := GREATEST(1, COALESCE(p_party_size, v_res.party_size, 1));

  v_offer := public.campaign_offer(v_res.campaign_id, v_party);
  v_tier  := v_offer -> 'tier';

  UPDATE public.reservations
  SET status = 'completed', party_size = v_party
  WHERE id = v_res.id;

  INSERT INTO public.checkins (campaign_id, user_id, business_id, reservation_id, method)
  VALUES (v_res.campaign_id, v_res.user_id, v_business.id, v_res.id, 'qr');

  -- Queda registrado el beneficio efectivamente otorgado
  IF (v_offer ->> 'ok')::boolean AND v_tier IS NOT NULL THEN
    INSERT INTO public.redemptions (
      campaign_id, user_id, business_id, status,
      party_size, discount_type, discount_value, discount_label)
    VALUES (
      v_res.campaign_id, v_res.user_id, v_business.id, 'completed',
      v_party, v_tier ->> 'discount_type', (v_tier ->> 'discount_value')::numeric,
      v_tier ->> 'label');

    UPDATE public.campaigns
    SET redemptions_count = redemptions_count + 1
    WHERE id = v_res.campaign_id;
  END IF;

  -- Sello de fidelidad
  SELECT * INTO v_card FROM public.loyalty_cards lc
  WHERE lc.business_id = v_business.id AND lc.is_active
  ORDER BY lc.created_at LIMIT 1;

  IF FOUND THEN
    INSERT INTO public.loyalty_stamps (card_id, user_id, stamps_count)
    VALUES (v_card.id, v_res.user_id, 1)
    ON CONFLICT (card_id, user_id) DO UPDATE
      SET stamps_count = loyalty_stamps.stamps_count + 1
    RETURNING * INTO v_stamp;
  END IF;

  SELECT p.full_name INTO v_user_name FROM public.profiles p WHERE p.id = v_res.user_id;

  PERFORM public.enqueue_notification(
    v_res.user_id,
    'Check-in confirmado',
    'Validaste tu reserva en ' || v_business.name ||
      CASE WHEN (v_offer ->> 'ok')::boolean AND v_tier IS NOT NULL
           THEN ' con ' || (v_tier ->> 'label') ELSE '' END ||
      CASE WHEN v_stamp.id IS NOT NULL
           THEN '. Sellos: ' || v_stamp.stamps_count || '/' || v_card.stamps_required
           ELSE '' END,
    '/reservas',
    jsonb_build_object('type', 'checkin', 'reservationId', v_res.id)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'user_name', COALESCE(v_user_name, 'Usuario'),
    'party_size', v_party,
    'reservation_id', v_res.id,
    'offer', v_offer,
    'stamps', CASE WHEN v_stamp.id IS NULL THEN NULL ELSE jsonb_build_object(
      'stamp_id', v_stamp.id,
      'current', v_stamp.stamps_count,
      'required', v_card.stamps_required,
      'reward', v_card.reward,
      'ready', v_stamp.stamps_count >= v_card.stamps_required AND NOT v_stamp.redeemed
    ) END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_reservation(text, int) FROM public;
GRANT EXECUTE ON FUNCTION public.redeem_reservation(text, int) TO authenticated;

-- ============================================================
-- 6. MONETIZACIÓN: los planes de suscripción dejan de ser decorativos
--
-- pricing_plans y business_subscriptions existían desde la 001 y nadie las
-- leía: cualquier negocio podía publicar campañas sin límite. Acá se
-- enforzan a nivel base, que es el único lugar donde no se pueden saltear
-- desde el cliente.
-- ============================================================

-- Asegurar los planes base (la 001 los insertaba sin ON CONFLICT)
INSERT INTO public.pricing_plans (name, slug, price_monthly, max_campaigns, max_featured, features)
VALUES
  ('Gratis',  'free',     0,     2,  0, '{"analytics": false, "loyalty": false, "tiers": 1}'::jsonb),
  ('Starter', 'starter',  4999, 10,  2, '{"analytics": true,  "loyalty": true,  "tiers": 3}'::jsonb),
  ('Pro',     'pro',     12999, 50, 10, '{"analytics": true,  "loyalty": true,  "tiers": 10, "priority_support": true}'::jsonb)
ON CONFLICT (slug) DO UPDATE
  SET max_campaigns = EXCLUDED.max_campaigns,
      max_featured  = EXCLUDED.max_featured,
      features      = EXCLUDED.features;

/** Plan vigente de un negocio. Sin suscripción activa, 'free'. */
CREATE OR REPLACE FUNCTION public.business_plan(p_business_id uuid)
RETURNS public.pricing_plans
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT p.* FROM public.pricing_plans p
  WHERE p.id = (
    SELECT s.plan_id FROM public.business_subscriptions s
    WHERE s.business_id = p_business_id
      AND s.status = 'active'
      AND (s.ends_at IS NULL OR s.ends_at > now())
    ORDER BY s.starts_at DESC LIMIT 1
  )
  UNION ALL
  SELECT p.* FROM public.pricing_plans p
  WHERE p.slug = 'free' AND NOT EXISTS (
    SELECT 1 FROM public.business_subscriptions s
    WHERE s.business_id = p_business_id
      AND s.status = 'active'
      AND (s.ends_at IS NULL OR s.ends_at > now())
  )
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.business_plan(uuid) TO authenticated;

/** Límites y consumo actual, para que el panel los muestre. */
CREATE OR REPLACE FUNCTION public.business_limits(p_business_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_plan     public.pricing_plans;
  v_active   int;
  v_featured int;
BEGIN
  v_plan := public.business_plan(p_business_id);

  SELECT count(*) INTO v_active FROM public.campaigns c
  WHERE c.business_id = p_business_id AND c.status = 'active';

  SELECT count(*) INTO v_featured FROM public.campaigns c
  WHERE c.business_id = p_business_id AND c.is_featured;

  RETURN jsonb_build_object(
    'plan',           jsonb_build_object('slug', v_plan.slug, 'name', v_plan.name,
                                         'price_monthly', v_plan.price_monthly,
                                         'features', v_plan.features),
    'campaigns',      jsonb_build_object('used', v_active,   'max', v_plan.max_campaigns),
    'featured',       jsonb_build_object('used', v_featured, 'max', v_plan.max_featured),
    'can_create',     v_plan.max_campaigns IS NULL OR v_active < v_plan.max_campaigns,
    'max_tiers',      COALESCE((v_plan.features ->> 'tiers')::int, 1)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.business_limits(uuid) TO authenticated;

/**
 * Impide superar el cupo de campañas activas del plan.
 *
 * Se hace en un trigger y no en el cliente porque el cliente es un APK con
 * la anon key adentro: cualquier límite que solo viva ahí es decorativo.
 */
CREATE OR REPLACE FUNCTION public.enforce_campaign_quota()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_plan   public.pricing_plans;
  v_active int;
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
  IF v_plan.max_campaigns IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_active FROM public.campaigns c
  WHERE c.business_id = NEW.business_id AND c.status = 'active' AND c.id <> NEW.id;

  IF v_active >= v_plan.max_campaigns THEN
    RAISE EXCEPTION
      'Tu plan % permite % promo(s) activa(s) a la vez. Pausá una o mejorá el plan.',
      v_plan.name, v_plan.max_campaigns
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_campaign_quota ON public.campaigns;
CREATE TRIGGER on_campaign_quota
  BEFORE INSERT OR UPDATE OF status ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.enforce_campaign_quota();

/** Lo mismo para la cantidad de escalones, que también es del plan. */
CREATE OR REPLACE FUNCTION public.enforce_tier_quota()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_business uuid;
  v_max      int;
  v_count    int;
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  SELECT c.business_id INTO v_business FROM public.campaigns c WHERE c.id = NEW.campaign_id;
  -- Los paréntesis alrededor de la llamada son obligatorios: sin ellos,
  -- `funcion(x).campo` es un error de sintaxis en plpgsql.
  v_max := COALESCE(((public.business_plan(v_business)).features ->> 'tiers')::int, 1);

  SELECT count(*) INTO v_count FROM public.campaign_tiers t
  WHERE t.campaign_id = NEW.campaign_id AND t.id <> NEW.id;

  IF v_count >= v_max THEN
    RAISE EXCEPTION 'Tu plan permite % escalón(es) de descuento por promo.', v_max
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_tier_quota ON public.campaign_tiers;
CREATE TRIGGER on_tier_quota
  BEFORE INSERT ON public.campaign_tiers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tier_quota();

-- El negocio necesita ver su propia suscripción (la policy de 001 ya lo
-- permite) y el catálogo de planes para poder comparar y mejorar.
DROP POLICY IF EXISTS "subs_insert_own" ON public.business_subscriptions;
CREATE POLICY "subs_insert_own" ON public.business_subscriptions FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = business_subscriptions.business_id AND b.owner_user_id = auth.uid()
  ));

-- ============================================================
-- 7. MÉTRICAS DE CONVERSIÓN PARA EL NEGOCIO
--
-- Lo que justifica pagar una suscripción: ver que la promo trae gente.
-- vistas → reservas → check-ins → descuento entregado.
-- ============================================================

CREATE OR REPLACE FUNCTION public.campaign_funnel(p_campaign_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_business uuid;
  v_views int; v_reservations int; v_checkins int; v_redemptions int;
  v_people int; v_plans int;
BEGIN
  SELECT c.business_id INTO v_business FROM public.campaigns c WHERE c.id = p_campaign_id;
  IF NOT EXISTS (SELECT 1 FROM public.businesses b
                 WHERE b.id = v_business AND b.owner_user_id = auth.uid())
     AND public.get_user_role() <> 'admin' THEN
    RETURN jsonb_build_object('error', 'No es tu promo');
  END IF;

  SELECT count(*) INTO v_views FROM public.analytics_events e
  WHERE e.campaign_id = p_campaign_id AND e.event_type = 'campaign_view';

  SELECT count(*), COALESCE(sum(r.party_size), 0) INTO v_reservations, v_people
  FROM public.reservations r WHERE r.campaign_id = p_campaign_id AND r.status <> 'cancelled';

  SELECT count(*) INTO v_checkins FROM public.checkins k WHERE k.campaign_id = p_campaign_id;
  SELECT count(*) INTO v_redemptions FROM public.redemptions d WHERE d.campaign_id = p_campaign_id;

  -- Cuántos planes sociales se armaron alrededor de esta promo: es la
  -- métrica propia de Pintó, la que no da ningún cupón tradicional.
  SELECT count(*) INTO v_plans FROM public.social_plans sp WHERE sp.campaign_id = p_campaign_id;

  RETURN jsonb_build_object(
    'views', v_views,
    'plans_created', v_plans,
    'reservations', v_reservations,
    'people_reserved', v_people,
    'checkins', v_checkins,
    'redemptions', v_redemptions,
    'conversion_view_to_reservation',
      CASE WHEN v_views > 0 THEN round((v_reservations::numeric / v_views) * 100, 1) ELSE NULL END,
    'conversion_reservation_to_checkin',
      CASE WHEN v_reservations > 0 THEN round((v_checkins::numeric / v_reservations) * 100, 1) ELSE NULL END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.campaign_funnel(uuid) TO authenticated;

-- ============================================================
-- 8. MIGRACIÓN DE LO QUE YA EXISTE
--
-- Las campañas viejas tienen min_group_size y price_text. Se les arma un
-- escalón para que no queden sin oferta estructurada.
-- ============================================================

INSERT INTO public.campaign_tiers (campaign_id, min_people, discount_type, discount_value, label)
SELECT c.id,
       GREATEST(1, COALESCE(c.min_group_size, 1)),
       'free_item',
       NULL,
       COALESCE(NULLIF(trim(c.price_text), ''), 'Beneficio')
FROM public.campaigns c
WHERE NOT EXISTS (SELECT 1 FROM public.campaign_tiers t WHERE t.campaign_id = c.id)
ON CONFLICT (campaign_id, min_people) DO NOTHING;

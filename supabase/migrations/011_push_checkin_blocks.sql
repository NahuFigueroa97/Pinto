-- ============================================================
-- PINTÓ — 011: Push (FCM), check-in con QR, fidelidad y bloqueos
-- Ejecutar DESPUÉS de 010_security_fixes.sql
-- ============================================================

-- ============================================================
-- PREFLIGHT: verificar que estén las migraciones previas
--
-- Sin esto, si falta una tabla el script se muere a mitad de camino con un
-- 42P01 críptico ("relation public.X does not exist") y —como el SQL Editor
-- de Supabase corre todo en una transacción— se revierte lo que ya había
-- aplicado, sin decir qué falta.
-- Esto falla de entrada y lista TODO lo que falta de una sola vez.
-- Para ver el estado completo: correr 000_diagnostico.sql
-- ============================================================

DO $preflight$
DECLARE
  faltan text[] := '{}';
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('profiles', '001_schema.sql'),
      ('businesses', '001_schema.sql'),
      ('campaigns', '001_schema.sql'),
      ('reservations', '001_schema.sql'),
      ('checkins', '001_schema.sql'),
      ('redemptions', '001_schema.sql'),
      ('analytics_events', '001_schema.sql'),
      ('social_plans', '003_sprint2.sql'),
      ('social_plan_members', '003_sprint2.sql'),
      ('business_messages', '005_business_messages.sql'),
      ('plan_chat_messages', '008_v3_features.sql'),
      ('plan_reviews', '008_v3_features.sql'),
      ('plan_photos', '008_v3_features.sql'),
      ('activity_feed', '008_v3_features.sql'),
      ('user_reports', '008_v3_features.sql'),
      ('loyalty_cards', '008_v3_features.sql'),
      ('loyalty_stamps', '008_v3_features.sql')
    ) AS v(objeto, migracion)
  LOOP
    IF to_regclass('public.' || quote_ident(r.objeto)) IS NULL THEN
      faltan := faltan || format('tabla public.%s  →  corré %s primero', r.objeto, r.migracion);
    END IF;
  END LOOP;

  FOR r IN
    SELECT * FROM (VALUES
      ('cleanup_old_messages', '006_campaign_delete_and_cleanup.sql'),
      ('cleanup_old_chat_messages', '009_auto_cleanup.sql'),
      ('cleanup_old_feed', '009_auto_cleanup.sql'),
      ('cleanup_old_reports', '009_auto_cleanup.sql'),
      ('cleanup_expired_plans', '009_auto_cleanup.sql'),
      ('protect_profile_columns', '010_security_fixes.sql')
    ) AS v(objeto, migracion)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = r.objeto
    ) THEN
      faltan := faltan || format('función public.%s()  →  corré %s primero', r.objeto, r.migracion);
    END IF;
  END LOOP;

  IF array_length(faltan, 1) > 0 THEN
    RAISE EXCEPTION E'La base no tiene aplicadas todas las migraciones previas.\n\nFalta:\n  - %\n\nCorré esas migraciones y volvé a intentar.',
      array_to_string(faltan, E'\n  - ');
  END IF;
END;
$preflight$;

-- ============================================================
-- 1. TOKENS DE DISPOSITIVO PARA FCM
--
-- La doc (docs/FCM_PUSH_NOTIFICATIONS.md) proponía una columna
-- profiles.fcm_token, pero:
--   a) nunca se creó → el push jamás funcionó;
--   b) "profiles_select USING (true)" la habría dejado pública,
--      o sea el token de push de cualquiera legible por cualquiera.
-- Va en tabla aparte, sin lectura pública, y con una fila por
-- dispositivo (un usuario puede tener teléfono + tablet).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.device_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  platform text NOT NULL DEFAULT 'android' CHECK (platform IN ('android', 'ios', 'web')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_device_tokens_user ON public.device_tokens(user_id);

ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

-- Nada de SELECT público: solo el dueño ve sus propios tokens.
-- El envío se hace desde la Edge Function con la service_role key,
-- que omite RLS.
DROP POLICY IF EXISTS "device_tokens_select_own" ON public.device_tokens;
CREATE POLICY "device_tokens_select_own" ON public.device_tokens FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "device_tokens_insert_own" ON public.device_tokens;
CREATE POLICY "device_tokens_insert_own" ON public.device_tokens FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "device_tokens_update_own" ON public.device_tokens;
CREATE POLICY "device_tokens_update_own" ON public.device_tokens FOR UPDATE
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "device_tokens_delete_own" ON public.device_tokens;
CREATE POLICY "device_tokens_delete_own" ON public.device_tokens FOR DELETE
  USING (user_id = auth.uid());

-- Alta/renovación del token. FCM rota el token y el mismo aparato
-- puede cambiar de usuario: si el token ya existía se reasigna.
CREATE OR REPLACE FUNCTION public.register_device_token(p_token text, p_platform text DEFAULT 'android')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;
  IF p_token IS NULL OR length(p_token) < 20 THEN
    RAISE EXCEPTION 'Token inválido';
  END IF;

  INSERT INTO public.device_tokens (user_id, token, platform)
  VALUES (auth.uid(), p_token, COALESCE(p_platform, 'android'))
  ON CONFLICT (token) DO UPDATE
    SET user_id = auth.uid(),
        platform = COALESCE(p_platform, 'android'),
        updated_at = now();
END;
$$;

-- Baja al cerrar sesión: si no se borra, el próximo usuario de ese
-- teléfono recibe los push del anterior.
CREATE OR REPLACE FUNCTION public.unregister_device_token(p_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.device_tokens
  WHERE token = p_token AND user_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.register_device_token(text, text) FROM public;
REVOKE ALL ON FUNCTION public.unregister_device_token(text) FROM public;
GRANT EXECUTE ON FUNCTION public.register_device_token(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unregister_device_token(text) TO authenticated;

-- ============================================================
-- 2. COLA DE NOTIFICACIONES
--
-- La Edge Function lee de acá y manda a FCM. Los triggers de abajo
-- encolan eventos (mensaje nuevo, reserva nueva, solicitud de plan).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.notification_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  route text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_notif_queue_pending
  ON public.notification_queue(created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_notif_queue_user ON public.notification_queue(user_id, created_at DESC);

ALTER TABLE public.notification_queue ENABLE ROW LEVEL SECURITY;

-- Solo el destinatario puede leer sus notificaciones. Nadie encola
-- desde el cliente: los triggers son SECURITY DEFINER.
DROP POLICY IF EXISTS "notif_queue_select_own" ON public.notification_queue;
CREATE POLICY "notif_queue_select_own" ON public.notification_queue FOR SELECT
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.enqueue_notification(
  p_user_id uuid, p_title text, p_body text, p_route text DEFAULT NULL, p_data jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF p_user_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.notification_queue (user_id, title, body, route, data)
  VALUES (p_user_id, p_title, left(p_body, 240), p_route, COALESCE(p_data, '{}'::jsonb));
END;
$$;

-- --- Trigger: mensaje nuevo en la bandeja del negocio / del usuario ---
CREATE OR REPLACE FUNCTION public.notify_on_business_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  biz_owner uuid;
  biz_name  text;
  sender_name text;
BEGIN
  SELECT b.owner_user_id, b.name INTO biz_owner, biz_name
  FROM public.businesses b WHERE b.id = NEW.business_id;

  IF NEW.sender_role = 'user' THEN
    SELECT p.full_name INTO sender_name FROM public.profiles p WHERE p.id = NEW.user_id;
    PERFORM public.enqueue_notification(
      biz_owner,
      COALESCE(NULLIF(sender_name, ''), 'Nuevo mensaje'),
      NEW.message,
      '/negocio/mensajes',
      jsonb_build_object('type', 'business_message', 'businessId', NEW.business_id)
    );
  ELSE
    PERFORM public.enqueue_notification(
      NEW.user_id,
      COALESCE(NULLIF(biz_name, ''), 'Respuesta del negocio'),
      NEW.message,
      '/mensajes',
      jsonb_build_object('type', 'business_reply', 'businessId', NEW.business_id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_business_message_notify ON public.business_messages;
CREATE TRIGGER on_business_message_notify
  AFTER INSERT ON public.business_messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_business_message();

-- --- Trigger: reserva nueva ---
CREATE OR REPLACE FUNCTION public.notify_on_reservation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  biz_owner uuid;
  camp_title text;
  user_name text;
BEGIN
  SELECT b.owner_user_id, c.title INTO biz_owner, camp_title
  FROM public.campaigns c JOIN public.businesses b ON b.id = c.business_id
  WHERE c.id = NEW.campaign_id;

  SELECT p.full_name INTO user_name FROM public.profiles p WHERE p.id = NEW.user_id;

  PERFORM public.enqueue_notification(
    biz_owner,
    'Nueva reserva',
    COALESCE(NULLIF(user_name, ''), 'Alguien') || ' reservó ' ||
      COALESCE(camp_title, 'tu promo') || ' (' || NEW.party_size || ' pers.)',
    '/negocio/reservas',
    jsonb_build_object('type', 'reservation', 'reservationId', NEW.id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_reservation_notify ON public.reservations;
CREATE TRIGGER on_reservation_notify
  AFTER INSERT ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_reservation();

-- --- Trigger: solicitud para unirse a un plan, y su respuesta ---
CREATE OR REPLACE FUNCTION public.notify_on_plan_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  plan_title text;
  plan_creator uuid;
  who text;
BEGIN
  SELECT sp.title, sp.creator_id INTO plan_title, plan_creator
  FROM public.social_plans sp WHERE sp.id = NEW.plan_id;

  IF TG_OP = 'INSERT' THEN
    SELECT p.full_name INTO who FROM public.profiles p WHERE p.id = NEW.user_id;
    PERFORM public.enqueue_notification(
      plan_creator,
      'Nueva solicitud',
      COALESCE(NULLIF(who, ''), 'Alguien') || ' quiere sumarse a "' || plan_title || '"',
      '/planes/detalle?id=' || NEW.plan_id,
      jsonb_build_object('type', 'plan_request', 'planId', NEW.plan_id)
    );
  ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('accepted', 'rejected') THEN
    PERFORM public.enqueue_notification(
      NEW.user_id,
      CASE WHEN NEW.status = 'accepted' THEN '¡Te aceptaron!' ELSE 'Solicitud rechazada' END,
      CASE WHEN NEW.status = 'accepted'
           THEN 'Ya sos parte de "' || plan_title || '"'
           ELSE 'Tu solicitud para "' || plan_title || '" no fue aceptada' END,
      '/planes/detalle?id=' || NEW.plan_id,
      jsonb_build_object('type', 'plan_request_response', 'planId', NEW.plan_id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_plan_request_notify ON public.social_plan_requests;
CREATE TRIGGER on_plan_request_notify
  AFTER INSERT OR UPDATE ON public.social_plan_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_plan_request();

-- --- Trigger: mensaje nuevo en el chat de un plan ---
CREATE OR REPLACE FUNCTION public.notify_on_plan_chat()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  plan_title text;
  sender_name text;
  member record;
BEGIN
  SELECT sp.title INTO plan_title FROM public.social_plans sp WHERE sp.id = NEW.plan_id;
  SELECT p.full_name INTO sender_name FROM public.profiles p WHERE p.id = NEW.user_id;

  FOR member IN
    SELECT m.user_id FROM public.social_plan_members m
    WHERE m.plan_id = NEW.plan_id AND m.user_id <> NEW.user_id
  LOOP
    -- No notificar a quien bloqueó al emisor (o viceversa)
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.user_blocks ub
      WHERE (ub.blocker_id = member.user_id AND ub.blocked_id = NEW.user_id)
         OR (ub.blocker_id = NEW.user_id AND ub.blocked_id = member.user_id)
    );
    PERFORM public.enqueue_notification(
      member.user_id,
      COALESCE(NULLIF(sender_name, ''), 'Mensaje') || ' · ' || COALESCE(plan_title, 'Plan'),
      NEW.content,
      '/planes/chat?id=' || NEW.plan_id,
      jsonb_build_object('type', 'plan_chat', 'planId', NEW.plan_id)
    );
  END LOOP;
  RETURN NEW;
END;
$$;

-- ============================================================
-- 3. BLOQUEO DE USUARIOS
--
-- Google Play exige, para apps sociales con contenido de usuarios,
-- un sistema in-app de denuncia Y de bloqueo. Solo existía denuncia.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (blocker_id, blocked_id),
  CONSTRAINT no_self_block CHECK (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker ON public.user_blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON public.user_blocks(blocked_id);

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blocks_select_own" ON public.user_blocks;
CREATE POLICY "blocks_select_own" ON public.user_blocks FOR SELECT
  USING (blocker_id = auth.uid());

DROP POLICY IF EXISTS "blocks_insert_own" ON public.user_blocks;
CREATE POLICY "blocks_insert_own" ON public.user_blocks FOR INSERT
  WITH CHECK (blocker_id = auth.uid());

DROP POLICY IF EXISTS "blocks_delete_own" ON public.user_blocks;
CREATE POLICY "blocks_delete_own" ON public.user_blocks FOR DELETE
  USING (blocker_id = auth.uid());

-- Se niega el acceso al chat en ambos sentidos si hay un bloqueo.
CREATE OR REPLACE FUNCTION public.is_blocked_pair(a uuid, b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_blocks ub
    WHERE (ub.blocker_id = a AND ub.blocked_id = b)
       OR (ub.blocker_id = b AND ub.blocked_id = a)
  );
$$;

-- Un usuario bloqueado no puede pedir unirse a los planes de quien lo bloqueó
DROP POLICY IF EXISTS "requests_insert" ON public.social_plan_requests;
CREATE POLICY "requests_insert" ON public.social_plan_requests FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM public.social_plans sp
      WHERE sp.id = social_plan_requests.plan_id
        AND public.is_blocked_pair(sp.creator_id, auth.uid())
    )
  );

-- El chat del plan ahora se registra después de crear user_blocks
DROP TRIGGER IF EXISTS on_plan_chat_notify ON public.plan_chat_messages;
CREATE TRIGGER on_plan_chat_notify
  AFTER INSERT ON public.plan_chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_plan_chat();

-- ============================================================
-- 4. CHECK-IN CON QR + SELLOS DE FIDELIDAD
--
-- Antes: /reservas/qr dibujaba un QR falso (no escaneable), no había
-- lector en el panel del negocio, y NADA en la app podía insertar en
-- loyalty_stamps, así que "Mis tarjetas" siempre salía vacía.
-- ============================================================

-- Código corto e imprimible para validar sin cámara
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS checkin_code text;

CREATE OR REPLACE FUNCTION public.gen_checkin_code()
RETURNS text LANGUAGE sql VOLATILE SET search_path = ''
AS $$
  -- 8 caracteres sin vocales ni caracteres ambiguos (0/O, 1/I/L)
  SELECT string_agg(substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ',
                           (floor(random() * 31) + 1)::int, 1), '')
  FROM generate_series(1, 8);
$$;

CREATE OR REPLACE FUNCTION public.set_checkin_code()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF NEW.checkin_code IS NULL THEN
    LOOP
      NEW.checkin_code := public.gen_checkin_code();
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.reservations r WHERE r.checkin_code = NEW.checkin_code
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_reservation_set_code ON public.reservations;
CREATE TRIGGER on_reservation_set_code
  BEFORE INSERT ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.set_checkin_code();

-- Backfill fila por fila para no chocar contra el índice único
DO $backfill$
DECLARE
  r record;
  c text;
BEGIN
  FOR r IN SELECT id FROM public.reservations WHERE checkin_code IS NULL LOOP
    LOOP
      c := public.gen_checkin_code();
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.reservations x WHERE x.checkin_code = c);
    END LOOP;
    UPDATE public.reservations SET checkin_code = c WHERE id = r.id;
  END LOOP;
END;
$backfill$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_reservations_checkin_code
  ON public.reservations(checkin_code);

-- Validación del check-in. Es SECURITY DEFINER porque tiene que
-- escribir en checkins y loyalty_stamps del usuario, cosa que el
-- negocio no puede hacer directamente por RLS.
CREATE OR REPLACE FUNCTION public.redeem_reservation(p_code text)
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
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  -- Acepta "PINTO:XXXXXXXX" (lo que codifica el QR) o el código pelado
  v_code := upper(trim(COALESCE(p_code, '')));
  IF v_code LIKE 'PINTO:%' THEN
    v_code := substr(v_code, 7);
  END IF;

  SELECT * INTO v_res FROM public.reservations r WHERE r.checkin_code = v_code;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Código inválido');
  END IF;

  -- El que valida tiene que ser el dueño del negocio de esa campaña
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

  UPDATE public.reservations SET status = 'completed' WHERE id = v_res.id;

  INSERT INTO public.checkins (campaign_id, user_id, business_id, reservation_id, method)
  VALUES (v_res.campaign_id, v_res.user_id, v_business.id, v_res.id, 'qr');

  -- Sumar un sello si el negocio tiene tarjeta activa
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
      CASE WHEN v_stamp.id IS NOT NULL
           THEN '. Sellos: ' || v_stamp.stamps_count || '/' || v_card.stamps_required
           ELSE '' END,
    '/reservas',
    jsonb_build_object('type', 'checkin', 'reservationId', v_res.id)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'user_name', COALESCE(v_user_name, 'Usuario'),
    'party_size', v_res.party_size,
    'reservation_id', v_res.id,
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

-- Canje del premio cuando la tarjeta se completa
CREATE OR REPLACE FUNCTION public.redeem_loyalty_card(p_stamp_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_stamp public.loyalty_stamps%ROWTYPE;
  v_card  public.loyalty_cards%ROWTYPE;
  v_biz   public.businesses%ROWTYPE;
BEGIN
  SELECT * INTO v_stamp FROM public.loyalty_stamps s WHERE s.id = p_stamp_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Tarjeta no encontrada');
  END IF;

  SELECT * INTO v_card FROM public.loyalty_cards c WHERE c.id = v_stamp.card_id;
  SELECT * INTO v_biz FROM public.businesses b WHERE b.id = v_card.business_id;

  IF v_biz.owner_user_id <> auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo el negocio puede canjear');
  END IF;
  IF v_stamp.redeemed THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Ya fue canjeada');
  END IF;
  IF v_stamp.stamps_count < v_card.stamps_required THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Todavía le faltan sellos');
  END IF;

  UPDATE public.loyalty_stamps
  SET redeemed = true, stamps_count = 0
  WHERE id = p_stamp_id;

  INSERT INTO public.redemptions (campaign_id, user_id, business_id, status)
  SELECT c.id, v_stamp.user_id, v_biz.id, 'completed'
  FROM public.campaigns c WHERE c.business_id = v_biz.id
  ORDER BY c.created_at DESC LIMIT 1;

  PERFORM public.enqueue_notification(
    v_stamp.user_id, 'Premio canjeado',
    'Canjeaste "' || v_card.reward || '" en ' || v_biz.name,
    '/fidelidad', jsonb_build_object('type', 'loyalty_redeem')
  );

  RETURN jsonb_build_object('ok', true, 'reward', v_card.reward);
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_reservation(text) FROM public;
REVOKE ALL ON FUNCTION public.redeem_loyalty_card(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.redeem_reservation(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_loyalty_card(uuid) TO authenticated;

-- El negocio necesita ver las tarjetas de sus clientes para canjear
DROP POLICY IF EXISTS "stamps_update" ON public.loyalty_stamps;
CREATE POLICY "stamps_update" ON public.loyalty_stamps FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.loyalty_cards c JOIN public.businesses b ON c.business_id = b.id
    WHERE c.id = loyalty_stamps.card_id AND b.owner_user_id = auth.uid()));

-- ============================================================
-- 5. BORRADO REAL DE CUENTA (requisito de Google Play)
--
-- La pantalla /perfil/eliminar decía "permanente e irreversible"
-- pero en la práctica no borraba casi nada: apuntaba a columnas
-- inexistentes (activity_feed.user_id, loyalty_cards.user_id),
-- varias tablas no tenían policy de DELETE (los DELETE devolvían 0
-- filas sin error) y el usuario de auth seguía existiendo, así que
-- podía volver a entrar.
-- ============================================================

CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  -- Contenido generado
  DELETE FROM public.plan_chat_messages WHERE user_id = uid;
  DELETE FROM public.plan_photos       WHERE user_id = uid;
  DELETE FROM public.plan_reviews      WHERE reviewer_id = uid OR reviewed_user_id = uid;
  DELETE FROM public.user_photos       WHERE user_id = uid;
  DELETE FROM public.user_interest_links WHERE user_id = uid;
  DELETE FROM public.activity_feed     WHERE actor_id = uid;
  DELETE FROM public.user_reports      WHERE reporter_id = uid;
  DELETE FROM public.user_blocks       WHERE blocker_id = uid OR blocked_id = uid;
  DELETE FROM public.business_messages WHERE user_id = uid;

  -- Actividad comercial
  DELETE FROM public.favorites     WHERE user_id = uid;
  DELETE FROM public.checkins      WHERE user_id = uid;
  DELETE FROM public.redemptions   WHERE user_id = uid;
  DELETE FROM public.loyalty_stamps WHERE user_id = uid;
  DELETE FROM public.reservations  WHERE user_id = uid;
  UPDATE public.analytics_events SET user_id = NULL WHERE user_id = uid;

  -- Planes sociales
  DELETE FROM public.social_plan_requests WHERE user_id = uid;
  DELETE FROM public.social_plan_members  WHERE user_id = uid;
  DELETE FROM public.social_plans         WHERE creator_id = uid;

  -- Push
  DELETE FROM public.device_tokens      WHERE user_id = uid;
  DELETE FROM public.notification_queue WHERE user_id = uid;

  -- Negocios del usuario (arrastra campañas, transacciones, tarjetas por FK)
  DELETE FROM public.businesses WHERE owner_user_id = uid;

  -- Archivos del usuario en Storage
  DELETE FROM storage.objects
  WHERE bucket_id = 'avatars' AND (storage.foldername(name))[1] = uid::text;
  DELETE FROM storage.objects
  WHERE bucket_id = 'plan-photos' AND split_part(storage.filename(name), '_', 1) = uid::text;

  -- Por último la identidad. profiles cae en cascada desde auth.users.
  DELETE FROM auth.users WHERE id = uid;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_account() FROM public;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

-- ============================================================
-- 6. Limpieza de la cola de notificaciones en el cron diario
-- ============================================================

CREATE OR REPLACE FUNCTION public.cleanup_notification_queue()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.notification_queue
  WHERE created_at < NOW() - INTERVAL '30 days';
  -- Los 'pending' viejos no se van a enviar nunca: se marcan
  UPDATE public.notification_queue SET status = 'skipped'
  WHERE status = 'pending' AND created_at < NOW() - INTERVAL '1 day';
END;
$$;

CREATE OR REPLACE FUNCTION public.run_all_cleanups()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  chat_count int; feed_count int; report_count int; plan_count int; notif_count int;
BEGIN
  SELECT COUNT(*) INTO chat_count FROM public.plan_chat_messages
    WHERE created_at < NOW() - INTERVAL '90 days';
  SELECT COUNT(*) INTO feed_count FROM public.activity_feed
    WHERE created_at < NOW() - INTERVAL '60 days';
  SELECT COUNT(*) INTO report_count FROM public.user_reports
    WHERE status IN ('resolved','dismissed') AND created_at < NOW() - INTERVAL '180 days';
  SELECT COUNT(*) INTO plan_count FROM public.social_plans
    WHERE status = 'open' AND plan_date < (CURRENT_DATE - INTERVAL '7 days');
  SELECT COUNT(*) INTO notif_count FROM public.notification_queue
    WHERE created_at < NOW() - INTERVAL '30 days';

  PERFORM public.cleanup_old_chat_messages();
  PERFORM public.cleanup_old_feed();
  PERFORM public.cleanup_old_reports();
  PERFORM public.cleanup_expired_plans();
  PERFORM public.cleanup_old_messages();
  PERFORM public.cleanup_notification_queue();

  RETURN jsonb_build_object(
    'chat_messages_deleted', chat_count,
    'feed_items_deleted', feed_count,
    'reports_deleted', report_count,
    'plans_closed', plan_count,
    'notifications_deleted', notif_count,
    'executed_at', NOW()
  );
END;
$$;

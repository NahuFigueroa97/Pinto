-- ============================================================
-- PINTÓ — 010: Correcciones de seguridad y RLS
-- Ejecutar DESPUÉS de 009_auto_cleanup.sql
--
-- Este archivo corrige agujeros de seguridad reales encontrados
-- en la auditoría previa a la publicación en Google Play.
-- Es idempotente: se puede volver a ejecutar sin romper nada.
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
      ('cleanup_expired_plans', '009_auto_cleanup.sql')
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
-- 0. get_user_role() con search_path fijo
--
-- Estaba declarada SECURITY DEFINER sin SET search_path. Una función definer
-- con search_path mutable es escalable: quien pueda influir en el search_path
-- de la sesión puede hacer que "public.profiles" resuelva a otra tabla. Y esta
-- función es la que deciden usar casi todas las policies de admin.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT p.role FROM public.profiles p WHERE p.id = auth.uid();
$$;

-- ============================================================
-- 1. ESCALADA DE PRIVILEGIOS EN profiles
--
-- Problema: "profiles_update_own" permite que un usuario haga
--   update({ role: 'admin' }) sobre su propia fila. La anon key
--   viaja dentro del APK, así que cualquiera podía volverse admin
--   con una sola llamada HTTP. Lo mismo con is_verified (insignia
--   falsa) y reputation_score (reputación inflada).
--
-- RLS no puede comparar OLD vs NEW, así que se resuelve con un
-- trigger BEFORE UPDATE que revierte las columnas privilegiadas.
-- ============================================================

-- OJO: SECURITY INVOKER a propósito, NO definer.
-- Dentro de una función SECURITY DEFINER, current_user es siempre el dueño
-- (postgres), así que el guard de abajo daría true siempre y la protección
-- no se aplicaría nunca. Como invoker, current_user es el rol que ejecuta
-- el UPDATE:
--   'authenticated'  → viene de la app, se protege
--   'postgres'       → viene de otro trigger SECURITY DEFINER
--                      (update_plan_counters, update_reputation_from_review),
--                      que necesita poder tocar los contadores.
CREATE OR REPLACE FUNCTION public.protect_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  -- PostgREST hace SET LOCAL ROLE con el rol del JWT; el GUC
  -- request.jwt.claim.role está deprecado desde PostgREST 9, por eso se
  -- mira current_user.
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF public.get_user_role() = 'admin' THEN
    RETURN NEW;  -- los admins sí pueden moderar estas columnas
  END IF;

  -- Un usuario común solo puede pasar de 'user' a 'business' (alta de negocio).
  -- Cualquier otro cambio de rol se descarta en silencio.
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT (OLD.role = 'user' AND NEW.role = 'business') THEN
      NEW.role := OLD.role;
    END IF;
  END IF;

  -- Columnas que solo puede tocar el sistema o un admin
  NEW.is_verified        := OLD.is_verified;
  NEW.reputation_score   := OLD.reputation_score;
  NEW.plans_created_count := OLD.plans_created_count;
  NEW.plans_joined_count  := OLD.plans_joined_count;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_update_protect ON public.profiles;
CREATE TRIGGER on_profile_update_protect
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_columns();

-- El admin necesita poder actualizar perfiles ajenos (verificar identidad).
DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;
CREATE POLICY "profiles_update_admin" ON public.profiles FOR UPDATE
  USING (public.get_user_role() = 'admin')
  WITH CHECK (public.get_user_role() = 'admin');

-- ============================================================
-- 2. ESCALADA DE PRIVILEGIOS EN EL ALTA (signup)
--
-- Problema: handle_new_user copiaba raw_user_meta_data->>'role'
--   sin validar. Un POST directo a /auth/v1/signup con
--   { data: { role: 'admin' } } creaba un admin.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  requested_role text;
BEGIN
  requested_role := COALESCE(NEW.raw_user_meta_data ->> 'role', 'user');

  -- Lista blanca: en el alta nunca se puede pedir 'admin'
  IF requested_role NOT IN ('user', 'business') THEN
    requested_role := 'user';
  END IF;

  INSERT INTO public.profiles (id, full_name, role, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    requested_role,
    NEW.raw_user_meta_data ->> 'avatar_url'
  );
  RETURN NEW;
END;
$$;

-- ============================================================
-- 3. POLÍTICAS RLS ROTAS POR SOMBREADO DE COLUMNAS
--
-- Problema: en "SELECT 1 FROM social_plan_members m WHERE m.plan_id = plan_id"
--   el plan_id sin calificar resuelve a m.plan_id (el scope interno gana),
--   o sea "m.plan_id = m.plan_id" → siempre verdadero.
--   Resultado: cualquiera que fuera miembro de UN plan podía leer el chat
--   privado de TODOS los planes. Mismo bug en reviews y fotos.
--
--   Y al revés en plans_select: "m.plan_id = id" resolvía a m.id,
--   así que la rama de miembros nunca daba verdadero (falla cerrada).
-- ============================================================

DROP POLICY IF EXISTS "chat_select" ON public.plan_chat_messages;
CREATE POLICY "chat_select" ON public.plan_chat_messages FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.social_plan_members m
    WHERE m.plan_id = plan_chat_messages.plan_id AND m.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "chat_insert" ON public.plan_chat_messages;
CREATE POLICY "chat_insert" ON public.plan_chat_messages FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.social_plan_members m
      WHERE m.plan_id = plan_chat_messages.plan_id AND m.user_id = auth.uid()
    )
  );

-- Faltaba: poder borrar el propio mensaje (requisito de moderación de Play)
DROP POLICY IF EXISTS "chat_delete_own" ON public.plan_chat_messages;
CREATE POLICY "chat_delete_own" ON public.plan_chat_messages FOR DELETE
  USING (user_id = auth.uid() OR public.get_user_role() = 'admin');

DROP POLICY IF EXISTS "reviews_insert" ON public.plan_reviews;
CREATE POLICY "reviews_insert" ON public.plan_reviews FOR INSERT
  WITH CHECK (
    reviewer_id = auth.uid()
    AND reviewed_user_id <> auth.uid()          -- no auto-valorarse
    AND EXISTS (
      SELECT 1 FROM public.social_plan_members m
      WHERE m.plan_id = plan_reviews.plan_id AND m.user_id = auth.uid()
    )
    AND EXISTS (                                 -- el valorado también participó
      SELECT 1 FROM public.social_plan_members m2
      WHERE m2.plan_id = plan_reviews.plan_id AND m2.user_id = plan_reviews.reviewed_user_id
    )
  );

DROP POLICY IF EXISTS "reviews_delete" ON public.plan_reviews;
CREATE POLICY "reviews_delete" ON public.plan_reviews FOR DELETE
  USING (reviewer_id = auth.uid() OR public.get_user_role() = 'admin');

DROP POLICY IF EXISTS "plan_photos_insert" ON public.plan_photos;
CREATE POLICY "plan_photos_insert" ON public.plan_photos FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.social_plan_members m
      WHERE m.plan_id = plan_photos.plan_id AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "plans_select" ON public.social_plans;
CREATE POLICY "plans_select" ON public.social_plans FOR SELECT
  USING (
    visibility = 'public'
    OR creator_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.social_plan_members m
      WHERE m.plan_id = social_plans.id AND m.user_id = auth.uid()
    )
  );

-- ============================================================
-- 4. FEED DE ACTIVIDAD: suplantación y fuga de planes privados
--
-- Problema A: "feed_insert WITH CHECK (true)" dejaba insertar
--   entradas con cualquier actor_id → suplantación de identidad.
-- Problema B: el trigger publicaba en el feed público el título
--   de los planes marcados como privados.
-- ============================================================

DROP POLICY IF EXISTS "feed_insert" ON public.activity_feed;
CREATE POLICY "feed_insert" ON public.activity_feed FOR INSERT
  WITH CHECK (actor_id = auth.uid());

DROP POLICY IF EXISTS "feed_delete_own" ON public.activity_feed;
CREATE POLICY "feed_delete_own" ON public.activity_feed FOR DELETE
  USING (actor_id = auth.uid() OR public.get_user_role() = 'admin');

CREATE OR REPLACE FUNCTION public.feed_on_plan_create()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NEW.visibility <> 'public' THEN
    RETURN NEW;   -- los planes privados no se publican en el feed
  END IF;
  INSERT INTO public.activity_feed (actor_id, action, target_type, target_id, metadata)
  VALUES (NEW.creator_id, 'created_plan', 'plan', NEW.id, jsonb_build_object('title', NEW.title));
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.feed_on_member_join()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  plan_row public.social_plans%ROWTYPE;
BEGIN
  IF NEW.role <> 'member' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO plan_row FROM public.social_plans WHERE id = NEW.plan_id;
  IF plan_row.visibility <> 'public' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.activity_feed (actor_id, action, target_type, target_id, metadata)
  VALUES (NEW.user_id, 'joined_plan', 'plan', NEW.plan_id,
    jsonb_build_object('title', plan_row.title));
  RETURN NEW;
END;
$$;

-- Limpieza de lo que ya se publicó de planes privados
DELETE FROM public.activity_feed af
WHERE af.target_type = 'plan'
  AND EXISTS (
    SELECT 1 FROM public.social_plans sp
    WHERE sp.id = af.target_id AND sp.visibility <> 'public'
  );

-- ============================================================
-- 5. FIDELIDAD: sellos auto-otorgados
--
-- Problema: "stamps_insert WITH CHECK (true)" permitía a cualquier
--   usuario insertarse una tarjeta con stamps_count = 999 y reclamar
--   el premio. Ahora solo el dueño del negocio puede crear/tocar sellos
--   (ver también la función redeem_reservation en 011).
-- ============================================================

DROP POLICY IF EXISTS "stamps_insert" ON public.loyalty_stamps;
CREATE POLICY "stamps_insert" ON public.loyalty_stamps FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.loyalty_cards c
    JOIN public.businesses b ON c.business_id = b.id
    WHERE c.id = loyalty_stamps.card_id AND b.owner_user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "loyalty_cards_delete" ON public.loyalty_cards;
CREATE POLICY "loyalty_cards_delete" ON public.loyalty_cards FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = loyalty_cards.business_id AND b.owner_user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "stamps_delete" ON public.loyalty_stamps;
CREATE POLICY "stamps_delete" ON public.loyalty_stamps FOR DELETE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.loyalty_cards c
      JOIN public.businesses b ON c.business_id = b.id
      WHERE c.id = loyalty_stamps.card_id AND b.owner_user_id = auth.uid()
    )
  );

-- ============================================================
-- 6. MENSAJES A NEGOCIOS
--
-- Problema A: el FK de user_id apuntaba a auth.users, así que el
--   embed "profiles!business_messages_user_id_fkey" de PostgREST
--   fallaba y la bandeja del negocio SIEMPRE salía vacía.
-- Problema B: "FOR ALL USING (user_id = auth.uid())" dejaba que un
--   usuario insertara mensajes con sender_role = 'business',
--   haciéndose pasar por el local.
-- ============================================================

ALTER TABLE public.business_messages
  DROP CONSTRAINT IF EXISTS business_messages_user_id_fkey;

ALTER TABLE public.business_messages
  ADD CONSTRAINT business_messages_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

DROP POLICY IF EXISTS "Users manage own messages" ON public.business_messages;
DROP POLICY IF EXISTS "Business owners manage messages" ON public.business_messages;

CREATE POLICY "biz_msg_select" ON public.business_messages FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.businesses b
               WHERE b.id = business_messages.business_id AND b.owner_user_id = auth.uid())
  );

CREATE POLICY "biz_msg_insert_user" ON public.business_messages FOR INSERT
  WITH CHECK (user_id = auth.uid() AND sender_role = 'user');

CREATE POLICY "biz_msg_insert_business" ON public.business_messages FOR INSERT
  WITH CHECK (
    sender_role = 'business'
    AND EXISTS (SELECT 1 FROM public.businesses b
                WHERE b.id = business_messages.business_id AND b.owner_user_id = auth.uid())
  );

-- Marcar como leído: cada parte marca los mensajes que recibe
CREATE POLICY "biz_msg_update" ON public.business_messages FOR UPDATE
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.businesses b
               WHERE b.id = business_messages.business_id AND b.owner_user_id = auth.uid())
  );

CREATE POLICY "biz_msg_delete" ON public.business_messages FOR DELETE
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.businesses b
               WHERE b.id = business_messages.business_id AND b.owner_user_id = auth.uid())
  );

-- ============================================================
-- 7. ALTA DE NEGOCIOS SIN MODERACIÓN
--
-- Problema: el cliente mandaba status: 'active' en el insert, así que
--   el circuito de aprobación del panel de admin no servía para nada.
--   Ahora el estado inicial lo fuerza la base.
-- ============================================================

-- SECURITY INVOKER por el mismo motivo que protect_profile_columns()
CREATE OR REPLACE FUNCTION public.force_business_pending()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;
  IF public.get_user_role() IS DISTINCT FROM 'admin' THEN
    NEW.status := 'pending';
    NEW.is_verified := false;
    NEW.is_featured := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_business_insert_pending ON public.businesses;
CREATE TRIGGER on_business_insert_pending
  BEFORE INSERT ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.force_business_pending();

-- El dueño puede editar su negocio pero no auto-aprobarse ni auto-destacarse
-- SECURITY INVOKER por el mismo motivo que protect_profile_columns()
CREATE OR REPLACE FUNCTION public.protect_business_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin')
     OR public.get_user_role() = 'admin' THEN
    RETURN NEW;
  END IF;
  NEW.status      := OLD.status;
  NEW.is_verified := OLD.is_verified;
  NEW.is_featured := OLD.is_featured;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_business_update_protect ON public.businesses;
CREATE TRIGGER on_business_update_protect
  BEFORE UPDATE ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.protect_business_columns();

-- Ídem campañas: destacar es potestad del admin
-- SECURITY INVOKER por el mismo motivo que protect_profile_columns()
CREATE OR REPLACE FUNCTION public.protect_campaign_featured()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin')
     OR public.get_user_role() = 'admin' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.is_featured := false;
  ELSE
    NEW.is_featured := OLD.is_featured;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_campaign_protect_featured ON public.campaigns;
CREATE TRIGGER on_campaign_protect_featured
  BEFORE INSERT OR UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.protect_campaign_featured();

-- ============================================================
-- 8. PRIVACIDAD DE UBICACIÓN EN PLANES
--
-- Problema: planes/crear guardaba el GPS exacto del creador y
--   "plans_select" es público → cualquiera (incluso anónimo) podía
--   leer las coordenadas precisas de una persona.
--   Se redondea a 3 decimales (~110 m), suficiente para el filtro
--   "a X km" de /cerca sin exponer un domicilio.
-- ============================================================

CREATE OR REPLACE FUNCTION public.coarsen_plan_location()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF NEW.latitude IS NOT NULL THEN
    NEW.latitude := round(NEW.latitude::numeric, 3);
  END IF;
  IF NEW.longitude IS NOT NULL THEN
    NEW.longitude := round(NEW.longitude::numeric, 3);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_plan_coarsen_location ON public.social_plans;
CREATE TRIGGER on_plan_coarsen_location
  BEFORE INSERT OR UPDATE ON public.social_plans
  FOR EACH ROW EXECUTE FUNCTION public.coarsen_plan_location();

UPDATE public.social_plans
SET latitude = round(latitude::numeric, 3), longitude = round(longitude::numeric, 3)
WHERE latitude IS NOT NULL OR longitude IS NOT NULL;

-- profiles.latitude / profiles.longitude nunca se escriben ni se leen desde
-- la app, pero "profiles_select USING (true)" las dejaría públicas el día que
-- alguien las use. Se eliminan para que no puedan filtrarse por accidente.
ALTER TABLE public.profiles DROP COLUMN IF EXISTS latitude;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS longitude;

-- ============================================================
-- 9. STORAGE: cualquiera podía pisar/borrar el avatar de cualquiera
--
-- Problema: las políticas de 007 solo comprobaban bucket_id, y la de
--   INSERT comparaba la carpeta contra el literal 'avatars' en vez de
--   contra el id del usuario. Ahora la ruta debe ser <uid>/<archivo>.
-- ============================================================

-- Los buckets se crean acá si faltan, para no depender de que se hayan
-- corrido 007 y 009. Importante: NO correr 007 ni la sección de storage de
-- 009 DESPUÉS de este archivo, porque volverían a crear las policies
-- inseguras que esta sección reemplaza.
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true), ('plan-photos', 'plan-photos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users upload own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users update own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users delete own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Public avatar access" ON storage.objects;

CREATE POLICY "avatars_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

CREATE POLICY "avatars_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "avatars_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "avatars_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- plan-photos: la política de borrado usaba el índice [3] de la ruta,
-- que no existe (la ruta real es "<plan_id>/<uid>_<ts>.<ext>").
DROP POLICY IF EXISTS "plan_photos_upload" ON storage.objects;
DROP POLICY IF EXISTS "plan_photos_public_read" ON storage.objects;
DROP POLICY IF EXISTS "plan_photos_delete_own" ON storage.objects;

CREATE POLICY "plan_photos_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'plan-photos');

CREATE POLICY "plan_photos_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'plan-photos'
    AND EXISTS (
      SELECT 1 FROM public.social_plan_members m
      WHERE m.plan_id::text = (storage.foldername(name))[1]
        AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "plan_photos_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'plan-photos'
    AND split_part((storage.filename(name)), '_', 1) = auth.uid()::text
  );

-- Límites de tamaño y tipo (evita que suban un video de 80 MB como avatar)
UPDATE storage.buckets
SET file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp']
WHERE id IN ('avatars', 'plan-photos');

-- ============================================================
-- 10. ANALYTICS abierto a cualquiera
--
-- "analytics_insert WITH CHECK (true)" permitía inflar las métricas
-- de cualquier negocio desde afuera, sin sesión.
-- ============================================================

DROP POLICY IF EXISTS "analytics_insert" ON public.analytics_events;
CREATE POLICY "analytics_insert" ON public.analytics_events FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND (user_id IS NULL OR user_id = auth.uid()));

-- ============================================================
-- 11. run_all_cleanups() apuntaba a una tabla inexistente
--
-- public.notifications nunca se creó, así que la función entera
-- abortaba y el cron diario no limpiaba absolutamente nada.
-- ============================================================

DROP FUNCTION IF EXISTS public.cleanup_old_notifications();

CREATE OR REPLACE FUNCTION public.run_all_cleanups()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  chat_count int;
  feed_count int;
  report_count int;
  plan_count int;
BEGIN
  SELECT COUNT(*) INTO chat_count FROM public.plan_chat_messages
    WHERE created_at < NOW() - INTERVAL '90 days';
  SELECT COUNT(*) INTO feed_count FROM public.activity_feed
    WHERE created_at < NOW() - INTERVAL '60 days';
  SELECT COUNT(*) INTO report_count FROM public.user_reports
    WHERE status IN ('resolved','dismissed') AND created_at < NOW() - INTERVAL '180 days';
  SELECT COUNT(*) INTO plan_count FROM public.social_plans
    WHERE status = 'open' AND plan_date < (CURRENT_DATE - INTERVAL '7 days');

  PERFORM public.cleanup_old_chat_messages();
  PERFORM public.cleanup_old_feed();
  PERFORM public.cleanup_old_reports();
  PERFORM public.cleanup_expired_plans();
  PERFORM public.cleanup_old_messages();

  RETURN jsonb_build_object(
    'chat_messages_deleted', chat_count,
    'feed_items_deleted', feed_count,
    'reports_deleted', report_count,
    'plans_closed', plan_count,
    'executed_at', NOW()
  );
END;
$$;

-- ============================================================
-- 12. Denuncias duplicadas
--
-- user_reports tiene UNIQUE(reporter_id, target_type, target_id): al
-- reportar dos veces al mismo usuario, la app tiraba un error 23505
-- crudo. Se permite actualizar la propia denuncia en vez de fallar.
-- ============================================================

DROP POLICY IF EXISTS "reports_update_own" ON public.user_reports;
CREATE POLICY "reports_update_own" ON public.user_reports FOR UPDATE
  USING (reporter_id = auth.uid())
  WITH CHECK (reporter_id = auth.uid() AND status = 'pending');

DROP POLICY IF EXISTS "reports_delete_own" ON public.user_reports;
CREATE POLICY "reports_delete_own" ON public.user_reports FOR DELETE
  USING (reporter_id = auth.uid() OR public.get_user_role() = 'admin');

-- ============================================================
-- 13. Políticas DELETE que faltaban (necesarias para borrar la cuenta)
-- ============================================================

DROP POLICY IF EXISTS "reservations_delete" ON public.reservations;
CREATE POLICY "reservations_delete" ON public.reservations FOR DELETE
  USING (user_id = auth.uid() OR public.get_user_role() = 'admin');

DROP POLICY IF EXISTS "checkins_delete" ON public.checkins;
CREATE POLICY "checkins_delete" ON public.checkins FOR DELETE
  USING (user_id = auth.uid() OR public.get_user_role() = 'admin');

DROP POLICY IF EXISTS "redemptions_delete" ON public.redemptions;
CREATE POLICY "redemptions_delete" ON public.redemptions FOR DELETE
  USING (user_id = auth.uid() OR public.get_user_role() = 'admin');

DROP POLICY IF EXISTS "plans_delete_admin" ON public.social_plans;
CREATE POLICY "plans_delete_admin" ON public.social_plans FOR DELETE
  USING (public.get_user_role() = 'admin');

-- ============================================================
-- PINTÓ — 016: Vistos en el chat y en las fotos
-- Ejecutar DESPUÉS de 015_retencion_planes.sql
--
-- Quién vio qué. En un chat grupal el "visto" es lo que te dice si vale la
-- pena repetir algo o si ya todos se enteraron.
-- ============================================================

DO $preflight$
BEGIN
  IF to_regclass('public.plan_chat_messages') IS NULL
     OR to_regclass('public.plan_photos') IS NULL THEN
    RAISE EXCEPTION 'Faltan migraciones previas (008_v3_features.sql)';
  END IF;
END;
$preflight$;

-- ============================================================
-- 1. VISTOS DEL CHAT
--
-- Una fila por persona y por plan con la marca de "leí hasta acá", no una
-- fila por mensaje y por persona. Con 10 miembros y 500 mensajes, lo
-- segundo son 5.000 filas por plan para la misma información.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.plan_chat_reads (
  plan_id      uuid NOT NULL REFERENCES public.social_plans(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES public.profiles(id)     ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_reads_plan ON public.plan_chat_reads(plan_id, last_read_at);

ALTER TABLE public.plan_chat_reads ENABLE ROW LEVEL SECURITY;

-- Los miembros del plan ven quién leyó; nadie más.
DROP POLICY IF EXISTS "chat_reads_select" ON public.plan_chat_reads;
CREATE POLICY "chat_reads_select" ON public.plan_chat_reads FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.social_plan_members m
    WHERE m.plan_id = plan_chat_reads.plan_id AND m.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "chat_reads_upsert" ON public.plan_chat_reads;
CREATE POLICY "chat_reads_upsert" ON public.plan_chat_reads FOR INSERT
  WITH CHECK (user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.social_plan_members m
    WHERE m.plan_id = plan_chat_reads.plan_id AND m.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "chat_reads_update" ON public.plan_chat_reads;
CREATE POLICY "chat_reads_update" ON public.plan_chat_reads FOR UPDATE
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

/** "Leí hasta ahora". La llama el chat al abrirse y al llegar mensajes. */
CREATE OR REPLACE FUNCTION public.mark_chat_read(p_plan_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.social_plan_members m
    WHERE m.plan_id = p_plan_id AND m.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'No sos miembro de este plan';
  END IF;

  INSERT INTO public.plan_chat_reads (plan_id, user_id, last_read_at)
  VALUES (p_plan_id, auth.uid(), now())
  ON CONFLICT (plan_id, user_id) DO UPDATE SET last_read_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_chat_read(uuid) TO authenticated;

/**
 * Quién leyó hasta dónde, para pintar el visto mensaje por mensaje.
 * Devuelve una fila por miembro (menos vos) con su marca de lectura.
 */
CREATE OR REPLACE FUNCTION public.chat_read_state(p_plan_id uuid)
RETURNS TABLE (user_id uuid, full_name text, avatar_url text, last_read_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT m.user_id, p.full_name, p.avatar_url, r.last_read_at
  FROM public.social_plan_members m
  JOIN public.profiles p ON p.id = m.user_id
  LEFT JOIN public.plan_chat_reads r
    ON r.plan_id = m.plan_id AND r.user_id = m.user_id
  WHERE m.plan_id = p_plan_id
    AND m.user_id <> auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.social_plan_members me
      WHERE me.plan_id = p_plan_id AND me.user_id = auth.uid()
    );
$$;

GRANT EXECUTE ON FUNCTION public.chat_read_state(uuid) TO authenticated;

-- ============================================================
-- 2. VISTAS DE FOTOS
--
-- Acá sí hace falta una fila por foto y persona: lo que se quiere mostrar
-- es "la vieron 5", y eso no se deduce de una marca temporal por plan.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.plan_photo_views (
  photo_id  uuid NOT NULL REFERENCES public.plan_photos(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES public.profiles(id)    ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (photo_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_photo_views_photo ON public.plan_photo_views(photo_id);

ALTER TABLE public.plan_photo_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "photo_views_select" ON public.plan_photo_views;
CREATE POLICY "photo_views_select" ON public.plan_photo_views FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.plan_photos ph
    JOIN public.social_plan_members m ON m.plan_id = ph.plan_id
    WHERE ph.id = plan_photo_views.photo_id AND m.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "photo_views_insert" ON public.plan_photo_views;
CREATE POLICY "photo_views_insert" ON public.plan_photo_views FOR INSERT
  WITH CHECK (user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.plan_photos ph
    JOIN public.social_plan_members m ON m.plan_id = ph.plan_id
    WHERE ph.id = plan_photo_views.photo_id AND m.user_id = auth.uid()
  ));

/**
 * Marca varias fotos como vistas de una sola vez.
 *
 * El álbum se abre entero: mandar una petición por foto sería una ráfaga de
 * 20 requests cada vez que alguien entra.
 */
CREATE OR REPLACE FUNCTION public.mark_photos_seen(p_photo_ids uuid[])
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_photo_ids IS NULL THEN RETURN; END IF;

  INSERT INTO public.plan_photo_views (photo_id, user_id)
  SELECT ph.id, auth.uid()
  FROM public.plan_photos ph
  JOIN public.social_plan_members m ON m.plan_id = ph.plan_id AND m.user_id = auth.uid()
  WHERE ph.id = ANY (p_photo_ids)
    AND ph.user_id <> auth.uid()   -- no se cuenta ver la propia
  ON CONFLICT (photo_id, user_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_photos_seen(uuid[]) TO authenticated;

/** Cuántas personas vieron cada foto de un plan. */
CREATE OR REPLACE FUNCTION public.photo_view_counts(p_plan_id uuid)
RETURNS TABLE (photo_id uuid, views int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT ph.id, count(v.user_id)::int
  FROM public.plan_photos ph
  LEFT JOIN public.plan_photo_views v ON v.photo_id = ph.id
  WHERE ph.plan_id = p_plan_id
    AND EXISTS (
      SELECT 1 FROM public.social_plan_members m
      WHERE m.plan_id = p_plan_id AND m.user_id = auth.uid()
    )
  GROUP BY ph.id;
$$;

GRANT EXECUTE ON FUNCTION public.photo_view_counts(uuid) TO authenticated;

-- ============================================================
-- 3. NO NOTIFICAR A QUIEN YA ESTÁ MIRANDO EL CHAT
--
-- Si alguien tiene el chat abierto, el push es ruido. Se saltea a quien
-- leyó en los últimos 30 segundos.
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_on_plan_chat()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  plan_title  text;
  sender_name text;
  member      record;
BEGIN
  SELECT sp.title INTO plan_title FROM public.social_plans sp WHERE sp.id = NEW.plan_id;
  SELECT p.full_name INTO sender_name FROM public.profiles p WHERE p.id = NEW.user_id;

  FOR member IN
    SELECT m.user_id FROM public.social_plan_members m
    WHERE m.plan_id = NEW.plan_id AND m.user_id <> NEW.user_id
  LOOP
    -- Bloqueos en cualquier dirección
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.user_blocks ub
      WHERE (ub.blocker_id = member.user_id AND ub.blocked_id = NEW.user_id)
         OR (ub.blocker_id = NEW.user_id AND ub.blocked_id = member.user_id)
    );
    -- Ya está mirando el chat: notificarlo sería ruido
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.plan_chat_reads r
      WHERE r.plan_id = NEW.plan_id AND r.user_id = member.user_id
        AND r.last_read_at > now() - INTERVAL '30 seconds'
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
-- 4. LIMPIEZA
--
-- Los vistos no sobreviven a lo que referencian: caen por CASCADE cuando
-- se borra el chat o la foto (política de retención, migración 015).
-- Solo hay que limpiar los vistos de planes cuyo chat ya se borró.
-- ============================================================

CREATE OR REPLACE FUNCTION public.cleanup_chat_reads()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE n int;
BEGIN
  DELETE FROM public.plan_chat_reads r
  USING public.social_plans sp
  WHERE r.plan_id = sp.id
    AND sp.plan_date < CURRENT_DATE - INTERVAL '30 days';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- Engancharlo al barrido diario que ya existe
CREATE OR REPLACE FUNCTION public.run_all_cleanups()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_chat int; v_requests int; v_photos int; v_avatars int; v_warned int; v_reads int;
  v_feed int; v_reports int; v_plans int; v_notifs int;
BEGIN
  v_warned := public.notify_photos_expiring();

  v_chat     := public.cleanup_plan_chat();
  v_requests := public.cleanup_plan_requests();
  v_photos   := public.cleanup_plan_photos();
  v_avatars  := public.cleanup_orphan_avatars();
  v_reads    := public.cleanup_chat_reads();

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
    'chat_reads_deleted',     v_reads,
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

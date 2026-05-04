-- ============================================================
-- PINTÓ v2 — Sprint 2: Social Plans, Geo, Enhanced Profiles
-- Run AFTER 001_schema.sql and 002_seed_data.sql
-- ============================================================

-- ============================================================
-- 1. ENHANCED PROFILES
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS birth_year int,
  ADD COLUMN IF NOT EXISTS show_age boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gender text CHECK (gender IN ('male', 'female', 'non_binary', 'other', 'prefer_not_to_say')),
  ADD COLUMN IF NOT EXISTS zone_id uuid REFERENCES public.zones(id),
  ADD COLUMN IF NOT EXISTS latitude numeric,
  ADD COLUMN IF NOT EXISTS longitude numeric,
  ADD COLUMN IF NOT EXISTS interests_text text,
  ADD COLUMN IF NOT EXISTS reputation_score int NOT NULL DEFAULT 50 CHECK (reputation_score BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS plans_created_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS plans_joined_count int NOT NULL DEFAULT 0;

-- ============================================================
-- 2. USER INTERESTS
-- ============================================================

CREATE TABLE public.user_interests (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  icon text,
  category text DEFAULT 'general',
  sort_order int DEFAULT 0
);

CREATE TABLE public.user_interest_links (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  interest_id uuid NOT NULL REFERENCES public.user_interests(id) ON DELETE CASCADE,
  UNIQUE (user_id, interest_id)
);
CREATE INDEX idx_user_interest_links_user ON public.user_interest_links(user_id);

-- ============================================================
-- 3. USER PHOTOS
-- ============================================================

CREATE TABLE public.user_photos (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  photo_url text NOT NULL,
  caption text,
  sort_order int DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_user_photos_user ON public.user_photos(user_id);

-- ============================================================
-- 4. SOCIAL PLANS
-- ============================================================

CREATE TABLE public.social_plans (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  creator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  plan_date date NOT NULL,
  plan_time time,
  meeting_point text,
  max_members int DEFAULT 10,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'full', 'closed', 'cancelled')),
  visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  latitude numeric,
  longitude numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_social_plans_creator ON public.social_plans(creator_id);
CREATE INDEX idx_social_plans_campaign ON public.social_plans(campaign_id);
CREATE INDEX idx_social_plans_status ON public.social_plans(status);
CREATE INDEX idx_social_plans_date ON public.social_plans(plan_date);

-- ============================================================
-- 5. SOCIAL PLAN REQUESTS
-- ============================================================

CREATE TABLE public.social_plan_requests (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id uuid NOT NULL REFERENCES public.social_plans(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  UNIQUE (plan_id, user_id)
);
CREATE INDEX idx_plan_requests_plan ON public.social_plan_requests(plan_id);
CREATE INDEX idx_plan_requests_user ON public.social_plan_requests(user_id);
CREATE INDEX idx_plan_requests_status ON public.social_plan_requests(status);

-- ============================================================
-- 6. SOCIAL PLAN MEMBERS
-- ============================================================

CREATE TABLE public.social_plan_members (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id uuid NOT NULL REFERENCES public.social_plans(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('creator', 'member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, user_id)
);
CREATE INDEX idx_plan_members_plan ON public.social_plan_members(plan_id);
CREATE INDEX idx_plan_members_user ON public.social_plan_members(user_id);

-- ============================================================
-- 7. RLS for new tables
-- ============================================================

ALTER TABLE public.user_interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_interest_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_plan_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_plan_members ENABLE ROW LEVEL SECURITY;

-- USER INTERESTS (public read)
CREATE POLICY "interests_select" ON public.user_interests FOR SELECT USING (true);

-- USER INTEREST LINKS
CREATE POLICY "interest_links_select" ON public.user_interest_links FOR SELECT USING (true);
CREATE POLICY "interest_links_insert" ON public.user_interest_links FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "interest_links_delete" ON public.user_interest_links FOR DELETE USING (user_id = auth.uid());

-- USER PHOTOS
CREATE POLICY "photos_select" ON public.user_photos FOR SELECT USING (true);
CREATE POLICY "photos_insert" ON public.user_photos FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "photos_update" ON public.user_photos FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "photos_delete" ON public.user_photos FOR DELETE USING (user_id = auth.uid());

-- SOCIAL PLANS
CREATE POLICY "plans_select" ON public.social_plans FOR SELECT
  USING (visibility = 'public' OR creator_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.social_plan_members m WHERE m.plan_id = id AND m.user_id = auth.uid()
  ));
CREATE POLICY "plans_insert" ON public.social_plans FOR INSERT WITH CHECK (creator_id = auth.uid());
CREATE POLICY "plans_update" ON public.social_plans FOR UPDATE USING (creator_id = auth.uid());
CREATE POLICY "plans_delete" ON public.social_plans FOR DELETE USING (creator_id = auth.uid());

-- SOCIAL PLAN REQUESTS
CREATE POLICY "requests_select" ON public.social_plan_requests FOR SELECT
  USING (user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.social_plans p WHERE p.id = plan_id AND p.creator_id = auth.uid()
  ));
CREATE POLICY "requests_insert" ON public.social_plan_requests FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "requests_update" ON public.social_plan_requests FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.social_plans p WHERE p.id = plan_id AND p.creator_id = auth.uid()));

-- SOCIAL PLAN MEMBERS
CREATE POLICY "members_select" ON public.social_plan_members FOR SELECT USING (true);
CREATE POLICY "members_insert" ON public.social_plan_members FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.social_plans p WHERE p.id = plan_id AND p.creator_id = auth.uid()));
CREATE POLICY "members_delete" ON public.social_plan_members FOR DELETE
  USING (user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.social_plans p WHERE p.id = plan_id AND p.creator_id = auth.uid()
  ));

-- ============================================================
-- 8. TRIGGERS for counter cache
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_plan_counters()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.role = 'creator' THEN
      UPDATE public.profiles SET plans_created_count = plans_created_count + 1 WHERE id = NEW.user_id;
    ELSE
      UPDATE public.profiles SET plans_joined_count = plans_joined_count + 1 WHERE id = NEW.user_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.role = 'creator' THEN
      UPDATE public.profiles SET plans_created_count = GREATEST(0, plans_created_count - 1) WHERE id = OLD.user_id;
    ELSE
      UPDATE public.profiles SET plans_joined_count = GREATEST(0, plans_joined_count - 1) WHERE id = OLD.user_id;
    END IF;
    RETURN OLD;
  END IF;
END;
$$;

CREATE TRIGGER on_plan_member_change
  AFTER INSERT OR DELETE ON public.social_plan_members
  FOR EACH ROW EXECUTE FUNCTION public.update_plan_counters();

-- ============================================================
-- 9. SEED DATA: Interests
-- ============================================================

INSERT INTO public.user_interests (name, slug, icon, category, sort_order) VALUES
  ('Cerveza artesanal', 'cerveza', '🍺', 'comida', 1),
  ('Café', 'cafe', '☕', 'comida', 2),
  ('Gastronomía', 'gastronomia', '🍽️', 'comida', 3),
  ('Música en vivo', 'musica-vivo', '🎵', 'cultura', 4),
  ('Cine', 'cine', '🎬', 'cultura', 5),
  ('Arte', 'arte', '🎨', 'cultura', 6),
  ('Lectura', 'lectura', '📚', 'cultura', 7),
  ('Fútbol', 'futbol', '⚽', 'deporte', 8),
  ('Running', 'running', '🏃', 'deporte', 9),
  ('Gym / Funcional', 'gym', '💪', 'deporte', 10),
  ('Ciclismo', 'ciclismo', '🚴', 'deporte', 11),
  ('Pádel', 'padel', '🎾', 'deporte', 12),
  ('Trekking', 'trekking', '🥾', 'deporte', 13),
  ('Yoga', 'yoga', '🧘', 'deporte', 14),
  ('Juegos de mesa', 'juegos-mesa', '🎲', 'social', 15),
  ('Trivia', 'trivia', '🧠', 'social', 16),
  ('After office', 'after-office', '🍻', 'social', 17),
  ('Fotografía', 'fotografia', '📷', 'creativo', 18),
  ('Emprendedurismo', 'emprendedurismo', '🚀', 'profesional', 19),
  ('Tecnología', 'tecnologia', '💻', 'profesional', 20);

-- ============================================================
-- Done! Run this after 001 and 002.
-- ============================================================

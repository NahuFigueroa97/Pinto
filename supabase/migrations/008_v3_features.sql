-- ============================================================
-- PINTÓ v3 — 13 Features Migration
-- Run AFTER all previous migrations
-- ============================================================

-- ============================================================
-- 1. PLAN CATEGORIES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.plan_categories (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  emoji text NOT NULL DEFAULT '📋',
  sort_order int DEFAULT 0
);

INSERT INTO public.plan_categories (name, slug, emoji, sort_order) VALUES
  ('Social', 'social', '🍻', 1),
  ('Deporte', 'deporte', '⚽', 2),
  ('Cultural', 'cultural', '🎨', 3),
  ('Gastronomía', 'gastro', '🍽️', 4),
  ('Aire libre', 'aire-libre', '🌳', 5),
  ('Gaming', 'gaming', '🎮', 6),
  ('Estudio', 'estudio', '📚', 7),
  ('Música', 'musica', '🎵', 8),
  ('Otro', 'otro', '✨', 99);

ALTER TABLE public.social_plans
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.plan_categories(id);

-- ============================================================
-- 2. PLAN CHAT MESSAGES
-- ============================================================

CREATE TABLE public.plan_chat_messages (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id uuid NOT NULL REFERENCES public.social_plans(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_chat_plan ON public.plan_chat_messages(plan_id, created_at);

-- ============================================================
-- 3. PLAN REVIEWS
-- ============================================================

CREATE TABLE public.plan_reviews (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id uuid NOT NULL REFERENCES public.social_plans(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reviewed_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, reviewer_id, reviewed_user_id)
);
CREATE INDEX idx_reviews_plan ON public.plan_reviews(plan_id);
CREATE INDEX idx_reviews_reviewed ON public.plan_reviews(reviewed_user_id);

-- Function to update reputation from reviews
CREATE OR REPLACE FUNCTION public.update_reputation_from_review()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  UPDATE public.profiles SET reputation_score = LEAST(100, GREATEST(0,
    (SELECT COALESCE(AVG(rating) * 20, 50) FROM public.plan_reviews WHERE reviewed_user_id = NEW.reviewed_user_id)
  )) WHERE id = NEW.reviewed_user_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_review_inserted
  AFTER INSERT ON public.plan_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_reputation_from_review();

-- ============================================================
-- 4. PLAN PHOTOS
-- ============================================================

CREATE TABLE public.plan_photos (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id uuid NOT NULL REFERENCES public.social_plans(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  photo_url text NOT NULL,
  caption text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_plan_photos_plan ON public.plan_photos(plan_id);

-- ============================================================
-- 5. ACTIVITY FEED
-- ============================================================

CREATE TABLE public.activity_feed (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('created_plan','joined_plan','completed_plan','reviewed','uploaded_photo')),
  target_type text NOT NULL CHECK (target_type IN ('plan','user','photo')),
  target_id uuid NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_feed_created ON public.activity_feed(created_at DESC);
CREATE INDEX idx_feed_actor ON public.activity_feed(actor_id);

-- Auto-feed on plan creation
CREATE OR REPLACE FUNCTION public.feed_on_plan_create()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.activity_feed (actor_id, action, target_type, target_id, metadata)
  VALUES (NEW.creator_id, 'created_plan', 'plan', NEW.id, jsonb_build_object('title', NEW.title));
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_plan_created_feed
  AFTER INSERT ON public.social_plans
  FOR EACH ROW EXECUTE FUNCTION public.feed_on_plan_create();

-- Auto-feed on member join
CREATE OR REPLACE FUNCTION public.feed_on_member_join()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NEW.role = 'member' THEN
    INSERT INTO public.activity_feed (actor_id, action, target_type, target_id, metadata)
    VALUES (NEW.user_id, 'joined_plan', 'plan', NEW.plan_id,
      jsonb_build_object('title', (SELECT title FROM public.social_plans WHERE id = NEW.plan_id)));
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_member_joined_feed
  AFTER INSERT ON public.social_plan_members
  FOR EACH ROW EXECUTE FUNCTION public.feed_on_member_join();

-- ============================================================
-- 6. USER REPORTS
-- ============================================================

CREATE TABLE public.user_reports (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('user', 'plan')),
  target_id uuid NOT NULL,
  reason text NOT NULL CHECK (reason IN ('inappropriate','harassment','spam','fake','dangerous','other')),
  description text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewing','resolved','dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reporter_id, target_type, target_id)
);
CREATE INDEX idx_user_reports_status ON public.user_reports(status);

-- ============================================================
-- 7. LOYALTY PROGRAM
-- ============================================================

CREATE TABLE public.loyalty_cards (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Tarjeta de Fidelidad',
  stamps_required int NOT NULL DEFAULT 5,
  reward text NOT NULL DEFAULT 'Producto gratis',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.loyalty_stamps (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  card_id uuid NOT NULL REFERENCES public.loyalty_cards(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  stamps_count int NOT NULL DEFAULT 0,
  redeemed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (card_id, user_id)
);
CREATE INDEX idx_loyalty_stamps_user ON public.loyalty_stamps(user_id);

-- ============================================================
-- 8. IDENTITY VERIFICATION
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verification_requested_at timestamptz;

-- ============================================================
-- 9. RLS FOR NEW TABLES
-- ============================================================

ALTER TABLE public.plan_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_feed ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_stamps ENABLE ROW LEVEL SECURITY;

-- Plan categories: public read
CREATE POLICY "plan_cat_select" ON public.plan_categories FOR SELECT USING (true);

-- Chat: members can read/write
CREATE POLICY "chat_select" ON public.plan_chat_messages FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.social_plan_members m WHERE m.plan_id = plan_id AND m.user_id = auth.uid()));
CREATE POLICY "chat_insert" ON public.plan_chat_messages FOR INSERT
  WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.social_plan_members m WHERE m.plan_id = plan_id AND m.user_id = auth.uid()));

-- Reviews: members can write, public read
CREATE POLICY "reviews_select" ON public.plan_reviews FOR SELECT USING (true);
CREATE POLICY "reviews_insert" ON public.plan_reviews FOR INSERT
  WITH CHECK (reviewer_id = auth.uid() AND EXISTS (SELECT 1 FROM public.social_plan_members m WHERE m.plan_id = plan_id AND m.user_id = auth.uid()));

-- Plan photos: members write, public read
CREATE POLICY "plan_photos_select" ON public.plan_photos FOR SELECT USING (true);
CREATE POLICY "plan_photos_insert" ON public.plan_photos FOR INSERT
  WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.social_plan_members m WHERE m.plan_id = plan_id AND m.user_id = auth.uid()));
CREATE POLICY "plan_photos_delete" ON public.plan_photos FOR DELETE
  USING (user_id = auth.uid());

-- Activity feed: public read
CREATE POLICY "feed_select" ON public.activity_feed FOR SELECT USING (true);
CREATE POLICY "feed_insert" ON public.activity_feed FOR INSERT WITH CHECK (true);

-- Reports: auth insert, admin read
CREATE POLICY "reports_insert" ON public.user_reports FOR INSERT WITH CHECK (reporter_id = auth.uid());
CREATE POLICY "reports_select" ON public.user_reports FOR SELECT
  USING (reporter_id = auth.uid() OR public.get_user_role() = 'admin');
CREATE POLICY "reports_update" ON public.user_reports FOR UPDATE
  USING (public.get_user_role() = 'admin');

-- Loyalty cards: public read, business owner write
CREATE POLICY "loyalty_cards_select" ON public.loyalty_cards FOR SELECT USING (true);
CREATE POLICY "loyalty_cards_insert" ON public.loyalty_cards FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.owner_user_id = auth.uid()));
CREATE POLICY "loyalty_cards_update" ON public.loyalty_cards FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.owner_user_id = auth.uid()));

-- Loyalty stamps: user can read own, business can manage
CREATE POLICY "stamps_select" ON public.loyalty_stamps FOR SELECT
  USING (user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.loyalty_cards c JOIN public.businesses b ON c.business_id = b.id
    WHERE c.id = card_id AND b.owner_user_id = auth.uid()));
CREATE POLICY "stamps_insert" ON public.loyalty_stamps FOR INSERT WITH CHECK (true);
CREATE POLICY "stamps_update" ON public.loyalty_stamps FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.loyalty_cards c JOIN public.businesses b ON c.business_id = b.id
    WHERE c.id = card_id AND b.owner_user_id = auth.uid()));

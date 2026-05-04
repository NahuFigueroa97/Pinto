-- ============================================================
-- PINTÓ v2 — Complete Database Schema
-- Platform de activación comercial local
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- for text search

-- ============================================================
-- 1. FOUNDATION TABLES
-- ============================================================

-- Cities
CREATE TABLE public.cities (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  province text NOT NULL DEFAULT 'Catamarca',
  country text NOT NULL DEFAULT 'Argentina',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Zones
CREATE TABLE public.zones (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  city_id uuid NOT NULL REFERENCES public.cities(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);
CREATE INDEX idx_zones_city ON public.zones(city_id);

-- Business Categories
CREATE TABLE public.business_categories (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  icon text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int DEFAULT 0
);

-- ============================================================
-- 2. PROFILES (linked to auth.users)
-- ============================================================

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'business', 'admin')),
  full_name text NOT NULL DEFAULT '',
  avatar_url text,
  city_id uuid REFERENCES public.cities(id),
  bio text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_profiles_role ON public.profiles(role);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'role', 'user'),
    NEW.raw_user_meta_data ->> 'avatar_url'
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 3. BUSINESSES
-- ============================================================

CREATE TABLE public.businesses (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.business_categories(id),
  city_id uuid NOT NULL REFERENCES public.cities(id),
  zone_id uuid REFERENCES public.zones(id),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  address text,
  latitude numeric,
  longitude numeric,
  phone text,
  whatsapp text,
  instagram text,
  cover_image_url text,
  logo_url text,
  is_verified boolean NOT NULL DEFAULT false,
  is_featured boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_businesses_owner ON public.businesses(owner_user_id);
CREATE INDEX idx_businesses_category ON public.businesses(category_id);
CREATE INDEX idx_businesses_city ON public.businesses(city_id);
CREATE INDEX idx_businesses_zone ON public.businesses(zone_id);
CREATE INDEX idx_businesses_status ON public.businesses(status);
CREATE INDEX idx_businesses_slug ON public.businesses(slug);

-- Business Hours
CREATE TABLE public.business_hours (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  weekday int NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  opens_at time,
  closes_at time,
  is_closed boolean NOT NULL DEFAULT false,
  UNIQUE (business_id, weekday)
);

-- ============================================================
-- 4. CAMPAIGNS
-- ============================================================

CREATE TABLE public.campaigns (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'promo' CHECK (type IN ('promo', 'group_promo', 'event', 'time_slot')),
  title text NOT NULL,
  short_description text NOT NULL DEFAULT '',
  full_description text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'expired', 'archived')),
  max_capacity int,
  min_group_size int,
  price_text text,
  is_free boolean NOT NULL DEFAULT false,
  is_featured boolean NOT NULL DEFAULT false,
  requires_reservation boolean NOT NULL DEFAULT false,
  requires_checkin boolean NOT NULL DEFAULT false,
  banner_image_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_campaigns_business ON public.campaigns(business_id);
CREATE INDEX idx_campaigns_status ON public.campaigns(status);
CREATE INDEX idx_campaigns_dates ON public.campaigns(starts_at, ends_at);
CREATE INDEX idx_campaigns_featured ON public.campaigns(is_featured) WHERE is_featured = true;

-- Campaign Tags
CREATE TABLE public.campaign_tags (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE
);

CREATE TABLE public.campaign_tag_links (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.campaign_tags(id) ON DELETE CASCADE,
  UNIQUE (campaign_id, tag_id)
);

-- ============================================================
-- 5. RESERVATIONS
-- ============================================================

CREATE TABLE public.reservations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  party_size int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled', 'completed', 'no_show')),
  reserved_at timestamptz NOT NULL DEFAULT now(),
  notes text
);
CREATE INDEX idx_reservations_campaign ON public.reservations(campaign_id);
CREATE INDEX idx_reservations_user ON public.reservations(user_id);
CREATE INDEX idx_reservations_status ON public.reservations(status);

-- ============================================================
-- 6. CHECK-INS & REDEMPTIONS
-- ============================================================

CREATE TABLE public.checkins (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  reservation_id uuid REFERENCES public.reservations(id),
  checked_in_at timestamptz NOT NULL DEFAULT now(),
  method text NOT NULL DEFAULT 'manual'
);

CREATE TABLE public.redemptions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'completed'
);

-- ============================================================
-- 7. FAVORITES
-- ============================================================

CREATE TABLE public.favorites (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fav_has_target CHECK (business_id IS NOT NULL OR campaign_id IS NOT NULL)
);
CREATE INDEX idx_favorites_user ON public.favorites(user_id);
CREATE UNIQUE INDEX idx_favorites_user_biz ON public.favorites(user_id, business_id) WHERE business_id IS NOT NULL;
CREATE UNIQUE INDEX idx_favorites_user_camp ON public.favorites(user_id, campaign_id) WHERE campaign_id IS NOT NULL;

-- ============================================================
-- 8. ANALYTICS
-- ============================================================

CREATE TABLE public.analytics_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type text NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  reservation_id uuid REFERENCES public.reservations(id) ON DELETE SET NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_analytics_type ON public.analytics_events(event_type);
CREATE INDEX idx_analytics_campaign ON public.analytics_events(campaign_id);
CREATE INDEX idx_analytics_business ON public.analytics_events(business_id);
CREATE INDEX idx_analytics_created ON public.analytics_events(created_at);

-- ============================================================
-- 9. MONETIZATION (structure only)
-- ============================================================

CREATE TABLE public.pricing_plans (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  price_monthly numeric NOT NULL DEFAULT 0,
  max_campaigns int,
  max_featured int DEFAULT 0,
  features jsonb,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE public.business_subscriptions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.pricing_plans(id),
  status text NOT NULL DEFAULT 'active',
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 10. MODERATION
-- ============================================================

CREATE TABLE public.reports (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('business', 'campaign', 'user')),
  target_id uuid NOT NULL,
  reason text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

-- ============================================================
-- 11. ROW LEVEL SECURITY
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_tag_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- Helper function to get user role
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- PROFILES
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- CITIES (public read)
CREATE POLICY "cities_select" ON public.cities FOR SELECT USING (true);

-- ZONES (public read)
CREATE POLICY "zones_select" ON public.zones FOR SELECT USING (true);

-- BUSINESS CATEGORIES (public read)
CREATE POLICY "categories_select" ON public.business_categories FOR SELECT USING (true);

-- BUSINESSES
CREATE POLICY "businesses_select" ON public.businesses FOR SELECT USING (true);
CREATE POLICY "businesses_insert" ON public.businesses FOR INSERT
  WITH CHECK (auth.uid() = owner_user_id);
CREATE POLICY "businesses_update" ON public.businesses FOR UPDATE
  USING (auth.uid() = owner_user_id OR public.get_user_role() = 'admin');
CREATE POLICY "businesses_delete" ON public.businesses FOR DELETE
  USING (public.get_user_role() = 'admin');

-- BUSINESS HOURS (public read, owner write)
CREATE POLICY "hours_select" ON public.business_hours FOR SELECT USING (true);
CREATE POLICY "hours_manage" ON public.business_hours FOR ALL
  USING (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.owner_user_id = auth.uid()));

-- CAMPAIGNS
CREATE POLICY "campaigns_select" ON public.campaigns FOR SELECT
  USING (status = 'active' OR EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.owner_user_id = auth.uid()) OR public.get_user_role() = 'admin');
CREATE POLICY "campaigns_insert" ON public.campaigns FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.owner_user_id = auth.uid()));
CREATE POLICY "campaigns_update" ON public.campaigns FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.owner_user_id = auth.uid()) OR public.get_user_role() = 'admin');

-- CAMPAIGN TAGS (public read)
CREATE POLICY "tags_select" ON public.campaign_tags FOR SELECT USING (true);
CREATE POLICY "tag_links_select" ON public.campaign_tag_links FOR SELECT USING (true);

-- RESERVATIONS
CREATE POLICY "reservations_select" ON public.reservations FOR SELECT
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.campaigns c JOIN public.businesses b ON c.business_id = b.id WHERE c.id = campaign_id AND b.owner_user_id = auth.uid()) OR public.get_user_role() = 'admin');
CREATE POLICY "reservations_insert" ON public.reservations FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "reservations_update" ON public.reservations FOR UPDATE
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.campaigns c JOIN public.businesses b ON c.business_id = b.id WHERE c.id = campaign_id AND b.owner_user_id = auth.uid()));

-- CHECKINS
CREATE POLICY "checkins_select" ON public.checkins FOR SELECT
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.owner_user_id = auth.uid()) OR public.get_user_role() = 'admin');
CREATE POLICY "checkins_insert" ON public.checkins FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- REDEMPTIONS
CREATE POLICY "redemptions_select" ON public.redemptions FOR SELECT
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.owner_user_id = auth.uid()) OR public.get_user_role() = 'admin');
CREATE POLICY "redemptions_insert" ON public.redemptions FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- FAVORITES
CREATE POLICY "favorites_select" ON public.favorites FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "favorites_insert" ON public.favorites FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "favorites_delete" ON public.favorites FOR DELETE USING (user_id = auth.uid());

-- ANALYTICS (insert for authenticated, read for business owner / admin)
CREATE POLICY "analytics_insert" ON public.analytics_events FOR INSERT WITH CHECK (true);
CREATE POLICY "analytics_select" ON public.analytics_events FOR SELECT
  USING (public.get_user_role() = 'admin' OR EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.owner_user_id = auth.uid()));

-- PRICING (public read)
CREATE POLICY "pricing_select" ON public.pricing_plans FOR SELECT USING (true);

-- SUBSCRIPTIONS
CREATE POLICY "subs_select" ON public.business_subscriptions FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.owner_user_id = auth.uid()) OR public.get_user_role() = 'admin');

-- REPORTS
CREATE POLICY "reports_insert" ON public.reports FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "reports_select" ON public.reports FOR SELECT USING (public.get_user_role() = 'admin');

-- ============================================================
-- 12. SEED DATA
-- ============================================================

-- City
INSERT INTO public.cities (id, name, province) VALUES
  ('c1000000-0000-0000-0000-000000000001', 'San Fernando del Valle de Catamarca', 'Catamarca');

-- Zones
INSERT INTO public.zones (city_id, name) VALUES
  ('c1000000-0000-0000-0000-000000000001', 'Centro'),
  ('c1000000-0000-0000-0000-000000000001', 'Alto del Solar'),
  ('c1000000-0000-0000-0000-000000000001', 'El Jumeal'),
  ('c1000000-0000-0000-0000-000000000001', 'Valle Viejo'),
  ('c1000000-0000-0000-0000-000000000001', 'Predio Ferial'),
  ('c1000000-0000-0000-0000-000000000001', 'UNCA / Zona Universitaria');

-- Categories
INSERT INTO public.business_categories (id, name, slug, icon, sort_order) VALUES
  ('bbc10000-0000-0000-0000-000000000001', 'Cafetería', 'cafeteria', '☕', 1),
  ('bbc10000-0000-0000-0000-000000000002', 'Bar', 'bar', '🍺', 2),
  ('bbc10000-0000-0000-0000-000000000003', 'Heladería', 'heladeria', '🍦', 3),
  ('bbc10000-0000-0000-0000-000000000004', 'Restaurante', 'restaurante', '🍽️', 4),
  ('bbc10000-0000-0000-0000-000000000005', 'Gimnasio', 'gimnasio', '💪', 5),
  ('bbc10000-0000-0000-0000-000000000006', 'Cancha', 'cancha', '⚽', 6),
  ('bbc10000-0000-0000-0000-000000000007', 'Bicicletería', 'bicicleteria', '🚴', 7),
  ('bbc10000-0000-0000-0000-000000000008', 'Cultural', 'cultural', '🎭', 8),
  ('bbc10000-0000-0000-0000-000000000009', 'Experiencia', 'experiencia', '✨', 9);

-- Campaign Tags
INSERT INTO public.campaign_tags (id, name, slug) VALUES
  ('aaa00000-0000-0000-0000-000000000001', 'Merienda', 'merienda'),
  ('aaa00000-0000-0000-0000-000000000002', 'After Office', 'after-office'),
  ('aaa00000-0000-0000-0000-000000000003', 'Happy Hour', 'happy-hour'),
  ('aaa00000-0000-0000-0000-000000000004', 'Grupal', 'grupal'),
  ('aaa00000-0000-0000-0000-000000000005', 'Estudio', 'estudio'),
  ('aaa00000-0000-0000-0000-000000000006', 'Deporte', 'deporte'),
  ('aaa00000-0000-0000-0000-000000000007', 'Trivia', 'trivia'),
  ('aaa00000-0000-0000-0000-000000000008', 'Música', 'musica'),
  ('aaa00000-0000-0000-0000-000000000009', 'Clase Abierta', 'clase-abierta');

-- Pricing Plans
INSERT INTO public.pricing_plans (name, slug, price_monthly, max_campaigns, max_featured, features) VALUES
  ('Gratis', 'free', 0, 2, 0, '{"analytics": false}'::jsonb),
  ('Starter', 'starter', 4999, 10, 2, '{"analytics": true}'::jsonb),
  ('Pro', 'pro', 12999, 50, 10, '{"analytics": true, "priority_support": true}'::jsonb);

-- ============================================================
-- NOTE: Business and campaign seed data requires real user IDs.
-- Run the seed_demo_data.sql file AFTER registering the demo
-- business owner account via the app.
-- ============================================================

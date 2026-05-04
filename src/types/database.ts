// Database types – simplified for MVP
// Will be auto-generated from Supabase CLI when tables are final

export type UserRole = 'user' | 'business' | 'admin';

export type CampaignStatus = 'draft' | 'active' | 'paused' | 'expired' | 'archived';
export type CampaignType = 'promo' | 'group_promo' | 'event' | 'time_slot';

export type ReservationStatus = 'confirmed' | 'cancelled' | 'completed' | 'no_show';
export type BusinessStatus = 'pending' | 'active' | 'suspended' | 'rejected';

export type PlanStatus = 'open' | 'full' | 'closed' | 'cancelled';
export type PlanRequestStatus = 'pending' | 'accepted' | 'rejected';
export type PlanVisibility = 'public' | 'private';
export type Gender = 'male' | 'female' | 'non_binary' | 'other' | 'prefer_not_to_say';

export type AnalyticsEventType =
  | 'campaign_view'
  | 'campaign_click'
  | 'reservation_created'
  | 'reservation_cancelled'
  | 'checkin_completed'
  | 'redemption_completed'
  | 'business_profile_view'
  | 'plan_view'
  | 'plan_request';

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string;
  avatar_url: string | null;
  city_id: string | null;
  bio: string | null;
  birth_year: number | null;
  show_age: boolean;
  gender: Gender | null;
  zone_id: string | null;
  latitude: number | null;
  longitude: number | null;
  interests_text: string | null;
  reputation_score: number;
  plans_created_count: number;
  plans_joined_count: number;
  created_at: string;
  updated_at: string;
  // Joined
  zone?: Zone;
  interests?: UserInterest[];
  photos?: UserPhoto[];
}

export interface City {
  id: string;
  name: string;
  province: string;
  country: string;
  is_active: boolean;
}

export interface Zone {
  id: string;
  city_id: string;
  name: string;
  is_active: boolean;
}

export interface BusinessCategory {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  is_active: boolean;
}

export interface Business {
  id: string;
  owner_user_id: string;
  category_id: string;
  city_id: string;
  zone_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  whatsapp: string | null;
  instagram: string | null;
  cover_image_url: string | null;
  logo_url: string | null;
  is_verified: boolean;
  is_featured: boolean;
  status: BusinessStatus;
  created_at: string;
  updated_at: string;
  category?: BusinessCategory;
  zone?: Zone;
  city?: City;
}

export interface BusinessHours {
  id: string;
  business_id: string;
  weekday: number;
  opens_at: string;
  closes_at: string;
  is_closed: boolean;
}

export interface Campaign {
  id: string;
  business_id: string;
  type: CampaignType;
  title: string;
  short_description: string;
  full_description: string | null;
  starts_at: string;
  ends_at: string;
  status: CampaignStatus;
  max_capacity: number | null;
  min_group_size: number | null;
  price_text: string | null;
  is_free: boolean;
  is_featured: boolean;
  requires_reservation: boolean;
  requires_checkin: boolean;
  banner_image_url: string | null;
  created_at: string;
  updated_at: string;
  business?: Business;
  reservations_count?: number;
  tags?: CampaignTag[];
}

export interface CampaignTag {
  id: string;
  name: string;
  slug: string;
}

export interface Reservation {
  id: string;
  campaign_id: string;
  user_id: string;
  party_size: number;
  status: ReservationStatus;
  reserved_at: string;
  notes: string | null;
  campaign?: Campaign;
  profile?: Profile;
}

export interface Checkin {
  id: string;
  campaign_id: string;
  user_id: string;
  business_id: string;
  reservation_id: string | null;
  checked_in_at: string;
  method: string;
}

export interface Redemption {
  id: string;
  campaign_id: string;
  user_id: string;
  business_id: string;
  redeemed_at: string;
  status: string;
}

export interface Favorite {
  id: string;
  user_id: string;
  business_id: string | null;
  campaign_id: string | null;
  created_at: string;
}

export interface AnalyticsEvent {
  id: string;
  event_type: AnalyticsEventType;
  user_id: string | null;
  business_id: string | null;
  campaign_id: string | null;
  reservation_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

// ============================================================
// Sprint 2: Social Plans & Enhanced Profiles
// ============================================================

export interface SocialPlan {
  id: string;
  creator_id: string;
  campaign_id: string | null;
  title: string;
  description: string | null;
  plan_date: string;
  plan_time: string | null;
  meeting_point: string | null;
  max_members: number;
  status: PlanStatus;
  visibility: PlanVisibility;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  updated_at: string;
  // Joined
  creator?: Profile;
  campaign?: Campaign;
  members?: SocialPlanMember[];
  members_count?: number;
  requests_count?: number;
}

export interface SocialPlanRequest {
  id: string;
  plan_id: string;
  user_id: string;
  message: string | null;
  status: PlanRequestStatus;
  created_at: string;
  responded_at: string | null;
  // Joined
  user?: Profile;
  plan?: SocialPlan;
}

export interface SocialPlanMember {
  id: string;
  plan_id: string;
  user_id: string;
  role: 'creator' | 'member';
  joined_at: string;
  // Joined
  user?: Profile;
}

export interface UserInterest {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  category: string;
  sort_order: number;
}

export interface UserPhoto {
  id: string;
  user_id: string;
  photo_url: string;
  caption: string | null;
  sort_order: number;
  created_at: string;
}

export type TransactionType = 'income' | 'expense';

export interface BusinessTransaction {
  id: string;
  business_id: string;
  campaign_id: string | null;
  type: TransactionType;
  amount: number;
  description: string;
  category: string;
  transaction_date: string;
  created_at: string;
}

// Supabase DB type (stub)
export interface Database {
  public: {
    Tables: Record<string, unknown>;
    Views: Record<string, unknown>;
    Functions: Record<string, unknown>;
    Enums: Record<string, unknown>;
  };
}

// ============================================================
// v3: New Features Types
// ============================================================

export interface PlanCategory {
  id: string;
  name: string;
  slug: string;
  emoji: string;
  sort_order: number;
}

export interface PlanChatMessage {
  id: string;
  plan_id: string;
  user_id: string;
  content: string;
  created_at: string;
  user?: Profile;
}

export interface PlanReview {
  id: string;
  plan_id: string;
  reviewer_id: string;
  reviewed_user_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  reviewer?: Profile;
  reviewed_user?: Profile;
}

export interface PlanPhoto {
  id: string;
  plan_id: string;
  user_id: string;
  photo_url: string;
  caption: string | null;
  created_at: string;
  user?: Profile;
}

export type FeedAction = 'created_plan' | 'joined_plan' | 'completed_plan' | 'reviewed' | 'uploaded_photo';

export interface ActivityFeedItem {
  id: string;
  actor_id: string;
  action: FeedAction;
  target_type: 'plan' | 'user' | 'photo';
  target_id: string;
  metadata: Record<string, any> | null;
  created_at: string;
  actor?: Profile;
}

export type ReportReason = 'inappropriate' | 'harassment' | 'spam' | 'fake' | 'dangerous' | 'other';

export interface UserReport {
  id: string;
  reporter_id: string;
  target_type: 'user' | 'plan';
  target_id: string;
  reason: ReportReason;
  description: string | null;
  status: 'pending' | 'reviewing' | 'resolved' | 'dismissed';
  created_at: string;
}

export interface LoyaltyCard {
  id: string;
  business_id: string;
  name: string;
  stamps_required: number;
  reward: string;
  is_active: boolean;
  created_at: string;
  business?: Business;
}

export interface LoyaltyStamp {
  id: string;
  card_id: string;
  user_id: string;
  stamps_count: number;
  redeemed: boolean;
  created_at: string;
  card?: LoyaltyCard;
}


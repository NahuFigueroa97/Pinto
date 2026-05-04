-- ============================================================
-- PINTÓ v3 — Auto-cleanup policies
-- Prevents database bloat by removing old data automatically
-- Run AFTER 008_v3_features.sql
-- ============================================================

-- 1. Auto-delete chat messages older than 90 days
CREATE OR REPLACE FUNCTION public.cleanup_old_chat_messages()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.plan_chat_messages
  WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$;

-- 2. Auto-delete activity feed older than 60 days
CREATE OR REPLACE FUNCTION public.cleanup_old_feed()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.activity_feed
  WHERE created_at < NOW() - INTERVAL '60 days';
END;
$$;

-- 3. Auto-delete resolved/dismissed reports older than 180 days
CREATE OR REPLACE FUNCTION public.cleanup_old_reports()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.user_reports
  WHERE status IN ('resolved', 'dismissed')
    AND created_at < NOW() - INTERVAL '180 days';
END;
$$;

-- 4. Auto-close plans that are 7+ days past their date and still 'open'
CREATE OR REPLACE FUNCTION public.cleanup_expired_plans()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  UPDATE public.social_plans
  SET status = 'closed'
  WHERE status = 'open'
    AND plan_date < (CURRENT_DATE - INTERVAL '7 days');
END;
$$;

-- 5. Auto-delete old notifications (read older than 30 days, unread older than 90 days)
CREATE OR REPLACE FUNCTION public.cleanup_old_notifications()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.notifications
  WHERE (is_read = true AND created_at < NOW() - INTERVAL '30 days')
     OR (is_read = false AND created_at < NOW() - INTERVAL '90 days');
END;
$$;

-- 6. Master cleanup function — call all cleanup functions
CREATE OR REPLACE FUNCTION public.run_all_cleanups()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  result jsonb;
  chat_count int;
  feed_count int;
  report_count int;
  plan_count int;
  notif_count int;
BEGIN
  -- Count before
  SELECT COUNT(*) INTO chat_count FROM public.plan_chat_messages WHERE created_at < NOW() - INTERVAL '90 days';
  SELECT COUNT(*) INTO feed_count FROM public.activity_feed WHERE created_at < NOW() - INTERVAL '60 days';
  SELECT COUNT(*) INTO report_count FROM public.user_reports WHERE status IN ('resolved','dismissed') AND created_at < NOW() - INTERVAL '180 days';
  SELECT COUNT(*) INTO plan_count FROM public.social_plans WHERE status = 'open' AND plan_date < (CURRENT_DATE - INTERVAL '7 days');
  SELECT COUNT(*) INTO notif_count FROM public.notifications WHERE (is_read = true AND created_at < NOW() - INTERVAL '30 days') OR (is_read = false AND created_at < NOW() - INTERVAL '90 days');

  -- Run cleanups
  PERFORM public.cleanup_old_chat_messages();
  PERFORM public.cleanup_old_feed();
  PERFORM public.cleanup_old_reports();
  PERFORM public.cleanup_expired_plans();
  PERFORM public.cleanup_old_notifications();

  result := jsonb_build_object(
    'chat_messages_deleted', chat_count,
    'feed_items_deleted', feed_count,
    'reports_deleted', report_count,
    'plans_closed', plan_count,
    'notifications_deleted', notif_count,
    'executed_at', NOW()
  );

  RETURN result;
END;
$$;

-- ============================================================
-- CRON SETUP (requires pg_cron extension in Supabase)
-- Go to Supabase Dashboard > Database > Extensions > Enable pg_cron
-- Then run:
-- 
-- SELECT cron.schedule(
--   'daily-cleanup',
--   '0 4 * * *',  -- Every day at 4:00 AM UTC
--   $$ SELECT public.run_all_cleanups() $$
-- );
--
-- To check scheduled jobs: SELECT * FROM cron.job;
-- To see execution history: SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
-- ============================================================

-- ============================================================
-- STORAGE BUCKET for plan photos
-- Run this in Supabase SQL Editor:
-- ============================================================

-- Create bucket (if using Supabase Storage for photos)
INSERT INTO storage.buckets (id, name, public)
VALUES ('plan-photos', 'plan-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to plan-photos
CREATE POLICY "plan_photos_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'plan-photos'
    AND auth.role() = 'authenticated'
  );

-- Allow public read of plan photos
CREATE POLICY "plan_photos_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'plan-photos');

-- Allow users to delete their own uploads
CREATE POLICY "plan_photos_delete_own" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'plan-photos'
    AND auth.uid()::text = (storage.foldername(name))[3]
  );

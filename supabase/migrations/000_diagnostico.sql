-- ============================================================
-- PINTÓ — Diagnóstico: ¿qué migraciones están aplicadas?
--
-- No modifica nada. Pegalo en el SQL Editor de Supabase y ejecutalo
-- ANTES de correr 010 y 011.
--
-- Existe porque el historial de migraciones del repo y el estado real
-- de la base no coincidían: al correr 010 falló con
-- "relation public.business_messages does not exist", o sea que la
-- migración 005 nunca se había aplicado.
-- ============================================================

WITH esperado(migracion, objeto, tipo) AS (
  VALUES
    ('001_schema',            'profiles',              'tabla'),
    ('001_schema',            'businesses',            'tabla'),
    ('001_schema',            'campaigns',             'tabla'),
    ('001_schema',            'reservations',          'tabla'),
    ('001_schema',            'checkins',              'tabla'),
    ('001_schema',            'redemptions',           'tabla'),
    ('001_schema',            'favorites',             'tabla'),
    ('001_schema',            'analytics_events',      'tabla'),
    ('001_schema',            'cities',                'tabla'),
    ('001_schema',            'zones',                 'tabla'),
    ('001_schema',            'business_categories',   'tabla'),
    ('001_schema',            'business_hours',        'tabla'),
    ('001_schema',            'get_user_role',         'función'),
    ('003_sprint2',           'social_plans',          'tabla'),
    ('003_sprint2',           'social_plan_members',   'tabla'),
    ('003_sprint2',           'social_plan_requests',  'tabla'),
    ('003_sprint2',           'user_interests',        'tabla'),
    ('003_sprint2',           'user_interest_links',   'tabla'),
    ('003_sprint2',           'user_photos',           'tabla'),
    ('004_business_finance',  'business_transactions', 'tabla'),
    ('005_business_messages', 'business_messages',     'tabla'),
    ('006_campaign_delete',   'cleanup_old_messages',  'función'),
    ('007_avatar_storage',    'avatars',               'bucket'),
    ('008_v3_features',       'plan_categories',       'tabla'),
    ('008_v3_features',       'plan_chat_messages',    'tabla'),
    ('008_v3_features',       'plan_reviews',          'tabla'),
    ('008_v3_features',       'plan_photos',           'tabla'),
    ('008_v3_features',       'activity_feed',         'tabla'),
    ('008_v3_features',       'user_reports',          'tabla'),
    ('008_v3_features',       'loyalty_cards',         'tabla'),
    ('008_v3_features',       'loyalty_stamps',        'tabla'),
    ('009_auto_cleanup',      'cleanup_old_chat_messages', 'función'),
    ('009_auto_cleanup',      'cleanup_expired_plans', 'función'),
    ('009_auto_cleanup',      'plan-photos',           'bucket'),
    ('010_security_fixes',    'protect_profile_columns', 'función'),
    ('011_push_checkin',      'device_tokens',         'tabla'),
    ('011_push_checkin',      'notification_queue',    'tabla'),
    ('011_push_checkin',      'user_blocks',           'tabla'),
    ('011_push_checkin',      'delete_my_account',     'función'),
    ('011_push_checkin',      'redeem_reservation',    'función')
)
SELECT
  e.migracion,
  e.tipo,
  e.objeto,
  CASE
    WHEN e.tipo = 'tabla'  AND to_regclass('public.' || quote_ident(e.objeto)) IS NOT NULL THEN '✅'
    WHEN e.tipo = 'función' AND EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = e.objeto) THEN '✅'
    WHEN e.tipo = 'bucket' AND EXISTS (
      SELECT 1 FROM storage.buckets b WHERE b.id = e.objeto) THEN '✅'
    ELSE '❌ FALTA'
  END AS estado
FROM esperado e
ORDER BY e.migracion, e.tipo, e.objeto;

-- Bonus: columnas que la app usa y que dependen de migraciones posteriores
SELECT
  'profiles.' || c.column_name AS columna,
  '✅' AS estado
FROM information_schema.columns c
WHERE c.table_schema = 'public' AND c.table_name = 'profiles'
  AND c.column_name IN ('birth_year','reputation_score','is_verified','latitude','longitude')
ORDER BY 1;

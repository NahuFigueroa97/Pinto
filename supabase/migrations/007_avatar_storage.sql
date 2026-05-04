-- 007: Storage bucket for avatars
-- Run this in the Supabase SQL Editor to create the storage bucket

INSERT INTO storage.buckets (id, name, public) 
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload their own avatar
CREATE POLICY "Users upload own avatar" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = 'avatars');

-- Allow anyone to view avatars (public bucket)
CREATE POLICY "Public avatar access" ON storage.objects
FOR SELECT TO public
USING (bucket_id = 'avatars');

-- Allow users to update/delete their own avatar
CREATE POLICY "Users update own avatar" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'avatars');

CREATE POLICY "Users delete own avatar" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'avatars');

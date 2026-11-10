-- ============================================================
-- Romantic Proposal — OPTIONAL voice recordings (private Storage)
-- Run in the Supabase SQL Editor (Dashboard → SQL → New query).
-- Safe to run more than once. Does not touch proposal_responses.
--
-- WHO CAN DO WHAT
--   Visitors (publishable/anon key)  → upload ONE new audio file, nothing else.
--                                      They can never list, read, overwrite or delete.
--   The administrator                → list, play and download (signed URLs).
--                                      "Administrator" = a signed-in user whose id is
--                                      in public.admin_users (see voice_recordings_admin.sql).
--                                      Merely being signed in is NOT enough.
--   Everyone else                    → nothing.
-- No service_role / secret key is used anywhere in the website code.
-- ============================================================

-- 1. Admin allow-list -----------------------------------------------------
-- Rows are added by YOU in the SQL editor. The API cannot write to this table.
CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id    uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.admin_users FROM anon, authenticated;
GRANT SELECT ON public.admin_users TO authenticated;

DROP POLICY IF EXISTS "Users can see their own admin row" ON public.admin_users;
CREATE POLICY "Users can see their own admin row"
  ON public.admin_users
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- 2. Upload cap (stops anonymous visitors from filling your storage) -------
-- RLS cannot "see" other rows for anon, so the count runs in a tiny function
-- that lives in a schema the Data API does not expose (`private`).
-- Change 100 in the policy below if you want a different ceiling.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO anon, authenticated;

CREATE OR REPLACE FUNCTION private.voice_recordings_count()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT count(*) FROM storage.objects WHERE bucket_id = 'voice-recordings';
$$;

REVOKE ALL ON FUNCTION private.voice_recordings_count() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.voice_recordings_count() TO anon, authenticated;

-- 3. Private bucket with server-side type + size limits ---------------------
-- public = false      → files are never reachable by a plain URL.
-- file_size_limit     → 5 MB (5 242 880 bytes), enforced by Storage itself.
-- allowed_mime_types  → only the audio formats MediaRecorder produces.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'voice-recordings',
  'voice-recordings',
  false,
  5242880,
  ARRAY['audio/webm', 'audio/ogg', 'audio/mp4']
)
ON CONFLICT (id) DO UPDATE
  SET public             = false,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 4. Policies on storage.objects (RLS is already enabled by Supabase) --------
DROP POLICY IF EXISTS "voice-recordings: visitors may upload a new recording" ON storage.objects;
DROP POLICY IF EXISTS "voice-recordings: only the admin may list and download" ON storage.objects;

-- Upload only (INSERT). No UPDATE ⇒ nobody can overwrite (upsert is impossible).
-- No DELETE ⇒ nobody can delete through the API. Name must be exactly:
--   <uuid>-<seconds>s.<webm|ogg|m4a>     e.g.  3f2b…-42s.webm
-- which also rules out folders, "../" tricks and executable-looking names.
CREATE POLICY "voice-recordings: visitors may upload a new recording"
  ON storage.objects
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    bucket_id = 'voice-recordings'
    AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[0-9]{1,4}s\.(webm|ogg|m4a)$'
    AND private.voice_recordings_count() < 100
  );

-- Read (list, download, create signed URL) — administrator only.
CREATE POLICY "voice-recordings: only the admin may list and download"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'voice-recordings'
    AND EXISTS (
      SELECT 1 FROM public.admin_users a
      WHERE a.user_id = (SELECT auth.uid())
    )
  );

-- ============================================================
-- After running this file:
--   1. Create your admin user (Authentication → Users → Add user).
--   2. Run supabase/voice_recordings_admin.sql with your email.
--   3. Authentication → Sign In / Providers → turn OFF "Allow new users to sign up".
-- ============================================================

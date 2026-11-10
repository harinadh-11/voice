-- ============================================================
-- Romantic Proposal — Supabase schema & security policies
-- Run this in the Supabase SQL Editor (Dashboard → SQL → New query)
-- ============================================================

-- 1. Table: proposal_responses
-- Stores only the answer and a server-generated timestamp.
-- No location, IP, or other personal data is collected by this schema.

CREATE TABLE IF NOT EXISTS public.proposal_responses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  answer      text NOT NULL CHECK (answer IN ('YES', 'NO')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Optional: index for chronological reads
CREATE INDEX IF NOT EXISTS proposal_responses_created_at_idx
  ON public.proposal_responses (created_at DESC);

-- 2. Enable Row Level Security
ALTER TABLE public.proposal_responses ENABLE ROW LEVEL SECURITY;

-- 3. Policies
-- Drop existing policies if re-running (safe for setup scripts)
DROP POLICY IF EXISTS "Allow public insert of valid answers" ON public.proposal_responses;
DROP POLICY IF EXISTS "Allow authenticated admin to read" ON public.proposal_responses;
DROP POLICY IF EXISTS "No public read" ON public.proposal_responses;
DROP POLICY IF EXISTS "No public update" ON public.proposal_responses;
DROP POLICY IF EXISTS "No public delete" ON public.proposal_responses;

-- Public visitors may INSERT a valid YES/NO answer only.
-- They cannot choose an arbitrary id or created_at (defaults apply).
CREATE POLICY "Allow public insert of valid answers"
  ON public.proposal_responses
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (answer IN ('YES', 'NO'));

-- Only authenticated users (your admin account) may SELECT.
-- Restrict further by email if desired (see notes below).
CREATE POLICY "Allow authenticated admin to read"
  ON public.proposal_responses
  FOR SELECT
  TO authenticated
  USING (true);

-- Explicitly deny UPDATE and DELETE for everyone via RLS
-- (no policies = denied for those operations when RLS is on)
-- Extra safety: block updates/deletes even for authenticated if you prefer.
-- Uncomment the following if you want zero modifications after insert:

-- CREATE POLICY "No updates"
--   ON public.proposal_responses
--   FOR UPDATE
--   TO authenticated
--   USING (false);

-- CREATE POLICY "No deletes"
--   ON public.proposal_responses
--   FOR DELETE
--   TO authenticated
--   USING (false);

-- 4. Grants
-- Table is in public schema; ensure anon can insert, authenticated can select.
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT INSERT ON public.proposal_responses TO anon, authenticated;
GRANT SELECT ON public.proposal_responses TO authenticated;
-- Revoke broad rights that might exist from defaults
REVOKE UPDATE, DELETE ON public.proposal_responses FROM anon, authenticated;
REVOKE ALL ON public.proposal_responses FROM public;

-- ============================================================
-- Admin account setup (do this in Supabase Dashboard, not SQL)
-- ============================================================
-- 1. Go to Authentication → Users → Add user
-- 2. Create a user with your email and a strong password
-- 3. Confirm the user (or disable email confirmation in Auth settings
--    for a single private admin account if you prefer)
-- 4. Sign in at admin.html with that email/password
--
-- Optional tighter read policy (replace the SELECT policy above):
--
-- DROP POLICY IF EXISTS "Allow authenticated admin to read" ON public.proposal_responses;
-- CREATE POLICY "Allow specific admin email to read"
--   ON public.proposal_responses
--   FOR SELECT
--   TO authenticated
--   USING (auth.jwt() ->> 'email' = 'your-admin@email.com');
--
-- ============================================================
-- Notes
-- ============================================================
-- • Never put the service_role key in frontend code.
-- • The anon key is safe to use in the browser when RLS is correct.
-- • Anonymous submissions cannot identify a unique person reliably.
--   Multiple YES/NO rows may exist if the page is visited more than once.
-- • This schema does not collect IP, location, or device fingerprints.

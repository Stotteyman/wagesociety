-- Fix org_member_livestreams schema to support multiple platforms per user
-- Currently the schema has: email UNIQUE, which prevents Kick + YouTube coexistence
-- New schema: composite unique (email, platform)

-- Drop the old unique constraint and add the new one
ALTER TABLE public.org_member_livestreams
DROP CONSTRAINT IF EXISTS org_member_livestreams_email_key;

ALTER TABLE public.org_member_livestreams
ADD CONSTRAINT org_member_livestreams_email_platform_key UNIQUE (email, platform);

-- Update the RLS policies to be simpler and clearer
DROP POLICY IF EXISTS "allow_read_livestreams" ON public.org_member_livestreams;
DROP POLICY IF EXISTS "allow_update_own_livestream" ON public.org_member_livestreams;
DROP POLICY IF EXISTS "allow_insert_livestream" ON public.org_member_livestreams;
DROP POLICY IF EXISTS "allow_delete_livestream" ON public.org_member_livestreams;

-- Create new, clearer policies
CREATE POLICY "livestreams_allow_read" ON public.org_member_livestreams
  FOR SELECT USING (true);

CREATE POLICY "livestreams_allow_insert_own" ON public.org_member_livestreams
  FOR INSERT WITH CHECK (auth.jwt() ->> 'email' = email);

CREATE POLICY "livestreams_allow_update_own" ON public.org_member_livestreams
  FOR UPDATE USING (auth.jwt() ->> 'email' = email);

CREATE POLICY "livestreams_allow_delete_own" ON public.org_member_livestreams
  FOR DELETE USING (auth.jwt() ->> 'email' = email);

-- Fix overly permissive phone_allowlist RLS policy.
-- The "Service role can read allowlist" policy used USING (true), which allows
-- ANY authenticated user to read the full allowlist via the Supabase client.
-- Service role already bypasses RLS, so this policy is unnecessary.
DROP POLICY IF EXISTS "Service role can read allowlist" ON public.phone_allowlist;

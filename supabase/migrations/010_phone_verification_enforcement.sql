-- Server-side phone verification enforcement.
--
-- Previously nothing server-side proved a Twilio verification succeeded:
-- an attacker could call supabase.auth.signUp / signInWithOtp directly with
-- any allowlisted phone in user_metadata (the auth callback only re-checked
-- the allowlist), or insert a users row directly via PostgREST using the
-- "Users can insert own profile" policy.
--
-- This migration adds:
--   1. phone_verifications: a service-role-only ledger written by
--      /api/verify-phone/check when Twilio approves a code, and consumed by
--      /auth/callback and /auth/confirm when creating the profile.
--   2. users.phone_verified, set server-side at profile creation.
--   3. Locked-down users grants/policies so clients cannot create profiles
--      or modify verification/privilege columns directly.

-- 1. Verification ledger (proof of phone ownership, bound to the signup email)
create table public.phone_verifications (
  phone text primary key,
  email text not null,
  verified_at timestamptz not null default now()
);

-- Service role only (it bypasses RLS): enable RLS with no policies and
-- revoke the default grants so anon/authenticated cannot read or write.
alter table public.phone_verifications enable row level security;
revoke all on public.phone_verifications from anon, authenticated;

-- 2. Verification flag on users
alter table public.users add column phone_verified boolean not null default false;

-- Existing users were admitted under the previous flow; grandfather them so a
-- future phone_verified gate does not lock them out.
update public.users set phone_verified = true;

-- 3. Profile creation is server-only (auth/callback and auth/confirm use the
-- service role). Without this, any authenticated session could insert its own
-- users row with an arbitrary phone and phone_verified = true, bypassing
-- verification entirely.
drop policy "Users can insert own profile" on public.users;
revoke insert on public.users from anon, authenticated;

-- Clients may only update their editable profile fields — not phone,
-- phone_verified, is_admin, is_banned, or email. (updated_at is set by
-- trigger and needs no grant.)
revoke update on public.users from anon, authenticated;
grant update (name, default_dietary_restrictions, default_kashrut_preference, default_shabbat_observance)
  on public.users to authenticated;

-- Add ban columns to users table
ALTER TABLE public.users
  ADD COLUMN is_banned boolean NOT NULL DEFAULT false,
  ADD COLUMN banned_at timestamptz;

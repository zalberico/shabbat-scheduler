-- Migration: Observance tiers, addresses for walking distance, phone verification tracking

-- Feature 1: Observance levels on weekly signups
ALTER TABLE public.weekly_hosts
  ADD COLUMN observance_level text NOT NULL DEFAULT 'flexible'
  CHECK (observance_level IN ('flexible', 'traditional', 'shomer_shabbat'));

ALTER TABLE public.weekly_guests
  ADD COLUMN observance_requirement text NOT NULL DEFAULT 'flexible'
  CHECK (observance_requirement IN ('flexible', 'traditional', 'shomer_shabbat'));

-- Feature 2: Addresses and geocoding for walking distance
ALTER TABLE public.weekly_hosts
  ADD COLUMN address text,
  ADD COLUMN lat double precision,
  ADD COLUMN lng double precision;

ALTER TABLE public.weekly_guests
  ADD COLUMN address text,
  ADD COLUMN lat double precision,
  ADD COLUMN lng double precision;

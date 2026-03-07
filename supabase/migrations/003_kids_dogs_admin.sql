-- Add kids/dogs friendly options for hosts
ALTER TABLE public.weekly_hosts
  ADD COLUMN kids_friendly boolean NOT NULL DEFAULT false,
  ADD COLUMN dogs_friendly boolean NOT NULL DEFAULT false;

-- Add kid-friendly/dog-free needs for guests
ALTER TABLE public.weekly_guests
  ADD COLUMN needs_kid_friendly boolean NOT NULL DEFAULT false,
  ADD COLUMN needs_dog_free boolean NOT NULL DEFAULT false;

-- Rename needs_dog_free to needs_dog_friendly (guest wants to bring their dog)
ALTER TABLE public.weekly_guests RENAME COLUMN needs_dog_free TO needs_dog_friendly;

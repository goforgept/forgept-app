-- Add description field to global_products for storing product descriptive labels
ALTER TABLE public.global_products
  ADD COLUMN IF NOT EXISTS description text;

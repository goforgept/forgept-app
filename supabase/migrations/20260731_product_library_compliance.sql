-- Add compliance fields to product_library so they can be stored once
-- and auto-populated into BOM line items when syncing from a drawing.
ALTER TABLE public.product_library
  ADD COLUMN IF NOT EXISTS lead_time         text,
  ADD COLUMN IF NOT EXISTS country_of_origin text,
  ADD COLUMN IF NOT EXISTS berry_compliance  text;

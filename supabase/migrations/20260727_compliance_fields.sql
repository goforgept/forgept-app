-- Compliance fields on BOM line items (lead time, country of origin, Berry Amendment)
ALTER TABLE public.bom_line_items
  ADD COLUMN IF NOT EXISTS lead_time text,
  ADD COLUMN IF NOT EXISTS country_of_origin text,
  ADD COLUMN IF NOT EXISTS berry_compliance text;

-- Feature flag to enable these columns per-org
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS feature_compliance_fields boolean DEFAULT false;

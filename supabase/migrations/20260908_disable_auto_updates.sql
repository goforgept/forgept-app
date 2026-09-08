-- Adds a per-proposal flag to disable automatic pricing/MSRP/compliance lookups
-- when syncing drawing to BOM. When true, items are inserted as 'Needs Pricing'
-- and the product-library lookup step is skipped entirely.

ALTER TABLE proposals ADD COLUMN IF NOT EXISTS disable_auto_updates boolean DEFAULT false;

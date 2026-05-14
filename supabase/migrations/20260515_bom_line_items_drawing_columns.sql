-- Add columns required by sync_drawing_to_bom RPC
ALTER TABLE bom_line_items
  ADD COLUMN IF NOT EXISTS product_id        UUID,
  ADD COLUMN IF NOT EXISTS global_product_id UUID,
  ADD COLUMN IF NOT EXISTS approved_by       UUID;

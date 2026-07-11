-- Power source (which UPS/PDU in the rack powers this item)
-- Connected placements (which canvas devices plug into this rack item)
ALTER TABLE rack_items
  ADD COLUMN IF NOT EXISTS power_source_id         uuid      REFERENCES rack_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS connected_placement_ids  jsonb     NOT NULL DEFAULT '[]'::jsonb;

-- Switch/power-source association for PoE budget tracking
ALTER TABLE drawing_placements ADD COLUMN IF NOT EXISTS switch_placement_id uuid REFERENCES drawing_placements(id) ON DELETE SET NULL;

-- Per-placement watt override (overrides product's specs.power_watts)
ALTER TABLE drawing_placements ADD COLUMN IF NOT EXISTS watts_override float;

CREATE INDEX IF NOT EXISTS idx_placements_switch ON drawing_placements(switch_placement_id);

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS feature_msrp boolean NOT NULL DEFAULT false;
ALTER TABLE product_library ADD COLUMN IF NOT EXISTS msrp numeric;
ALTER TABLE bom_line_items ADD COLUMN IF NOT EXISTS msrp_unit numeric;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS show_msrp boolean NOT NULL DEFAULT false;

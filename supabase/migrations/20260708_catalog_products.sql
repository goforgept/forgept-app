-- Global manufacturer catalog (e.g. Hanwha Step Partner Pricesheet).
-- Managed by super-admin. Orgs see only the catalogs enabled for them.

CREATE TABLE IF NOT EXISTS catalog_products (
  id            uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_slug  text    NOT NULL,                          -- e.g. 'hanwha_step'
  catalog_label text    NOT NULL DEFAULT '',               -- e.g. 'Hanwha Step Partner'
  manufacturer  text    NOT NULL DEFAULT '',
  part_number   text    NOT NULL DEFAULT '',
  model_name    text    NOT NULL DEFAULT '',
  msrp          numeric,
  category      text,
  description   text,
  unit          text    NOT NULL DEFAULT 'ea',
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS catalog_products_slug_idx ON catalog_products(catalog_slug);
CREATE INDEX IF NOT EXISTS catalog_products_search_idx ON catalog_products(part_number, model_name, manufacturer);

-- Which global catalogs each org can see/search.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS enabled_catalogs jsonb NOT NULL DEFAULT '[]';

-- Track which product_library rows were copied from a catalog item,
-- so pricing added there is reused when the same item is added to a BOM.
ALTER TABLE product_library
  ADD COLUMN IF NOT EXISTS catalog_product_id uuid REFERENCES catalog_products(id) ON DELETE SET NULL;

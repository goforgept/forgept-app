-- Components attached to individual rack items (SFP modules, power supplies, fan modules, etc.)
CREATE TABLE IF NOT EXISTS rack_item_components (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rack_item_id    uuid NOT NULL REFERENCES rack_items(id) ON DELETE CASCADE,
  component_type  text NOT NULL DEFAULT 'SFP Module',
  name            text,
  part_number     text,
  manufacturer    text,
  quantity        integer NOT NULL DEFAULT 1,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rack_item_components ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rack_item_components_org_access" ON rack_item_components
  USING (
    EXISTS (
      SELECT 1
      FROM rack_items ri
      INNER JOIN racks ra ON ra.id = ri.rack_id
      INNER JOIN rooms ro ON ro.id = ra.room_id
      INNER JOIN profiles p ON p.org_id = ro.org_id
      WHERE ri.id = rack_item_components.rack_item_id
        AND p.id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM rack_items ri
      INNER JOIN racks ra ON ra.id = ri.rack_id
      INNER JOIN rooms ro ON ro.id = ra.room_id
      INNER JOIN profiles p ON p.org_id = ro.org_id
      WHERE ri.id = rack_item_components.rack_item_id
        AND p.id = auth.uid()
    )
  );

-- Include rack item components in BOM sync
CREATE OR REPLACE FUNCTION sync_drawing_to_bom(p_proposal_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Remove old auto-synced rows
  DELETE FROM bom_line_items
  WHERE proposal_id = p_proposal_id AND source = 'drawing';

  -- ── Floor plan placements ──────────────────────────────────────────────────
  INSERT INTO bom_line_items (
    proposal_id, source, item_name, manufacturer, part_number, category, quantity
  )
  SELECT
    p_proposal_id,
    'drawing',
    COALESCE(dp.description_override, gp.name, 'Unknown Device'),
    COALESCE(dp.manufacturer_override, gp.manufacturer),
    COALESCE(dp.part_number_override, gp.part_number),
    COALESCE(dp.category_override, gp.category),
    SUM(dp.quantity)
  FROM drawing_placements dp
  LEFT JOIN global_products gp ON gp.id = dp.global_product_id
  WHERE dp.proposal_id = p_proposal_id
  GROUP BY
    COALESCE(dp.description_override, gp.name, 'Unknown Device'),
    COALESCE(dp.manufacturer_override, gp.manufacturer),
    COALESCE(dp.part_number_override, gp.part_number),
    COALESCE(dp.category_override, gp.category);

  -- ── Rack items ─────────────────────────────────────────────────────────────
  INSERT INTO bom_line_items (
    proposal_id, source, item_name, manufacturer, part_number, category, quantity
  )
  SELECT
    p_proposal_id,
    'drawing',
    COALESCE(ri.label, gp.name, 'Rack Device'),
    COALESCE(ri.manufacturer, gp.manufacturer),
    COALESCE(ri.part_number, ri.model, gp.part_number),
    COALESCE(ri.category, gp.category),
    SUM(ri.quantity)
  FROM rack_items ri
  LEFT JOIN global_products gp ON gp.id = ri.global_product_id
  INNER JOIN racks ra ON ra.id = ri.rack_id
  INNER JOIN rooms ro ON ro.id = ra.room_id
  WHERE ro.proposal_id = p_proposal_id
  GROUP BY
    COALESCE(ri.label, gp.name, 'Rack Device'),
    COALESCE(ri.manufacturer, gp.manufacturer),
    COALESCE(ri.part_number, ri.model, gp.part_number),
    COALESCE(ri.category, gp.category);

  -- ── Rack enclosures (racks with a part_number) ────────────────────────────
  INSERT INTO bom_line_items (
    proposal_id, source, item_name, manufacturer, part_number, category, quantity
  )
  SELECT
    p_proposal_id,
    'drawing',
    COALESCE(ra.name, 'Rack Enclosure'),
    ra.manufacturer,
    ra.part_number,
    'Rack Enclosure',
    COUNT(*)
  FROM racks ra
  INNER JOIN rooms ro ON ro.id = ra.room_id
  WHERE ro.proposal_id = p_proposal_id
    AND ra.part_number IS NOT NULL
  GROUP BY ra.name, ra.manufacturer, ra.part_number;

  -- ── Rack accessories (rack_components) ────────────────────────────────────
  INSERT INTO bom_line_items (
    proposal_id, source, item_name, manufacturer, part_number, category, quantity
  )
  SELECT
    p_proposal_id,
    'drawing',
    COALESCE(rc.name, rc.component_type),
    rc.manufacturer,
    rc.part_number,
    rc.component_type,
    SUM(rc.quantity)
  FROM rack_components rc
  INNER JOIN racks ra ON ra.id = rc.rack_id
  INNER JOIN rooms ro ON ro.id = ra.room_id
  WHERE ro.proposal_id = p_proposal_id
  GROUP BY rc.name, rc.manufacturer, rc.part_number, rc.component_type;

  -- ── Rack item components (SFP modules, etc.) ──────────────────────────────
  INSERT INTO bom_line_items (
    proposal_id, source, item_name, manufacturer, part_number, category, quantity
  )
  SELECT
    p_proposal_id,
    'drawing',
    COALESCE(ric.name, ric.component_type),
    ric.manufacturer,
    ric.part_number,
    ric.component_type,
    SUM(ric.quantity)
  FROM rack_item_components ric
  INNER JOIN rack_items ri ON ri.id = ric.rack_item_id
  INNER JOIN racks ra ON ra.id = ri.rack_id
  INNER JOIN rooms ro ON ro.id = ra.room_id
  WHERE ro.proposal_id = p_proposal_id
  GROUP BY ric.name, ric.manufacturer, ric.part_number, ric.component_type;

END;
$$;

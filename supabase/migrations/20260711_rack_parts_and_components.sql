-- Add enclosure/cabinet product fields to racks
ALTER TABLE racks
  ADD COLUMN IF NOT EXISTS part_number  text,
  ADD COLUMN IF NOT EXISTS manufacturer text,
  ADD COLUMN IF NOT EXISTS model        text;

-- Rack-level accessories: cable management, patch cords, blank panels, misc items
CREATE TABLE IF NOT EXISTS rack_components (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  rack_id        uuid        NOT NULL REFERENCES racks(id) ON DELETE CASCADE,
  component_type text        NOT NULL DEFAULT 'Accessory',
  name           text,
  part_number    text,
  manufacturer   text,
  quantity       integer     NOT NULL DEFAULT 1,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE rack_components ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rack_components_via_racks" ON rack_components FOR ALL
  USING  (EXISTS (
    SELECT 1 FROM racks ra JOIN rooms ro ON ro.id = ra.room_id
    WHERE ra.id = rack_components.rack_id
      AND ro.org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM racks ra JOIN rooms ro ON ro.id = ra.room_id
    WHERE ra.id = rack_components.rack_id
      AND ro.org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
  ));

-- Update sync_drawing_to_bom to include rack enclosures and rack components
CREATE OR REPLACE FUNCTION public.sync_drawing_to_bom(
  p_proposal_id UUID,
  p_approved_by UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id        UUID;
  v_labor_enabled boolean := false;
BEGIN
  SELECT org_id INTO v_org_id FROM proposals WHERE id = p_proposal_id;
  SELECT COALESCE(designer_labor_enabled, false) INTO v_labor_enabled
    FROM organizations WHERE id = v_org_id;

  DELETE FROM bom_line_items WHERE proposal_id = p_proposal_id AND source = 'drawing';

  -- Device placements
  INSERT INTO bom_line_items (proposal_id, org_id, source, approved_by, item_name, manufacturer, part_number_sku, quantity, category, pricing_status, global_product_id, product_id)
  SELECT p_proposal_id, v_org_id, 'drawing', p_approved_by,
    COALESCE(dp.description_override, gp.name, 'Unknown Device'),
    COALESCE(dp.manufacturer_override, gp.manufacturer),
    COALESCE(dp.part_number_override, gp.part_number),
    SUM(COALESCE(dp.quantity, 1)), gp.category, 'Needs Pricing',
    dp.global_product_id, dp.product_id
  FROM drawing_placements dp
  LEFT  JOIN global_products gp ON gp.id = dp.global_product_id
  INNER JOIN drawing_sheets  ds ON ds.id = dp.drawing_sheet_id
  WHERE ds.proposal_id = p_proposal_id
  GROUP BY COALESCE(dp.description_override, gp.name, 'Unknown Device'),
    COALESCE(dp.manufacturer_override, gp.manufacturer),
    COALESCE(dp.part_number_override, gp.part_number),
    gp.category, dp.global_product_id, dp.product_id;

  -- Placement components
  INSERT INTO bom_line_items (proposal_id, org_id, source, approved_by, item_name, manufacturer, part_number_sku, quantity, category, pricing_status)
  SELECT p_proposal_id, v_org_id, 'drawing', p_approved_by,
    pc.name, pc.manufacturer, pc.part_number,
    SUM(COALESCE(pc.quantity, 1)), pc.component_type, 'Needs Pricing'
  FROM placement_components pc
  INNER JOIN drawing_placements dp ON dp.id = pc.placement_id
  INNER JOIN drawing_sheets     ds ON ds.id = dp.drawing_sheet_id
  WHERE ds.proposal_id = p_proposal_id
  GROUP BY pc.name, pc.manufacturer, pc.part_number, pc.component_type;

  -- Cable runs
  INSERT INTO bom_line_items (proposal_id, org_id, source, approved_by, item_name, part_number_sku, manufacturer, quantity, unit, category, pricing_status)
  SELECT p_proposal_id, v_org_id, 'drawing', p_approved_by,
    cr.cable_type || ' Cable', cr.part_number, NULL,
    SUM(COALESCE(cr.total_footage, 0)), 'ft', 'Cable', 'Needs Pricing'
  FROM cable_runs cr
  INNER JOIN drawing_sheets ds ON ds.id = cr.drawing_sheet_id
  WHERE ds.proposal_id = p_proposal_id
  GROUP BY cr.cable_type, cr.part_number;

  -- Vertical rises
  INSERT INTO bom_line_items (proposal_id, org_id, source, approved_by, item_name, part_number_sku, manufacturer, quantity, unit, category, pricing_status)
  SELECT p_proposal_id, v_org_id, 'drawing', p_approved_by,
    vr.cable_type || ' Cable (Vertical Rise)', NULL, NULL,
    SUM(COALESCE(vr.total_footage, 0)), 'ft', 'Cable', 'Needs Pricing'
  FROM vertical_rises vr WHERE vr.proposal_id = p_proposal_id
  GROUP BY vr.cable_type;

  -- Pathways (non-J-hook)
  INSERT INTO bom_line_items (proposal_id, org_id, source, approved_by, item_name, part_number_sku, manufacturer, quantity, unit, category, pricing_status)
  SELECT p_proposal_id, v_org_id, 'drawing', p_approved_by,
    CASE WHEN pw.size != '' THEN pw.size || ' ' || pw.pathway_type ELSE pw.pathway_type END,
    NULL, NULL, SUM(pw.total_footage), 'ft', 'Pathway', 'Needs Pricing'
  FROM drawing_pathways pw
  INNER JOIN drawing_sheets ds ON ds.id = pw.drawing_sheet_id
  WHERE ds.proposal_id = p_proposal_id AND pw.total_footage > 0 AND pw.pathway_type != 'J-hook'
  GROUP BY pw.pathway_type, pw.size;

  -- J-hooks
  INSERT INTO bom_line_items (proposal_id, org_id, source, approved_by, item_name, part_number_sku, manufacturer, quantity, unit, category, pricing_status)
  SELECT p_proposal_id, v_org_id, 'drawing', p_approved_by,
    CASE WHEN pw.size != '' THEN pw.size || ' J-Hook' ELSE 'J-Hook' END,
    NULL, NULL,
    SUM(CEIL(pw.total_footage::numeric / NULLIF(pw.hook_interval, 0))),
    'ea', 'Pathway Hardware', 'Needs Pricing'
  FROM drawing_pathways pw
  INNER JOIN drawing_sheets ds ON ds.id = pw.drawing_sheet_id
  WHERE ds.proposal_id = p_proposal_id AND pw.total_footage > 0 AND pw.pathway_type = 'J-hook'
  GROUP BY pw.size;

  -- Cables in pathways
  INSERT INTO bom_line_items (proposal_id, org_id, source, approved_by, item_name, part_number_sku, manufacturer, quantity, unit, category, pricing_status)
  SELECT p_proposal_id, v_org_id, 'drawing', p_approved_by,
    (ct->>'type') || ' Cable (Pathway)', NULL, NULL,
    SUM(COALESCE((ct->>'qty')::int, 1) * pw.total_footage),
    'ft', 'Cable', 'Needs Pricing'
  FROM drawing_pathways pw
  INNER JOIN drawing_sheets ds ON ds.id = pw.drawing_sheet_id
  CROSS JOIN jsonb_array_elements(pw.cable_types) AS ct
  WHERE ds.proposal_id = p_proposal_id AND pw.total_footage > 0 AND jsonb_array_length(pw.cable_types) > 0
  GROUP BY ct->>'type';

  -- Rack items (devices placed in U slots)
  INSERT INTO bom_line_items (proposal_id, org_id, source, approved_by, item_name, manufacturer, part_number_sku, quantity, category, pricing_status, global_product_id)
  SELECT p_proposal_id, v_org_id, 'drawing', p_approved_by,
    COALESCE(ri.label, gp.name, ri.model, 'Unknown Device'),
    COALESCE(ri.manufacturer, gp.manufacturer),
    COALESCE(ri.part_number, gp.part_number),
    SUM(COALESCE(ri.quantity, 1)),
    COALESCE(ri.category, gp.category), 'Needs Pricing',
    ri.global_product_id
  FROM rack_items ri
  INNER JOIN racks ra ON ra.id = ri.rack_id
  INNER JOIN rooms ro ON ro.id = ra.room_id
  LEFT  JOIN global_products gp ON gp.id = ri.global_product_id
  WHERE ro.proposal_id = p_proposal_id
  GROUP BY COALESCE(ri.label, gp.name, ri.model, 'Unknown Device'),
    COALESCE(ri.manufacturer, gp.manufacturer),
    COALESCE(ri.part_number, gp.part_number),
    COALESCE(ri.category, gp.category),
    ri.global_product_id;

  -- Rack enclosures (the physical cabinet/rack with a part number)
  INSERT INTO bom_line_items (proposal_id, org_id, source, approved_by, item_name, manufacturer, part_number_sku, quantity, category, pricing_status)
  SELECT p_proposal_id, v_org_id, 'drawing', p_approved_by,
    COALESCE(ra.name, 'Rack'), ra.manufacturer, ra.part_number,
    1, 'Rack', 'Needs Pricing'
  FROM racks ra
  INNER JOIN rooms ro ON ro.id = ra.room_id
  WHERE ro.proposal_id = p_proposal_id AND ra.part_number IS NOT NULL;

  -- Rack components (accessories: cable management, patch cords, blank panels, etc.)
  INSERT INTO bom_line_items (proposal_id, org_id, source, approved_by, item_name, manufacturer, part_number_sku, quantity, category, pricing_status)
  SELECT p_proposal_id, v_org_id, 'drawing', p_approved_by,
    COALESCE(rc.name, rc.component_type, 'Rack Accessory'),
    rc.manufacturer, rc.part_number,
    SUM(COALESCE(rc.quantity, 1)),
    COALESCE(rc.component_type, 'Rack Accessory'), 'Needs Pricing'
  FROM rack_components rc
  INNER JOIN racks ra ON ra.id = rc.rack_id
  INNER JOIN rooms ro ON ro.id = ra.room_id
  WHERE ro.proposal_id = p_proposal_id
  GROUP BY COALESCE(rc.name, rc.component_type, 'Rack Accessory'),
    rc.manufacturer, rc.part_number,
    COALESCE(rc.component_type, 'Rack Accessory');

  -- Labor sync
  IF v_labor_enabled THEN
    UPDATE proposals
    SET labor_items = (
      SELECT COALESCE(jsonb_agg(item ORDER BY item->>'role'), '[]'::jsonb)
      FROM jsonb_array_elements(COALESCE(labor_items, '[]'::jsonb)) item
      WHERE item->>'source' IS DISTINCT FROM 'drawing'
    )
    WHERE id = p_proposal_id;

    UPDATE proposals
    SET labor_items = COALESCE(labor_items, '[]'::jsonb) || (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'role', agg.labor_role,
          'quantity', ROUND(agg.total_hours::numeric, 2)::text,
          'unit', COALESCE(lr.unit, 'hr'),
          'your_cost', COALESCE(lr.cost_per_hour, 0)::text,
          'markup', CASE
            WHEN COALESCE(lr.cost_per_hour, 0) > 0 AND COALESCE(lr.bill_rate_per_hour, 0) > 0
            THEN ROUND(((lr.bill_rate_per_hour - lr.cost_per_hour) / lr.cost_per_hour * 100)::numeric, 1)
            ELSE 35 END,
          'customer_price', ROUND(CASE
            WHEN COALESCE(lr.bill_rate_per_hour, 0) > 0 THEN lr.bill_rate_per_hour * agg.total_hours
            WHEN COALESCE(lr.cost_per_hour, 0) > 0 THEN lr.cost_per_hour * 1.35 * agg.total_hours
            ELSE 0 END::numeric, 2)::text,
          'source', 'drawing'
        ) ORDER BY agg.labor_role
      ), '[]'::jsonb)
      FROM (
        SELECT dld.labor_role,
          SUM(COALESCE(dp.quantity, 1) * COALESCE((dp.labor_overrides ->> dld.labor_role)::numeric, dld.hours_per_unit, 1.0)) AS total_hours
        FROM drawing_placements dp
        INNER JOIN drawing_sheets          ds  ON ds.id  = dp.drawing_sheet_id
        LEFT  JOIN global_products         gp  ON gp.id  = dp.global_product_id
        INNER JOIN designer_labor_defaults dld ON dld.org_id = v_org_id AND dld.category = gp.category AND dld.labor_role IS NOT NULL
        WHERE ds.proposal_id = p_proposal_id
        GROUP BY dld.labor_role
        HAVING SUM(COALESCE(dp.quantity, 1) * COALESCE((dp.labor_overrides ->> dld.labor_role)::numeric, dld.hours_per_unit, 1.0)) > 0
      ) agg
      LEFT JOIN labor_rates lr ON lr.org_id = v_org_id AND lr.role = agg.labor_role
    )
    WHERE id = p_proposal_id;
  END IF;

  UPDATE drawing_sheets
  SET status = 'approved', approved_by = p_approved_by, approved_at = now()
  WHERE proposal_id = p_proposal_id;
END;
$$;

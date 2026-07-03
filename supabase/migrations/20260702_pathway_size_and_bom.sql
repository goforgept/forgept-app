-- Add size field to drawing_pathways
ALTER TABLE drawing_pathways ADD COLUMN IF NOT EXISTS size text NOT NULL DEFAULT '';

-- Update sync_drawing_to_bom to include pathways
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
  v_org_id UUID;
BEGIN
  SELECT org_id INTO v_org_id FROM proposals WHERE id = p_proposal_id;

  -- Remove previously drawing-sourced items
  DELETE FROM bom_line_items
  WHERE proposal_id = p_proposal_id
    AND source = 'drawing';

  -- Device placements grouped by part number
  INSERT INTO bom_line_items (
    proposal_id, org_id, source, approved_by,
    item_name, manufacturer, part_number_sku,
    quantity, category, pricing_status,
    global_product_id, product_id
  )
  SELECT
    p_proposal_id,
    v_org_id,
    'drawing',
    p_approved_by,
    COALESCE(dp.description_override, gp.name, 'Unknown Device'),
    COALESCE(dp.manufacturer_override, gp.manufacturer),
    COALESCE(dp.part_number_override, gp.part_number),
    SUM(COALESCE(dp.quantity, 1)),
    gp.category,
    'Needs Pricing',
    dp.global_product_id,
    dp.product_id
  FROM drawing_placements dp
  LEFT JOIN global_products gp ON gp.id = dp.global_product_id
  INNER JOIN drawing_sheets ds ON ds.id = dp.drawing_sheet_id
  WHERE ds.proposal_id = p_proposal_id
  GROUP BY
    COALESCE(dp.description_override, gp.name, 'Unknown Device'),
    COALESCE(dp.manufacturer_override, gp.manufacturer),
    COALESCE(dp.part_number_override, gp.part_number),
    gp.category,
    dp.global_product_id,
    dp.product_id;

  -- Placement components
  INSERT INTO bom_line_items (
    proposal_id, org_id, source, approved_by,
    item_name, manufacturer, part_number_sku,
    quantity, category, pricing_status
  )
  SELECT
    p_proposal_id,
    v_org_id,
    'drawing',
    p_approved_by,
    pc.name,
    pc.manufacturer,
    pc.part_number,
    SUM(COALESCE(pc.quantity, 1)),
    pc.component_type,
    'Needs Pricing'
  FROM placement_components pc
  INNER JOIN drawing_placements dp ON dp.id = pc.placement_id
  INNER JOIN drawing_sheets ds     ON ds.id = dp.drawing_sheet_id
  WHERE ds.proposal_id = p_proposal_id
  GROUP BY pc.name, pc.manufacturer, pc.part_number, pc.component_type;

  -- Cable runs
  INSERT INTO bom_line_items (
    proposal_id, org_id, source, approved_by,
    item_name, part_number_sku, manufacturer,
    quantity, unit, category, pricing_status
  )
  SELECT
    p_proposal_id,
    v_org_id,
    'drawing',
    p_approved_by,
    cr.cable_type || ' Cable',
    cr.part_number,
    NULL,
    SUM(COALESCE(cr.total_footage, 0)),
    'ft',
    'Cable',
    'Needs Pricing'
  FROM cable_runs cr
  INNER JOIN drawing_sheets ds ON ds.id = cr.drawing_sheet_id
  WHERE ds.proposal_id = p_proposal_id
  GROUP BY cr.cable_type, cr.part_number;

  -- Vertical rises
  INSERT INTO bom_line_items (
    proposal_id, org_id, source, approved_by,
    item_name, part_number_sku, manufacturer,
    quantity, unit, category, pricing_status
  )
  SELECT
    p_proposal_id,
    v_org_id,
    'drawing',
    p_approved_by,
    vr.cable_type || ' Cable (Vertical Rise)',
    NULL,
    NULL,
    SUM(COALESCE(vr.total_footage, 0)),
    'ft',
    'Cable',
    'Needs Pricing'
  FROM vertical_rises vr
  WHERE vr.proposal_id = p_proposal_id
  GROUP BY vr.cable_type;

  -- Pathway conduit / tray / raceway (everything except J-hook)
  INSERT INTO bom_line_items (
    proposal_id, org_id, source, approved_by,
    item_name, part_number_sku, manufacturer,
    quantity, unit, category, pricing_status
  )
  SELECT
    p_proposal_id,
    v_org_id,
    'drawing',
    p_approved_by,
    CASE
      WHEN pw.size != '' THEN pw.size || ' ' || pw.pathway_type
      ELSE pw.pathway_type
    END,
    NULL,
    NULL,
    SUM(pw.total_footage),
    'ft',
    'Pathway',
    'Needs Pricing'
  FROM drawing_pathways pw
  INNER JOIN drawing_sheets ds ON ds.id = pw.drawing_sheet_id
  WHERE ds.proposal_id = p_proposal_id
    AND pw.total_footage > 0
    AND pw.pathway_type != 'J-hook'
  GROUP BY pw.pathway_type, pw.size;

  -- J-hooks (quantity = sum of hook counts per size)
  INSERT INTO bom_line_items (
    proposal_id, org_id, source, approved_by,
    item_name, part_number_sku, manufacturer,
    quantity, unit, category, pricing_status
  )
  SELECT
    p_proposal_id,
    v_org_id,
    'drawing',
    p_approved_by,
    CASE WHEN pw.size != '' THEN pw.size || ' J-Hook' ELSE 'J-Hook' END,
    NULL,
    NULL,
    SUM(CEIL(pw.total_footage::numeric / NULLIF(pw.hook_interval, 0))),
    'ea',
    'Pathway Hardware',
    'Needs Pricing'
  FROM drawing_pathways pw
  INNER JOIN drawing_sheets ds ON ds.id = pw.drawing_sheet_id
  WHERE ds.proposal_id = p_proposal_id
    AND pw.total_footage > 0
    AND pw.pathway_type = 'J-hook'
  GROUP BY pw.size;

  -- Cables inside pathways (unnest cable_types JSONB array)
  INSERT INTO bom_line_items (
    proposal_id, org_id, source, approved_by,
    item_name, part_number_sku, manufacturer,
    quantity, unit, category, pricing_status
  )
  SELECT
    p_proposal_id,
    v_org_id,
    'drawing',
    p_approved_by,
    (ct->>'type') || ' Cable (Pathway)',
    NULL,
    NULL,
    SUM(COALESCE((ct->>'qty')::int, 1) * pw.total_footage),
    'ft',
    'Cable',
    'Needs Pricing'
  FROM drawing_pathways pw
  INNER JOIN drawing_sheets ds ON ds.id = pw.drawing_sheet_id
  CROSS JOIN jsonb_array_elements(pw.cable_types) AS ct
  WHERE ds.proposal_id = p_proposal_id
    AND pw.total_footage > 0
    AND jsonb_array_length(pw.cable_types) > 0
  GROUP BY ct->>'type';

  -- Mark all sheets approved
  UPDATE drawing_sheets
  SET status = 'approved', approved_by = p_approved_by, approved_at = now()
  WHERE proposal_id = p_proposal_id;

END;
$$;

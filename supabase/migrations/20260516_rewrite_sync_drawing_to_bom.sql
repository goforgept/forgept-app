-- Rewrite sync_drawing_to_bom to match actual bom_line_items column names
-- (part_number_sku not part_number, item_name not name, etc.)
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
  -- Get org_id from the proposal
  SELECT org_id INTO v_org_id FROM proposals WHERE id = p_proposal_id;

  -- Remove previously drawing-sourced items for this proposal
  DELETE FROM bom_line_items
  WHERE proposal_id = p_proposal_id
    AND source = 'drawing';

  -- Insert device placements grouped by part number
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

  -- Insert placement components (hardware attached to devices)
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
  GROUP BY
    pc.name,
    pc.manufacturer,
    pc.part_number,
    pc.component_type;

  -- Insert cable runs as BOM line items
  INSERT INTO bom_line_items (
    proposal_id, org_id, source, approved_by,
    item_name, part_number_sku, manufacturer,
    quantity, category, pricing_status
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
    'Cable',
    'Needs Pricing'
  FROM cable_runs cr
  INNER JOIN drawing_sheets ds ON ds.id = cr.drawing_sheet_id
  WHERE ds.proposal_id = p_proposal_id
  GROUP BY cr.cable_type, cr.part_number;

  -- Insert vertical rises as BOM line items
  INSERT INTO bom_line_items (
    proposal_id, org_id, source, approved_by,
    item_name, part_number_sku, manufacturer,
    quantity, category, pricing_status
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
    'Cable',
    'Needs Pricing'
  FROM vertical_rises vr
  WHERE vr.proposal_id = p_proposal_id
  GROUP BY vr.cable_type;

  -- Mark all sheets for this proposal as approved
  UPDATE drawing_sheets
  SET status = 'approved', approved_by = p_approved_by, approved_at = now()
  WHERE proposal_id = p_proposal_id;

END;
$$;

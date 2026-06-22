-- Global labor toggle on org
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS designer_labor_enabled boolean DEFAULT false;

-- Labor defaults per category
CREATE TABLE IF NOT EXISTS designer_labor_defaults (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  category text NOT NULL,
  labor_role text,
  hours_per_unit numeric(8,2) DEFAULT 1.0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(org_id, category)
);
ALTER TABLE designer_labor_defaults ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members manage labor defaults" ON designer_labor_defaults
  FOR ALL USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- Hours override per placement
ALTER TABLE drawing_placements ADD COLUMN IF NOT EXISTS labor_hours_override numeric(8,2);

-- Updated sync function — now also pushes labor rows to proposals.labor_items
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
  v_org_id         UUID;
  v_labor_enabled  boolean := false;
BEGIN
  SELECT org_id INTO v_org_id FROM proposals WHERE id = p_proposal_id;
  SELECT COALESCE(designer_labor_enabled, false) INTO v_labor_enabled
    FROM organizations WHERE id = v_org_id;

  -- Remove previously drawing-sourced material items
  DELETE FROM bom_line_items
  WHERE proposal_id = p_proposal_id AND source = 'drawing';

  -- Devices
  INSERT INTO bom_line_items (
    proposal_id, org_id, source, approved_by,
    item_name, manufacturer, part_number_sku,
    quantity, category, pricing_status,
    global_product_id, product_id
  )
  SELECT
    p_proposal_id, v_org_id, 'drawing', p_approved_by,
    COALESCE(dp.description_override, gp.name, 'Unknown Device'),
    COALESCE(dp.manufacturer_override, gp.manufacturer),
    COALESCE(dp.part_number_override, gp.part_number),
    SUM(COALESCE(dp.quantity, 1)),
    gp.category, 'Needs Pricing',
    dp.global_product_id, dp.product_id
  FROM drawing_placements dp
  LEFT JOIN global_products gp ON gp.id = dp.global_product_id
  INNER JOIN drawing_sheets ds ON ds.id = dp.drawing_sheet_id
  WHERE ds.proposal_id = p_proposal_id
  GROUP BY
    COALESCE(dp.description_override, gp.name, 'Unknown Device'),
    COALESCE(dp.manufacturer_override, gp.manufacturer),
    COALESCE(dp.part_number_override, gp.part_number),
    gp.category, dp.global_product_id, dp.product_id;

  -- Components
  INSERT INTO bom_line_items (
    proposal_id, org_id, source, approved_by,
    item_name, manufacturer, part_number_sku,
    quantity, category, pricing_status
  )
  SELECT
    p_proposal_id, v_org_id, 'drawing', p_approved_by,
    pc.name, pc.manufacturer, pc.part_number,
    SUM(COALESCE(pc.quantity, 1)), pc.component_type, 'Needs Pricing'
  FROM placement_components pc
  INNER JOIN drawing_placements dp ON dp.id = pc.placement_id
  INNER JOIN drawing_sheets ds ON ds.id = dp.drawing_sheet_id
  WHERE ds.proposal_id = p_proposal_id
  GROUP BY pc.name, pc.manufacturer, pc.part_number, pc.component_type;

  -- Cable runs
  INSERT INTO bom_line_items (
    proposal_id, org_id, source, approved_by,
    item_name, part_number_sku, manufacturer,
    quantity, category, pricing_status
  )
  SELECT
    p_proposal_id, v_org_id, 'drawing', p_approved_by,
    cr.cable_type || ' Cable', cr.part_number, NULL,
    SUM(COALESCE(cr.total_footage, 0)), 'Cable', 'Needs Pricing'
  FROM cable_runs cr
  INNER JOIN drawing_sheets ds ON ds.id = cr.drawing_sheet_id
  WHERE ds.proposal_id = p_proposal_id
  GROUP BY cr.cable_type, cr.part_number;

  -- Vertical rises
  INSERT INTO bom_line_items (
    proposal_id, org_id, source, approved_by,
    item_name, part_number_sku, manufacturer,
    quantity, category, pricing_status
  )
  SELECT
    p_proposal_id, v_org_id, 'drawing', p_approved_by,
    vr.cable_type || ' Cable (Vertical Rise)', NULL, NULL,
    SUM(COALESCE(vr.total_footage, 0)), 'Cable', 'Needs Pricing'
  FROM vertical_rises vr
  WHERE vr.proposal_id = p_proposal_id
  GROUP BY vr.cable_type;

  -- ── Labor sync (only when enabled) ──────────────────────────────────────────
  IF v_labor_enabled THEN
    -- Strip previously drawing-sourced labor from the JSONB array
    UPDATE proposals
    SET labor_items = (
      SELECT COALESCE(jsonb_agg(item), '[]'::jsonb)
      FROM jsonb_array_elements(COALESCE(labor_items, '[]'::jsonb)) item
      WHERE item->>'source' IS DISTINCT FROM 'drawing'
    )
    WHERE id = p_proposal_id;

    -- Append new drawing-sourced labor rows
    UPDATE proposals
    SET labor_items = COALESCE(labor_items, '[]'::jsonb) || (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'role',           agg.labor_role,
          'quantity',       ROUND(agg.total_hours::numeric, 2)::text,
          'unit',           'hr',
          'your_cost',      COALESCE(lr.cost_per_hour, 0)::text,
          'markup',         CASE
                              WHEN COALESCE(lr.cost_per_hour, 0) > 0
                              THEN ROUND(((lr.bill_rate_per_hour - lr.cost_per_hour) / lr.cost_per_hour * 100)::numeric, 1)
                              ELSE 35
                            END,
          'customer_price', ROUND((COALESCE(lr.bill_rate_per_hour, 0) * agg.total_hours)::numeric, 2)::text,
          'source',         'drawing'
        )
      ), '[]'::jsonb)
      FROM (
        SELECT
          dld.labor_role,
          SUM(
            COALESCE(dp.quantity, 1) *
            COALESCE(dp.labor_hours_override, dld.hours_per_unit, 1.0)
          ) AS total_hours
        FROM drawing_placements dp
        INNER JOIN drawing_sheets ds  ON ds.id  = dp.drawing_sheet_id
        LEFT  JOIN global_products gp ON gp.id  = dp.global_product_id
        INNER JOIN designer_labor_defaults dld
               ON dld.org_id   = v_org_id
              AND dld.category = gp.category
              AND dld.labor_role IS NOT NULL
        WHERE ds.proposal_id = p_proposal_id
        GROUP BY dld.labor_role
        HAVING SUM(
          COALESCE(dp.quantity, 1) *
          COALESCE(dp.labor_hours_override, dld.hours_per_unit, 1.0)
        ) > 0
      ) agg
      INNER JOIN labor_rates lr
             ON lr.org_id = v_org_id
            AND lr.role   = agg.labor_role
    )
    WHERE id = p_proposal_id;
  END IF;

  -- Mark sheets approved
  UPDATE drawing_sheets
  SET status = 'approved', approved_by = p_approved_by, approved_at = now()
  WHERE proposal_id = p_proposal_id;

END;
$$;

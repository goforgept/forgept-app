-- When syncing drawing to BOM, look up pricing from product_library by part number.
-- Items whose part_number_sku matches a product_library entry with pricing will be
-- marked 'Priced' and have cost/price fields populated using the cheapest vendor price
-- and the org's default markup percentage.

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
  v_default_markup numeric  := 35;
BEGIN
  SELECT org_id INTO v_org_id FROM proposals WHERE id = p_proposal_id;
  SELECT COALESCE(designer_labor_enabled, false) INTO v_labor_enabled
    FROM organizations WHERE id = v_org_id;

  -- Remove previously drawing-sourced material items
  DELETE FROM bom_line_items
  WHERE proposal_id = p_proposal_id AND source = 'drawing';

  -- Device placements grouped by part number (New and Replace only)
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
  LEFT  JOIN global_products gp ON gp.id = dp.global_product_id
  INNER JOIN drawing_sheets  ds ON ds.id = dp.drawing_sheet_id
  WHERE ds.proposal_id = p_proposal_id
    AND (dp.site_condition IS NULL OR dp.site_condition IN ('new', 'replace'))
  GROUP BY
    COALESCE(dp.description_override, gp.name, 'Unknown Device'),
    COALESCE(dp.manufacturer_override, gp.manufacturer),
    COALESCE(dp.part_number_override, gp.part_number),
    gp.category, dp.global_product_id, dp.product_id;

  -- Placement components — only from New/Replace parent placements
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
  INNER JOIN drawing_sheets     ds ON ds.id = dp.drawing_sheet_id
  WHERE ds.proposal_id = p_proposal_id
    AND (dp.site_condition IS NULL OR dp.site_condition IN ('new', 'replace'))
  GROUP BY pc.name, pc.manufacturer, pc.part_number, pc.component_type;

  -- Cable runs
  INSERT INTO bom_line_items (
    proposal_id, org_id, source, approved_by,
    item_name, part_number_sku, manufacturer,
    quantity, unit, category, pricing_status
  )
  SELECT
    p_proposal_id, v_org_id, 'drawing', p_approved_by,
    cr.cable_type || ' Cable', cr.part_number, NULL,
    SUM(COALESCE(cr.total_footage, 0)), 'ft', 'Cable', 'Needs Pricing'
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
    p_proposal_id, v_org_id, 'drawing', p_approved_by,
    vr.cable_type || ' Cable (Vertical Rise)', NULL, NULL,
    SUM(COALESCE(vr.total_footage, 0)), 'ft', 'Cable', 'Needs Pricing'
  FROM vertical_rises vr
  WHERE vr.proposal_id = p_proposal_id
  GROUP BY vr.cable_type;

  -- Pathway conduit / tray / raceway (excludes J-hook)
  INSERT INTO bom_line_items (
    proposal_id, org_id, source, approved_by,
    item_name, part_number_sku, manufacturer,
    quantity, unit, category, pricing_status
  )
  SELECT
    p_proposal_id, v_org_id, 'drawing', p_approved_by,
    CASE WHEN pw.size != '' THEN pw.size || ' ' || pw.pathway_type ELSE pw.pathway_type END,
    NULL, NULL,
    SUM(pw.total_footage), 'ft', 'Pathway', 'Needs Pricing'
  FROM drawing_pathways pw
  INNER JOIN drawing_sheets ds ON ds.id = pw.drawing_sheet_id
  WHERE ds.proposal_id = p_proposal_id
    AND pw.total_footage > 0
    AND pw.pathway_type != 'J-hook'
  GROUP BY pw.pathway_type, pw.size;

  -- J-hooks (count = ceiling of total footage ÷ hook interval)
  INSERT INTO bom_line_items (
    proposal_id, org_id, source, approved_by,
    item_name, part_number_sku, manufacturer,
    quantity, unit, category, pricing_status
  )
  SELECT
    p_proposal_id, v_org_id, 'drawing', p_approved_by,
    CASE WHEN pw.size != '' THEN pw.size || ' J-Hook' ELSE 'J-Hook' END,
    NULL, NULL,
    SUM(CEIL(pw.total_footage::numeric / NULLIF(pw.hook_interval, 0))),
    'ea', 'Pathway Hardware', 'Needs Pricing'
  FROM drawing_pathways pw
  INNER JOIN drawing_sheets ds ON ds.id = pw.drawing_sheet_id
  WHERE ds.proposal_id = p_proposal_id
    AND pw.total_footage > 0
    AND pw.pathway_type = 'J-hook'
  GROUP BY pw.size;

  -- Cables bundled inside pathways
  INSERT INTO bom_line_items (
    proposal_id, org_id, source, approved_by,
    item_name, part_number_sku, manufacturer,
    quantity, unit, category, pricing_status
  )
  SELECT
    p_proposal_id, v_org_id, 'drawing', p_approved_by,
    (ct->>'type') || ' Cable (Pathway)', NULL, NULL,
    SUM(COALESCE((ct->>'qty')::int, 1) * pw.total_footage),
    'ft', 'Cable', 'Needs Pricing'
  FROM drawing_pathways pw
  INNER JOIN drawing_sheets ds ON ds.id = pw.drawing_sheet_id
  CROSS JOIN jsonb_array_elements(pw.cable_types) AS ct
  WHERE ds.proposal_id = p_proposal_id
    AND pw.total_footage > 0
    AND jsonb_array_length(pw.cable_types) > 0
  GROUP BY ct->>'type';

  -- ── Pricing lookup from product library ───────────────────────────────────
  -- Use cheapest vendor price for any item whose part_number_sku matches.
  SELECT COALESCE(MAX(p.default_markup_percent), 35) INTO v_default_markup
  FROM profiles p WHERE p.org_id = v_org_id;

  UPDATE bom_line_items bli
  SET
    your_cost_unit       = best.your_cost,
    markup_percent       = v_default_markup,
    customer_price_unit  = ROUND((best.your_cost * (1 + v_default_markup / 100))::numeric, 2),
    customer_price_total = ROUND((best.your_cost * (1 + v_default_markup / 100) * bli.quantity)::numeric, 2),
    pricing_status       = 'Priced'
  FROM (
    SELECT DISTINCT ON (bli2.id) bli2.id AS bli_id, plp.your_cost
    FROM bom_line_items bli2
    INNER JOIN product_library pl
           ON pl.org_id      = v_org_id
          AND pl.part_number = bli2.part_number_sku
    INNER JOIN product_library_pricing plp
           ON plp.product_id = pl.id
          AND plp.org_id     = v_org_id
          AND plp.your_cost  IS NOT NULL
          AND plp.your_cost  > 0
    WHERE bli2.proposal_id   = p_proposal_id
      AND bli2.source        = 'drawing'
      AND bli2.part_number_sku IS NOT NULL
      AND bli2.part_number_sku <> ''
    ORDER BY bli2.id, plp.your_cost ASC
  ) best
  WHERE bli.id = best.bli_id;

  -- ── MSRP + compliance fields from product library ────────────────────────
  -- Populate msrp_unit, COO, Berry, and lead time for any item whose part
  -- number matches, regardless of whether cost pricing was found.
  UPDATE bom_line_items bli
  SET
    msrp_unit         = pl.msrp,
    lead_time         = pl.lead_time,
    country_of_origin = pl.country_of_origin,
    berry_compliance  = pl.berry_compliance
  FROM product_library pl
  WHERE pl.org_id          = v_org_id
    AND pl.part_number     = bli.part_number_sku
    AND bli.proposal_id    = p_proposal_id
    AND bli.source         = 'drawing'
    AND bli.part_number_sku IS NOT NULL
    AND bli.part_number_sku <> ''
    AND (pl.msrp IS NOT NULL OR pl.lead_time IS NOT NULL OR pl.country_of_origin IS NOT NULL OR pl.berry_compliance IS NOT NULL);

  -- ── Labor sync (only when designer_labor_enabled) ─────────────────────────
  IF v_labor_enabled THEN
    -- Remove previously drawing-sourced labor rows from the JSONB array
    UPDATE proposals
    SET labor_items = (
      SELECT COALESCE(jsonb_agg(item ORDER BY item->>'role'), '[]'::jsonb)
      FROM jsonb_array_elements(COALESCE(labor_items, '[]'::jsonb)) item
      WHERE item->>'source' IS DISTINCT FROM 'drawing'
    )
    WHERE id = p_proposal_id;

    -- Append new drawing-sourced labor rows (New and Replace only)
    UPDATE proposals
    SET labor_items = COALESCE(labor_items, '[]'::jsonb) || (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'role',           agg.labor_role,
          'quantity',       ROUND(agg.total_hours::numeric, 2)::text,
          'unit',           COALESCE(lr.unit, 'hr'),
          'your_cost',      COALESCE(lr.cost_per_hour, 0)::text,
          'markup',         CASE
                              WHEN COALESCE(lr.cost_per_hour, 0) > 0
                               AND COALESCE(lr.bill_rate_per_hour, 0) > 0
                              THEN ROUND(
                                     ((lr.bill_rate_per_hour - lr.cost_per_hour)
                                       / lr.cost_per_hour * 100)::numeric, 1)
                              ELSE 35
                            END,
          'customer_price', ROUND(
                              CASE
                                WHEN COALESCE(lr.bill_rate_per_hour, 0) > 0
                                THEN lr.bill_rate_per_hour * agg.total_hours
                                WHEN COALESCE(lr.cost_per_hour, 0) > 0
                                THEN lr.cost_per_hour * 1.35 * agg.total_hours
                                ELSE 0
                              END::numeric, 2)::text,
          'source',         'drawing'
        )
        ORDER BY agg.labor_role
      ), '[]'::jsonb)
      FROM (
        SELECT
          dld.labor_role,
          SUM(
            COALESCE(dp.quantity, 1) *
            COALESCE(
              (dp.labor_overrides ->> dld.labor_role)::numeric,
              dld.hours_per_unit,
              1.0
            )
          ) AS total_hours
        FROM drawing_placements dp
        INNER JOIN drawing_sheets          ds  ON ds.id  = dp.drawing_sheet_id
        LEFT  JOIN global_products         gp  ON gp.id  = dp.global_product_id
        INNER JOIN designer_labor_defaults dld
               ON  dld.org_id    = v_org_id
               AND dld.category  = gp.category
               AND dld.labor_role IS NOT NULL
        WHERE ds.proposal_id = p_proposal_id
          AND (dp.site_condition IS NULL OR dp.site_condition IN ('new', 'replace'))
        GROUP BY dld.labor_role
        HAVING SUM(
          COALESCE(dp.quantity, 1) *
          COALESCE(
            (dp.labor_overrides ->> dld.labor_role)::numeric,
            dld.hours_per_unit,
            1.0
          )
        ) > 0
      ) agg
      LEFT JOIN labor_rates lr
             ON  lr.org_id = v_org_id
             AND lr.role   = agg.labor_role
    )
    WHERE id = p_proposal_id;
  END IF;

  -- Mark all sheets approved
  UPDATE drawing_sheets
  SET status = 'approved', approved_by = p_approved_by, approved_at = now()
  WHERE proposal_id = p_proposal_id;

END;
$$;

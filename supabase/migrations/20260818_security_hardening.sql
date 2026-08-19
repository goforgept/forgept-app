-- ── Security hardening ───────────────────────────────────────────────────────
-- 1. Add SET search_path = '' to functions that were missing it
--    (prevents search-path-injection attacks if a malicious schema is created)
-- 2. Revoke anon EXECUTE from functions that have no business being public

-- ── 1. Fix search_path on set_updated_at ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ── 2. Fix search_path on get_next_po_number ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_next_po_number(org_id_input uuid)
RETURNS text LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_counter int;
  new_number text;
BEGIN
  SELECT po_counter INTO current_counter
  FROM public.organizations
  WHERE id = org_id_input;

  new_number := 'PO-' || current_counter;

  UPDATE public.organizations
  SET po_counter = current_counter + 1
  WHERE id = org_id_input;

  RETURN new_number;
END;
$$;

-- ── 3. Fix search_path on sync_drawing_to_bom ────────────────────────────────

CREATE OR REPLACE FUNCTION public.sync_drawing_to_bom(p_proposal_id uuid)
RETURNS void LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Remove old auto-synced rows
  DELETE FROM public.bom_line_items
  WHERE proposal_id = p_proposal_id AND source = 'drawing';

  -- Floor plan placements
  INSERT INTO public.bom_line_items (
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
  FROM public.drawing_placements dp
  LEFT JOIN public.global_products gp ON gp.id = dp.global_product_id
  WHERE dp.proposal_id = p_proposal_id
  GROUP BY
    COALESCE(dp.description_override, gp.name, 'Unknown Device'),
    COALESCE(dp.manufacturer_override, gp.manufacturer),
    COALESCE(dp.part_number_override, gp.part_number),
    COALESCE(dp.category_override, gp.category);

  -- Rack items
  INSERT INTO public.bom_line_items (
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
  FROM public.rack_items ri
  LEFT JOIN public.global_products gp ON gp.id = ri.global_product_id
  INNER JOIN public.racks ra ON ra.id = ri.rack_id
  INNER JOIN public.rooms ro ON ro.id = ra.room_id
  WHERE ro.proposal_id = p_proposal_id
  GROUP BY
    COALESCE(ri.label, gp.name, 'Rack Device'),
    COALESCE(ri.manufacturer, gp.manufacturer),
    COALESCE(ri.part_number, ri.model, gp.part_number),
    COALESCE(ri.category, gp.category);

  -- Rack enclosures
  INSERT INTO public.bom_line_items (
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
  FROM public.racks ra
  INNER JOIN public.rooms ro ON ro.id = ra.room_id
  WHERE ro.proposal_id = p_proposal_id
    AND ra.part_number IS NOT NULL
  GROUP BY ra.name, ra.manufacturer, ra.part_number;

  -- Rack accessories
  INSERT INTO public.bom_line_items (
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
  FROM public.rack_components rc
  INNER JOIN public.racks ra ON ra.id = rc.rack_id
  INNER JOIN public.rooms ro ON ro.id = ra.room_id
  WHERE ro.proposal_id = p_proposal_id
  GROUP BY rc.name, rc.manufacturer, rc.part_number, rc.component_type;

  -- Rack item components (SFP modules, etc.)
  INSERT INTO public.bom_line_items (
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
  FROM public.rack_item_components ric
  INNER JOIN public.rack_items ri ON ri.id = ric.rack_item_id
  INNER JOIN public.racks ra ON ra.id = ri.rack_id
  INNER JOIN public.rooms ro ON ro.id = ra.room_id
  WHERE ro.proposal_id = p_proposal_id
  GROUP BY ric.name, ric.manufacturer, ric.part_number, ric.component_type;

END;
$$;

-- ── 4. Revoke anon EXECUTE from functions that shouldn't be public ────────────
-- sync_drawing_to_bom: can delete/rebuild BOM rows — no anon use case
-- get_my_org_id: only meaningful for authenticated users

REVOKE EXECUTE ON FUNCTION public.sync_drawing_to_bom(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_my_org_id() FROM anon;

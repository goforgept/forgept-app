CREATE TABLE IF NOT EXISTS public.purchase_order_line_items (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  po_id        uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  item_name    text NOT NULL,
  part_number  text,
  quantity     numeric(10,4) DEFAULT 0,
  unit         text DEFAULT 'ea',
  unit_cost    numeric(10,4) DEFAULT 0,
  total        numeric(10,4) DEFAULT 0,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE public.purchase_order_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members" ON public.purchase_order_line_items
  FOR ALL USING (
    po_id IN (
      SELECT id FROM public.purchase_orders
      WHERE org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
    )
  );

CREATE INDEX IF NOT EXISTS purchase_order_line_items_po_id_idx ON public.purchase_order_line_items(po_id);

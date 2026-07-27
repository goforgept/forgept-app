-- Warehouses
CREATE TABLE IF NOT EXISTS public.warehouses (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text,
  notes text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members" ON public.warehouses FOR ALL USING (
  org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);

-- Inventory items
CREATE TABLE IF NOT EXISTS public.inventory_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  part_number text,
  description text NOT NULL,
  qty_on_hand numeric(10,2) DEFAULT 0,
  qty_reserved numeric(10,2) DEFAULT 0,
  unit_cost numeric(10,2) DEFAULT 0,
  min_stock_level numeric(10,2) DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members" ON public.inventory_items FOR ALL USING (
  org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);

-- Inventory transactions (audit trail)
CREATE TABLE IF NOT EXISTS public.inventory_transactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  inventory_item_id uuid REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  type text NOT NULL, -- 'receipt' | 'reservation' | 'fulfillment' | 'release' | 'adjustment'
  quantity numeric(10,2) NOT NULL,
  unit_cost numeric(10,2),
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  po_id uuid,
  notes text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members" ON public.inventory_transactions FOR ALL USING (
  org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);

-- Job inventory allocations
CREATE TABLE IF NOT EXISTS public.job_inventory_allocations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  inventory_item_id uuid REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  bom_line_item_id uuid REFERENCES public.bom_line_items(id) ON DELETE SET NULL,
  bom_item_description text,
  bom_part_number text,
  quantity_reserved numeric(10,2) DEFAULT 0,
  quantity_fulfilled numeric(10,2) DEFAULT 0,
  unit_cost numeric(10,2) DEFAULT 0,
  status text DEFAULT 'reserved', -- 'reserved' | 'fulfilled' | 'released'
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.job_inventory_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members" ON public.job_inventory_allocations FOR ALL USING (
  org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);

-- Feature flag
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS feature_inventory boolean DEFAULT false;

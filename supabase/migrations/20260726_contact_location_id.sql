ALTER TABLE public.client_contacts
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.client_locations(id) ON DELETE SET NULL;

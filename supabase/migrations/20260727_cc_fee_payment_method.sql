-- Credit card payment method on clients
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'Default';

-- Credit card fee percent on organizations (org-wide setting)
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS cc_fee_percent numeric(5,2) DEFAULT 3.0;

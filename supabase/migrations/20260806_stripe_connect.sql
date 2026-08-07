-- Stripe Connect: orgs connect their own Stripe account to bill their clients
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS stripe_connect_connected boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id text;

-- Store Stripe customer ID on clients so we don't create duplicates
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS stripe_customer_id text;

-- Store Stripe invoice data on invoices
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS stripe_invoice_id text,
  ADD COLUMN IF NOT EXISTS stripe_hosted_invoice_url text;

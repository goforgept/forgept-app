-- Auto invoice fields on contracts
ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS auto_invoice boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS next_invoice_date date,
  ADD COLUMN IF NOT EXISTS invoice_days_until_due integer DEFAULT 30;

-- Link invoices back to the contract that generated them
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS contract_id uuid REFERENCES contracts(id) ON DELETE SET NULL;

-- QuickBooks sync fields on invoices
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS qbo_invoice_id text,
  ADD COLUMN IF NOT EXISTS qbo_invoice_number text;

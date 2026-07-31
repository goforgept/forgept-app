-- Auto invoice fields on recurring BOM line items
ALTER TABLE bom_line_items
  ADD COLUMN IF NOT EXISTS billing_frequency text DEFAULT 'Annual',
  ADD COLUMN IF NOT EXISTS auto_invoice boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS next_invoice_date date;

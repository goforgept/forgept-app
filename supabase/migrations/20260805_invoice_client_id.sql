-- Allow invoices to reference a client directly (for standalone contracts with no proposal)
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES clients(id) ON DELETE SET NULL;

ALTER TABLE clients ADD COLUMN IF NOT EXISTS qbo_customer_id text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS qbo_last_sync_at timestamptz;

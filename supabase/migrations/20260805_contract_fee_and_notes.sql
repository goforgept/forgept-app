ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS recurring_fee numeric,
  ADD COLUMN IF NOT EXISTS billing_frequency text DEFAULT 'Monthly',
  ADD COLUMN IF NOT EXISTS notes text;

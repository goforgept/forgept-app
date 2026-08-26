-- The mobile_readiness migration wired a set_updated_at trigger on clients
-- but forgot to add the updated_at column. Any UPDATE on clients fails with
-- "record NEW has no field updated_at" until this column exists.
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

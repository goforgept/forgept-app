ALTER TABLE proposals ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE clients   ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE jobs      ADD COLUMN IF NOT EXISTS archived_at timestamptz;

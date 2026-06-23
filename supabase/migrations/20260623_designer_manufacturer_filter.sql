ALTER TABLE organizations ADD COLUMN IF NOT EXISTS designer_allowed_manufacturers text[] DEFAULT NULL;

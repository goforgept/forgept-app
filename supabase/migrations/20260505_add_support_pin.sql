-- Add support_pin column to profiles for superadmin support access
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS support_pin TEXT;

-- Optional: add a unique index so two users can't accidentally share a PIN
CREATE UNIQUE INDEX IF NOT EXISTS profiles_support_pin_unique ON profiles (support_pin) WHERE support_pin IS NOT NULL;

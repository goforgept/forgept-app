ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS drawing_favorites text[] DEFAULT ARRAY[]::text[];

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS dashboard_widgets jsonb DEFAULT NULL;

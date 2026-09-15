ALTER TABLE profiles ADD COLUMN IF NOT EXISTS dashboard_widgets_admin jsonb DEFAULT NULL;

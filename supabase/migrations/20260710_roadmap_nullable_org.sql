-- Allow roadmap items to exist without an org (e.g. internal ForgePt items added via SuperAdmin)
ALTER TABLE roadmap_items ALTER COLUMN org_id DROP NOT NULL;

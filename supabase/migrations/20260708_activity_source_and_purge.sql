-- Add source column to distinguish user-logged vs system-generated activities.
-- System activities are auto-purged after 90 days via pg_cron.

ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'user'
    CHECK (source IN ('user', 'system'));

-- Backfill: mark existing auto-generated activities as system.
-- These are the known patterns inserted by app code rather than humans.
UPDATE activities SET source = 'system'
WHERE title ILIKE 'Status changed to%'
   OR title ILIKE 'Close date updated to%'
   OR title ILIKE 'Rep changed to%'
   OR title ILIKE 'Quote number updated to%'
   OR title ILIKE 'Scope of Work edited manually'
   OR title ILIKE 'Scope of Work generated'
   OR title ILIKE 'Signature request sent to%'
   OR title ILIKE 'Signed agreement uploaded manually'
   OR title ILIKE 'Service agreement%'
   OR title ILIKE 'Monitoring contract%'
   OR title ILIKE 'Contract start dates set'
   OR title ILIKE 'Purchase Order % generated%'
   OR title ILIKE 'Fulfillment order % created%'
   OR title ILIKE 'BOM updated%'
   OR title ILIKE 'Client info updated'
   OR title ILIKE 'Deal shared with%'
   OR title ILIKE 'Proposal signed by%'
   OR title ILIKE 'Invoice created in QuickBooks%'
   OR title ILIKE 'Customer notified about job update';

-- Requires pg_cron extension enabled in Supabase Dashboard → Extensions.
-- Daily at 3am UTC: purge system activities older than 90 days.
SELECT cron.schedule(
  'purge-system-activities',
  '0 3 * * *',
  $$
    DELETE FROM activities
    WHERE source = 'system'
      AND created_at < NOW() - INTERVAL '90 days';
  $$
);

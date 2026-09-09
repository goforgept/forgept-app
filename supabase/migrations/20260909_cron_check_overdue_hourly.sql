-- Replace the old daily cron with an hourly one so timed task reminders fire at the right hour.
-- Run this in the Supabase SQL editor. Replace PASTE_CRON_SECRET_HERE with your CRON_SECRET value.

-- Remove old daily schedule if it exists (ignore error if it never existed)
DO $$ BEGIN
  PERFORM cron.unschedule('daily-check-overdue');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Schedule hourly
SELECT cron.schedule(
  'hourly-check-overdue',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/check-overdue',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer PASTE_CRON_SECRET_HERE"}'::jsonb,
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);

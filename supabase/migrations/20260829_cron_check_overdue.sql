-- Schedule check-overdue edge function every day at 9am UTC (4am or 5am ET)
-- Replace PASTE_CRON_SECRET_HERE with your actual CRON_SECRET value before running

SELECT cron.schedule(
  'daily-check-overdue',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/check-overdue',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer PASTE_CRON_SECRET_HERE"}'::jsonb,
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);

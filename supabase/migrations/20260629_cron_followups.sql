-- Schedule send-followups edge function every day at 8am UTC
-- Replace PASTE_CRON_SECRET_HERE with your actual CRON_SECRET value before running

SELECT cron.schedule(
  'daily-followups',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/send-followups',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer PASTE_CRON_SECRET_HERE"}'::jsonb,
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);

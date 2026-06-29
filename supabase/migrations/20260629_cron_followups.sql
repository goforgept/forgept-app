-- Schedule send-followups edge function every day at 8am UTC
-- Requires pg_cron + pg_net extensions (both enabled by default in Supabase)
--
-- Before running: set the two custom DB settings in Supabase Dashboard →
--   Database → Configuration → set app.supabase_url and app.cron_secret
-- OR run:
--   ALTER DATABASE postgres SET "app.supabase_url" = 'https://YOUR_PROJECT.supabase.co';
--   ALTER DATABASE postgres SET "app.cron_secret"  = 'YOUR_CRON_SECRET_VALUE';

SELECT cron.schedule(
  'daily-followups',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/send-followups',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.cron_secret')
    ),
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);

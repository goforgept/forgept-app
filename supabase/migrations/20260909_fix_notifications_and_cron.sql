-- 1. Create/fix notifications table (corrected FK: organizations, not orgs)
CREATE TABLE IF NOT EXISTS notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type        text NOT NULL,
  title       text NOT NULL,
  body        text,
  link        text,
  read        boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  dedup_key   text
);

CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedup
  ON notifications (user_id, dedup_key)
  WHERE dedup_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS notifications_user_unread
  ON notifications (user_id, read, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "users read own notifications" ON notifications FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "users update own notifications" ON notifications FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "service role insert notifications" ON notifications FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Remove old cron jobs (ignore errors if they don't exist)
DO $$ BEGIN
  PERFORM cron.unschedule('daily-check-overdue');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.unschedule('hourly-check-overdue');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 3. Schedule hourly cron
-- !! REPLACE YOUR_CRON_SECRET_HERE with your actual CRON_SECRET value from
--    Supabase → Project Settings → Edge Functions → Secrets
SELECT cron.schedule(
  'hourly-check-overdue',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/check-overdue',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_CRON_SECRET_HERE"}'::jsonb,
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);

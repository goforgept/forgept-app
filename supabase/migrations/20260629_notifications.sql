-- Notifications table for the bell icon
CREATE TABLE IF NOT EXISTS notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid REFERENCES orgs(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type        text NOT NULL,         -- 'task_due' | 'email_opened' | 'proposal_sent' etc.
  title       text NOT NULL,
  body        text,
  link        text,
  read        boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- Dedup key: one notification per user per type per source per calendar day
  dedup_key   text
);

CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedup
  ON notifications (user_id, dedup_key)
  WHERE dedup_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS notifications_user_unread
  ON notifications (user_id, read, created_at DESC);

-- RLS: users can only see and update their own notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "users update own notifications"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id);

-- Service role (edge functions) can insert
CREATE POLICY "service role insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (true);

-- Auto-delete notifications older than 60 days (keeps table small)
CREATE INDEX IF NOT EXISTS notifications_cleanup
  ON notifications (created_at)
  WHERE created_at < now() - interval '60 days';

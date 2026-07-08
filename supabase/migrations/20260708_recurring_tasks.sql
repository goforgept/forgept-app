-- Add recurring task support to the tasks table.
-- recurrence: the cadence (null = one-time).
-- parent_task_id: links every auto-generated occurrence back to the original task
--   so the recurrence chain can be identified / cancelled as a group.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS recurrence text
    CHECK (recurrence IN ('weekly','biweekly','monthly','quarterly','annual')),
  ADD COLUMN IF NOT EXISTS parent_task_id uuid REFERENCES tasks(id) ON DELETE SET NULL;

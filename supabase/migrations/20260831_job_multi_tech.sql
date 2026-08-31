-- Support multiple techs on a job
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS tech_ids uuid[] DEFAULT '{}';

-- Backfill existing single tech_id into the array
UPDATE jobs SET tech_ids = ARRAY[tech_id] WHERE tech_id IS NOT NULL AND (tech_ids IS NULL OR tech_ids = '{}');

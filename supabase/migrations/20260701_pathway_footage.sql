ALTER TABLE drawing_pathways ADD COLUMN IF NOT EXISTS total_footage int NOT NULL DEFAULT 0;
ALTER TABLE drawing_pathways ADD COLUMN IF NOT EXISTS hook_interval int NOT NULL DEFAULT 4;

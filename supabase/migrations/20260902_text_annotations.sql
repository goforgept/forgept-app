-- Text annotation support on drawing sheets
-- 'label' already exists and will hold the text content
-- Add font_size for text annotations
ALTER TABLE drawing_annotations ADD COLUMN IF NOT EXISTS font_size integer DEFAULT 14;

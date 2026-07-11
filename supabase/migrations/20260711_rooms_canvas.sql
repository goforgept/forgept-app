-- Add canvas position and sheet association to rooms so they can be placed on floor plans
ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS drawing_sheet_id uuid REFERENCES drawing_sheets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS x numeric,
  ADD COLUMN IF NOT EXISTS y numeric;

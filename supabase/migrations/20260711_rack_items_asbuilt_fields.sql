ALTER TABLE rack_items
  ADD COLUMN IF NOT EXISTS description       text,
  ADD COLUMN IF NOT EXISTS notes             text,
  ADD COLUMN IF NOT EXISTS watts_draw        numeric,
  ADD COLUMN IF NOT EXISTS serial_number     text,
  ADD COLUMN IF NOT EXISTS ip_address        text,
  ADD COLUMN IF NOT EXISTS mac_address       text,
  ADD COLUMN IF NOT EXISTS switch_name       text,
  ADD COLUMN IF NOT EXISTS switch_port       text,
  ADD COLUMN IF NOT EXISTS patch_panel_label text;

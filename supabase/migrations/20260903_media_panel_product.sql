-- Generic Media Panel placeholder products for MDU structured cabling.
-- ON CONFLICT DO NOTHING makes re-running safe.

INSERT INTO global_products (industry, manufacturer, category, name, part_number, is_active, is_basic, specs)
VALUES
  ('low_voltage', 'Generic', 'Media Panel', 'Generic Structured Media Center (SMC)',              'GEN-MP-001', true, true, null),
  ('low_voltage', 'Generic', 'Media Panel', 'Generic SMC with Data/Voice Module',                 'GEN-MP-002', true, true, null),
  ('low_voltage', 'Generic', 'Media Panel', 'Generic SMC with Coax Splitter Module',              'GEN-MP-003', true, true, null),
  ('low_voltage', 'Generic', 'Media Panel', 'Generic SMC with Data, Coax & Phone Modules',       'GEN-MP-004', true, true, null)
ON CONFLICT (part_number) DO NOTHING;

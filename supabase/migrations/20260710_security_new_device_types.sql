-- Generic placeholder products for new security device categories.
-- Uses ON CONFLICT DO NOTHING so re-running is safe.

INSERT INTO global_products (industry, manufacturer, category, name, part_number, is_active, is_basic, specs)
VALUES
  -- Turret Cameras
  ('security', 'Generic', 'Turret Camera', 'Generic 2MP Turret Camera',          'GEN-TURR-2MP',  true, true, '{"fov_angle": 98,  "ir_range": 98,  "resolution": "2MP"}'),
  ('security', 'Generic', 'Turret Camera', 'Generic 4MP Turret Camera',          'GEN-TURR-4MP',  true, true, '{"fov_angle": 98,  "ir_range": 98,  "resolution": "4MP"}'),
  ('security', 'Generic', 'Turret Camera', 'Generic 4MP Turret Camera (WDR)',    'GEN-TURR-4WDR', true, true, '{"fov_angle": 107, "ir_range": 130, "resolution": "4MP"}'),
  ('security', 'Generic', 'Turret Camera', 'Generic 8MP Turret Camera',          'GEN-TURR-8MP',  true, true, '{"fov_angle": 98,  "ir_range": 130, "resolution": "8MP"}'),

  -- Cabinet Systems
  ('security', 'Generic', 'Cabinet System', 'Generic 4-Camera Cabinet System',   'GEN-CAB-4CH',  true, true, null),
  ('security', 'Generic', 'Cabinet System', 'Generic 8-Camera Cabinet System',   'GEN-CAB-8CH',  true, true, null),
  ('security', 'Generic', 'Cabinet System', 'Generic 16-Camera Cabinet System',  'GEN-CAB-16CH', true, true, null),

  -- Cabinet Solar Systems
  ('security', 'Generic', 'Cabinet Solar System', 'Generic 100W Solar Cabinet System (2-Camera)',  'GEN-SOL-100W', true, true, '{"power_watts": 100}'),
  ('security', 'Generic', 'Cabinet Solar System', 'Generic 200W Solar Cabinet System (4-Camera)',  'GEN-SOL-200W', true, true, '{"power_watts": 200}'),
  ('security', 'Generic', 'Cabinet Solar System', 'Generic 400W Solar Cabinet System (8-Camera)',  'GEN-SOL-400W', true, true, '{"power_watts": 400}'),

  -- Video Encoders
  ('security', 'Generic', 'Video Encoder', 'Generic 4-Channel Video Encoder',    'GEN-ENC-4CH',  true, true, null),
  ('security', 'Generic', 'Video Encoder', 'Generic 8-Channel Video Encoder',    'GEN-ENC-8CH',  true, true, null),
  ('security', 'Generic', 'Video Encoder', 'Generic 16-Channel Video Encoder',   'GEN-ENC-16CH', true, true, null)

ON CONFLICT (part_number) DO NOTHING;

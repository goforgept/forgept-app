-- Generic intrusion detection placeholder products.
-- Uses ON CONFLICT DO NOTHING so re-running is safe.

INSERT INTO global_products (industry, manufacturer, category, name, part_number, is_active, is_basic, specs)
VALUES
  ('security', 'Generic', 'Alarm Keypad',      'Generic Alarm Keypad',           'GEN-KP-001',   true, true, null),
  ('security', 'Generic', 'Alarm Panel',        'Generic Intrusion Control Panel','GEN-ICP-001',  true, true, null),
  ('security', 'Generic', 'Door Contact',       'Generic Door/Window Contact',    'GEN-DC-001',   true, true, null),
  ('security', 'Generic', 'PIR Detector',       'Generic PIR Motion Detector',    'GEN-PIR-001',  true, true, null),
  ('security', 'Generic', 'Dual Tech Detector', 'Generic Dual-Tech Detector',     'GEN-DT-001',   true, true, null),
  ('security', 'Generic', 'Glass Break',        'Generic Glass Break Detector',   'GEN-GB-001',   true, true, null),
  ('security', 'Generic', 'Interior Siren',     'Generic Interior Siren',         'GEN-ISVR-001', true, true, null),
  ('security', 'Generic', 'Exterior Siren',     'Generic Exterior Siren/Strobe',  'GEN-ESVR-001', true, true, null),
  ('security', 'Generic', 'Panic Button',       'Generic Panic/Hold-Up Button',   'GEN-PB-001',   true, true, null),
  ('security', 'Generic', 'Shock Sensor',       'Generic Shock/Vibration Sensor', 'GEN-SHK-001',  true, true, null)
ON CONFLICT (part_number) DO NOTHING;

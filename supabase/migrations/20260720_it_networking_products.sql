-- Generic IT / Networking products for the designer device list
INSERT INTO global_products (industry, manufacturer, category, name, part_number, is_active, is_basic, specs)
VALUES
  ('it', 'Generic', 'Router',                'Generic Router',               'GEN-RTR-001',   true, true, null),
  ('it', 'Generic', 'Firewall',              'Generic Firewall',             'GEN-FW-001',    true, true, null),
  ('it', 'Generic', 'Wireless Access Point', 'Generic Wireless Access Point','GEN-WAP-001',   true, true, null),
  ('it', 'Generic', 'PoE Switch',            'Generic PoE Switch 8-Port',    'GEN-POE8-001',  true, true, null),
  ('it', 'Generic', 'PoE Switch',            'Generic PoE Switch 16-Port',   'GEN-POE16-001', true, true, null),
  ('it', 'Generic', 'PoE Switch',            'Generic PoE Switch 24-Port',   'GEN-POE24-001', true, true, null),
  ('it', 'Generic', 'Managed Switch',        'Generic Managed Switch',       'GEN-MSW-001',   true, true, null),
  ('it', 'Generic', 'Unmanaged Switch',      'Generic Unmanaged Switch',     'GEN-USW-001',   true, true, null)
ON CONFLICT (part_number) DO NOTHING;

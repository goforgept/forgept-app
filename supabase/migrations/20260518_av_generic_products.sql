-- Generic AV placeholder products for all new AV symbol categories.
-- Uses ON CONFLICT DO NOTHING so re-running is safe.

INSERT INTO global_products (industry, manufacturer, category, name, part_number, is_active, is_basic, specs)
VALUES
  ('av', 'Generic', 'Projector',          'Generic Projector',                  'GEN-PROJ-001',   true, true, null),
  ('av', 'Generic', 'Projection Screen',  'Generic Projection Screen',          'GEN-SCRN-001',   true, true, null),
  ('av', 'Generic', 'Touch Panel',        'Generic Touch Panel',                'GEN-TP-001',     true, true, null),
  ('av', 'Generic', 'Control Processor',  'Generic Control Processor',          'GEN-CTRL-001',   true, true, null),
  ('av', 'Generic', 'Ceiling Speaker',    'Generic Ceiling Speaker',            'GEN-CSPK-001',   true, true, null),
  ('av', 'Generic', 'Subwoofer',          'Generic Subwoofer',                  'GEN-SUB-001',    true, true, null),
  ('av', 'Generic', 'Microphone',         'Generic Wired Microphone',           'GEN-MIC-001',    true, true, null),
  ('av', 'Generic', 'Wireless Mic',       'Generic Wireless Microphone',        'GEN-WMIC-001',   true, true, null),
  ('av', 'Generic', 'Video Conference',   'Generic Video Conference Codec',     'GEN-VC-001',     true, true, null),
  ('av', 'Generic', 'Media Player',       'Generic Media Player',               'GEN-MP-001',     true, true, null),
  ('av', 'Generic', 'HDMI Extender',      'Generic HDMI Extender',              'GEN-HDMIX-001',  true, true, null),
  ('av', 'Generic', 'AV Receiver',        'Generic AV Receiver',                'GEN-AVR-001',    true, true, null),
  ('av', 'Generic', 'Clock',              'Generic Analog Clock',               'GEN-CLK-001',    true, true, null),
  ('av', 'Generic', 'Document Camera',    'Generic Document Camera',            'GEN-DOCCAM-001', true, true, null),
  ('av', 'Generic', 'Streaming Encoder',  'Generic Streaming Encoder',          'GEN-ENC-001',    true, true, null),
  ('av', 'Generic', 'Digital Signage',    'Generic Digital Signage Player',     'GEN-DS-001',     true, true, null),
  ('av', 'Generic', 'Wall Plate',         'Generic AV Wall Plate',              'GEN-WP-001',     true, true, null)
ON CONFLICT (part_number) DO NOTHING;

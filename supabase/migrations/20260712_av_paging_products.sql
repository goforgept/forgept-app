-- Generic paging device placeholder products for the AV symbol picker.
-- Uses ON CONFLICT DO NOTHING so re-running is safe.

INSERT INTO global_products (industry, manufacturer, category, name, part_number, is_active, is_basic, specs)
VALUES
  ('av', 'Generic', 'Paging Speaker',    'Generic Paging Speaker',           'GEN-PSPK-001',  true, true, null),
  ('av', 'Generic', 'Paging Speaker',    'Generic Ceiling Paging Speaker',   'GEN-PSPK-002',  true, true, null),
  ('av', 'Generic', 'IP Paging Device',  'Generic IP Paging Endpoint',       'GEN-IPPAG-001', true, true, null),
  ('av', 'Generic', 'IP Paging Device',  'Generic IP Paging Intercom',       'GEN-IPPAG-002', true, true, null),
  ('av', 'Generic', 'Paging Amplifier',  'Generic Paging Amplifier',         'GEN-PAMP-001',  true, true, null),
  ('av', 'Generic', 'Paging Controller', 'Generic Paging Controller',        'GEN-PCTL-001',  true, true, null),
  ('av', 'Generic', 'Paging Controller', 'Generic IP Paging Controller',     'GEN-PCTL-002',  true, true, null)
ON CONFLICT (part_number) DO NOTHING;

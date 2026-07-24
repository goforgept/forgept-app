-- Generic placeholder devices for workstations, thin/thick clients, and badging stations.
-- ON CONFLICT DO NOTHING makes re-running safe.

INSERT INTO global_products (industry, manufacturer, category, name, part_number, is_active, is_basic, specs)
VALUES
  ('security', 'Generic', 'Workstation',    'Generic Workstation',               'GEN-WS-001',   true, true, null),
  ('security', 'Generic', 'Thin Client',    'Generic Thin Client',               'GEN-TC-001',   true, true, null),
  ('security', 'Generic', 'Thick Client',   'Generic Thick Client',              'GEN-TKC-001',  true, true, null),
  ('security', 'Generic', 'Badging Station','Generic Badging Station',           'GEN-BADGE-001',true, true, null)
ON CONFLICT (part_number) DO NOTHING;

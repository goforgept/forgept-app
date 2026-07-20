-- Generic wireless repeater for intrusion/security systems
INSERT INTO global_products (industry, manufacturer, category, name, part_number, is_active, is_basic, specs)
VALUES
  ('security', 'Generic', 'Repeater', 'Generic Wireless Repeater', 'GEN-REP-001', true, true, null)
ON CONFLICT (part_number) DO NOTHING;

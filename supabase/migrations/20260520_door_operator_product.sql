-- Generic Door Operator product.
INSERT INTO global_products (industry, manufacturer, category, name, part_number, is_active, is_basic, specs)
VALUES
  ('security', 'Generic', 'Door Operator', 'Generic Door Operator', 'GEN-DO-001', true, true, null)
ON CONFLICT (part_number) DO NOTHING;

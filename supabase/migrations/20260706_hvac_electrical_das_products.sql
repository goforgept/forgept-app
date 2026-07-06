-- Generic HVAC, Electrical, and DAS placeholder products for the designer.
-- ON CONFLICT DO NOTHING makes re-running safe.

-- ── HVAC ─────────────────────────────────────────────────────────────────────
INSERT INTO global_products (industry, manufacturer, category, name, part_number, is_active, is_basic, specs)
VALUES
  ('hvac', 'Generic', 'Air Handler',       'Generic Air Handling Unit (AHU)',       'GEN-AHU-001',    true, true, null),
  ('hvac', 'Generic', 'VAV Box',           'Generic Variable Air Volume Box',       'GEN-VAV-001',    true, true, null),
  ('hvac', 'Generic', 'Fan Coil Unit',     'Generic Fan Coil Unit (FCU)',           'GEN-FCU-001',    true, true, null),
  ('hvac', 'Generic', 'Exhaust Fan',       'Generic Exhaust Fan',                   'GEN-EXF-001',    true, true, null),
  ('hvac', 'Generic', 'Damper',            'Generic Motorized Damper',              'GEN-DMP-001',    true, true, null),
  ('hvac', 'Generic', 'CO2 Sensor',        'Generic CO2 / Air Quality Sensor',      'GEN-CO2-001',    true, true, null),
  ('hvac', 'Generic', 'VRF Indoor Unit',   'Generic VRF Indoor Unit',               'GEN-VRFI-001',   true, true, null),
  ('hvac', 'Generic', 'VRF Outdoor Unit',  'Generic VRF Outdoor Unit',              'GEN-VRFO-001',   true, true, null),
  ('hvac', 'Generic', 'Chiller',           'Generic Water Chiller',                 'GEN-CHLR-001',   true, true, null),
  ('hvac', 'Generic', 'Boiler',            'Generic Boiler',                        'GEN-BOLR-001',   true, true, null),
  ('hvac', 'Generic', 'BACnet Controller', 'Generic BACnet DDC Controller',         'GEN-BAC-001',    true, true, null),
  ('hvac', 'Generic', 'Zone Controller',   'Generic Zone Controller',               'GEN-ZC-001',     true, true, null),
  ('hvac', 'Generic', 'Humidifier',        'Generic Duct Humidifier',               'GEN-HUM-001',    true, true, null),
  ('hvac', 'Generic', 'Thermostat',        'Generic Programmable Thermostat',       'GEN-TSTAT-001',  true, true, null),
  ('hvac', 'Generic', 'Diffuser',          'Generic Supply Air Diffuser',           'GEN-DIFF-001',   true, true, null)
ON CONFLICT (part_number) DO NOTHING;

-- ── Electrical ───────────────────────────────────────────────────────────────
INSERT INTO global_products (industry, manufacturer, category, name, part_number, is_active, is_basic, specs)
VALUES
  ('electrical', 'Generic', 'Panel',          'Generic Main Distribution Panel',       'GEN-MDP-001',   true, true, null),
  ('electrical', 'Generic', 'Sub Panel',      'Generic Sub Panel',                     'GEN-SUBP-001',  true, true, null),
  ('electrical', 'Generic', 'Transformer',    'Generic Dry-Type Transformer',          'GEN-XFMR-001',  true, true, null),
  ('electrical', 'Generic', 'UPS',            'Generic UPS / Battery Backup',          'GEN-UPS-001',   true, true, null),
  ('electrical', 'Generic', 'Generator',      'Generic Standby Generator',             'GEN-GEN-001',   true, true, null),
  ('electrical', 'Generic', 'Transfer Switch','Generic Automatic Transfer Switch',     'GEN-ATS-001',   true, true, null),
  ('electrical', 'Generic', 'Junction Box',   'Generic Junction Box',                  'GEN-JB-001',    true, true, null),
  ('electrical', 'Generic', 'Light Switch',   'Generic Single-Pole Light Switch',      'GEN-LSW-001',   true, true, null),
  ('electrical', 'Generic', 'Dimmer',         'Generic Dimmer Switch',                 'GEN-DIM-001',   true, true, null),
  ('electrical', 'Generic', 'GFCI Outlet',    'Generic GFCI Duplex Outlet',            'GEN-GFCI-001',  true, true, null),
  ('electrical', 'Generic', 'Circuit Breaker','Generic Circuit Breaker',               'GEN-CB-001',    true, true, null),
  ('electrical', 'Generic', 'EV Charger',     'Generic EV Charging Station',           'GEN-EVC-001',   true, true, null),
  ('electrical', 'Generic', 'Disconnect',     'Generic Safety Disconnect Switch',      'GEN-DISC-001',  true, true, null),
  ('electrical', 'Generic', 'Outlet',         'Generic Duplex Outlet',                 'GEN-OUT-001',   true, true, null),
  ('electrical', 'Generic', 'Lighting',       'Generic Light Fixture',                 'GEN-LGT-001',   true, true, null)
ON CONFLICT (part_number) DO NOTHING;

-- ── DAS (Distributed Antenna System) ─────────────────────────────────────────
INSERT INTO global_products (industry, manufacturer, category, name, part_number, is_active, is_basic, specs)
VALUES
  ('das', 'Generic', 'BDA',              'Generic Bi-Directional Amplifier',        'GEN-BDA-001',   true, true, null),
  ('das', 'Generic', 'Donor Antenna',    'Generic Donor / Roof Antenna',            'GEN-DONA-001',  true, true, null),
  ('das', 'Generic', 'Omni Antenna',     'Generic Omni-Directional Antenna',        'GEN-OMNI-001',  true, true, null),
  ('das', 'Generic', 'Directional Antenna', 'Generic Directional / Panel Antenna',  'GEN-DIRA-001',  true, true, null),
  ('das', 'Generic', 'Splitter',         'Generic RF Splitter',                     'GEN-SPLT-001',  true, true, null),
  ('das', 'Generic', 'Coupler',          'Generic Directional Coupler',             'GEN-COUP-001',  true, true, null),
  ('das', 'Generic', 'Fiber Node',       'Generic Fiber-Optic Node',                'GEN-FNODE-001', true, true, null),
  ('das', 'Generic', 'Remote Unit',      'Generic Remote Radio Unit (RRU)',         'GEN-RRU-001',   true, true, null),
  ('das', 'Generic', 'Head End',         'Generic DAS Head-End Unit',               'GEN-HEU-001',   true, true, null),
  ('das', 'Generic', 'Small Cell',       'Generic Small Cell / Indoor Femtocell',   'GEN-SC-001',    true, true, null),
  ('das', 'Generic', 'Attenuator',       'Generic RF Attenuator / Pad',             'GEN-ATT-001',   true, true, null),
  ('das', 'Generic', 'Terminator',       'Generic 50Ω RF Terminator',              'GEN-TERM-001',  true, true, null)
ON CONFLICT (part_number) DO NOTHING;

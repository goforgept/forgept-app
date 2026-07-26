#!/usr/bin/env python3
"""
Builds SQL UPDATE statements for global_products.accessories from two CSVs:

  - accessory_library.csv        : reusable accessory definitions (type each
                                    accessory ONCE, even if used on many devices)
  - device_accessory_mapping.csv : which devices get which accessories,
                                    referencing the library by accessory_key

Usage:
  python3 build_accessories_sql.py accessory_library.csv device_accessory_mapping.csv > accessories_update.sql

This is a full resync per device: for any device_part_number that appears in
the mapping CSV, the script recomputes that device's ENTIRE accessories JSON
from every row present for it in the current CSV, and overwrites the column.
Devices not mentioned in the mapping CSV are left untouched. So always include
every accessory a device should have when you re-run this — don't treat the
CSV as "just the new additions."
"""
import csv
import json
import sys
from collections import defaultdict


def load_library(path):
    library = {}
    with open(path, newline='', encoding='utf-8-sig') as f:
        for row in csv.DictReader(f):
            key = (row.get('accessory_key') or '').strip()
            if not key:
                continue
            library[key] = {
                'name':         (row.get('accessory_name') or '').strip(),
                'part_number':  (row.get('accessory_part_number') or '').strip(),
                'manufacturer': (row.get('accessory_manufacturer') or '').strip(),
            }
    return library


def load_mapping(path):
    with open(path, newline='', encoding='utf-8-sig') as f:
        return list(csv.DictReader(f))


def to_bool(v):
    return str(v or '').strip().lower() in ('true', '1', 'yes', 'y')


def build_accessories(mapping_rows, library):
    # keyed by (device_part_number, device_manufacturer)
    devices = defaultdict(lambda: {'required': [], 'options': {}})
    had_warning = False

    for i, row in enumerate(mapping_rows, start=2):  # start=2: row 1 is header
        device_pn  = (row.get('device_part_number') or '').strip()
        device_mfr = (row.get('device_manufacturer') or '').strip()
        rel_type   = (row.get('relationship_type') or '').strip().lower()
        acc_key    = (row.get('accessory_key') or '').strip()

        if not device_pn:
            print(f"WARNING (row {i}): missing device_part_number — skipping", file=sys.stderr)
            had_warning = True
            continue
        if acc_key not in library:
            print(f"WARNING (row {i}): accessory_key '{acc_key}' not found in library (device {device_pn}) — skipping", file=sys.stderr)
            had_warning = True
            continue

        acc = library[acc_key]
        key = (device_pn, device_mfr)

        if rel_type == 'required':
            qty = row.get('quantity') or '1'
            try:
                qty = int(qty)
            except ValueError:
                qty = 1
            devices[key]['required'].append({
                'type':         (row.get('group_name') or '').strip() or acc['name'],
                'part_number':  acc['part_number'],
                'name':         acc['name'],
                'manufacturer': acc['manufacturer'],
                'quantity':     qty,
            })

        elif rel_type == 'option':
            group_name = (row.get('group_name') or '').strip()
            if not group_name:
                print(f"WARNING (row {i}): option row for {device_pn} missing group_name — skipping", file=sys.stderr)
                had_warning = True
                continue
            group = devices[key]['options'].setdefault(group_name, {
                'group':    group_name,
                'required': to_bool(row.get('group_required')),
                'default':  '',
                'choices':  [],
            })
            group['choices'].append({
                'part_number':  acc['part_number'],
                'name':         acc['name'],
                'manufacturer': acc['manufacturer'],
            })
            if to_bool(row.get('is_default')):
                group['default'] = acc['part_number']

        else:
            print(f"WARNING (row {i}): unknown relationship_type '{rel_type}' for {device_pn} — skipping", file=sys.stderr)
            had_warning = True

    return devices, had_warning


def emit_sql(devices):
    lines = []
    for (part_number, manufacturer), data in devices.items():
        accessories_json = {
            'required': data['required'],
            'options':  list(data['options'].values()),
        }
        payload = json.dumps(accessories_json).replace("'", "''")
        pn_escaped = part_number.replace("'", "''")
        if manufacturer:
            mfr_escaped = manufacturer.replace("'", "''")
            where_clause = f"part_number = '{pn_escaped}' AND manufacturer = '{mfr_escaped}'"
        else:
            where_clause = f"part_number = '{pn_escaped}'"
        lines.append(f"-- {part_number} ({manufacturer or 'any manufacturer'})")
        lines.append(f"UPDATE global_products SET accessories = '{payload}'::jsonb WHERE {where_clause};")
        lines.append("")
    return "\n".join(lines)


def main():
    if len(sys.argv) != 3:
        print("Usage: build_accessories_sql.py accessory_library.csv device_accessory_mapping.csv", file=sys.stderr)
        sys.exit(1)

    library = load_library(sys.argv[1])
    mapping_rows = load_mapping(sys.argv[2])
    devices, had_warning = build_accessories(mapping_rows, library)

    print(emit_sql(devices))

    print(f"-- Generated {len(devices)} UPDATE statement(s) from {len(mapping_rows)} mapping row(s).", file=sys.stderr)
    if had_warning:
        print("-- One or more rows were skipped — see WARNINGs above before running this SQL.", file=sys.stderr)


if __name__ == '__main__':
    main()

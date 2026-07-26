# Accessory CSV Import

Fills in `global_products.accessories` in bulk without adding new catalog rows — matches exactly what `AccessoriesEditor.jsx` already produces one product at a time.

## Files

- **`accessory_library_template.csv`** — type each distinct accessory once (name, part number, manufacturer). Give it a short `accessory_key` you invent (e.g. `SDC-1500-STRIKE`) — that's how the mapping file references it.
- **`device_accessory_mapping_template.csv`** — one row per (device, accessory) pairing. References the library by `accessory_key` instead of retyping name/part number/manufacturer every time.
- **`build_accessories_sql.py`** — reads both CSVs and generates `UPDATE global_products SET accessories = ...` statements.

## Why two files

Some accessories are generic and reused across many devices from different manufacturers (an SDC strike that works with a dozen different access readers/controllers). Others are device-specific (a mount that only fits one camera model). Typing the generic ones once in the library and just referencing them by key in the mapping file means updating an SDC part number later only requires editing one row, not every device that uses it.

## Column reference — `device_accessory_mapping.csv`

| Column | Required for | Notes |
|---|---|---|
| `device_part_number` | all rows | must match an existing `global_products.part_number` |
| `device_manufacturer` | recommended | disambiguates if part numbers repeat across manufacturers |
| `relationship_type` | all rows | `required` or `option` |
| `group_name` | `option` rows | label shown in the Designer, e.g. "Mount Type", "Strike/Lock" |
| `group_required` | `option` rows | `true`/`false` — must the installer pick one from this group |
| `is_default` | `option` rows | `true` on exactly one choice per group |
| `accessory_key` | all rows | must exist in `accessory_library.csv` |
| `quantity` | `required` rows | defaults to 1 if blank |

## Running it

```
python3 build_accessories_sql.py accessory_library.csv device_accessory_mapping.csv > accessories_update.sql
```

Warnings print to stderr (missing accessory_key, unknown relationship_type, etc.) — check those before running the SQL. The script does a **full resync per device**: every device_part_number in the mapping CSV gets its entire `accessories` column overwritten from whatever rows exist for it in that run. Devices not mentioned are left alone. So always include every accessory a device should end up with — don't treat the CSV as an incremental diff.

Once you've got real data filled in (even partially — you don't need every device done at once), send me the two CSVs and I'll run the generated SQL directly against the database and verify it landed correctly, same way I tested the templates above.

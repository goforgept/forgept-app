alter table org_products
  add constraint org_products_org_id_part_number_key unique (org_id, part_number);

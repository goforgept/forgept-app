alter table purchase_orders
  add column if not exists job_id uuid references jobs(id) on delete set null;

create index if not exists purchase_orders_job_id_idx on purchase_orders(job_id);

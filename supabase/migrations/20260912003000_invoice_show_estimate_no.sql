-- Toggle whether the source estimate number is shown on each invoice.

alter table public.invoices
  add column if not exists show_estimate_no boolean not null default true;

create table if not exists companies (
  id text primary key,
  name text not null,
  postal_code text not null,
  address text not null,
  phone text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists customers (
  id text primary key,
  name text not null,
  address text not null,
  contact text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists work_items (
  id text primary key,
  category text not null,
  name text not null,
  unit text not null,
  material_cost numeric(12, 0) not null default 0,
  labor_cost numeric(12, 0) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists place_templates (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists material_templates (
  id text primary key,
  place_template_id text not null references place_templates(id) on delete cascade,
  name text not null,
  unit text not null,
  quantity numeric(12, 2) not null default 1,
  material_cost numeric(12, 0) not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists estimates (
  id text primary key,
  estimate_no text not null unique,
  customer_id text references customers(id) on delete set null,
  customer_name text not null,
  customer_address text not null,
  project_name text not null,
  site_address text not null,
  status text not null check (status in ('draft', 'completed')),
  created_at date not null,
  updated_at date not null
);

create table if not exists estimate_places (
  id text primary key,
  estimate_id text not null references estimates(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0
);

create table if not exists estimate_items (
  id text primary key,
  estimate_place_id text not null references estimate_places(id) on delete cascade,
  source_id text,
  type text not null check (type in ('material', 'work', 'manual')),
  name text not null,
  specification text not null default '',
  quantity numeric(12, 2) not null default 1,
  unit text not null,
  material_cost numeric(12, 0) not null default 0,
  labor_cost numeric(12, 0) not null default 0,
  sort_order integer not null default 0,
  required boolean not null default false
);

create table if not exists invoices (
  id text primary key,
  invoice_no text not null unique,
  estimate_id text references estimates(id) on delete set null,
  estimate_no text not null,
  show_estimate_no boolean not null default true,
  customer_id text references customers(id) on delete set null,
  company_name text not null,
  project_name text not null,
  issue_date date not null,
  due_date date not null,
  amount numeric(12, 0) not null default 0,
  status text not null check (status in ('draft', 'issued'))
);

create table if not exists invoice_items (
  id bigserial primary key,
  invoice_id text not null references invoices(id) on delete cascade,
  sort_order integer not null default 0,
  name text not null,
  quantity numeric(12, 2) not null default 1,
  unit text not null,
  amount numeric(12, 0) not null default 0
);

create table if not exists app_settings (
  id text primary key,
  payment_due_days integer not null default 30,
  profit_rate numeric(5, 2) not null default 20,
  updated_at timestamptz not null default now()
);

create index if not exists material_templates_place_template_id_idx on material_templates(place_template_id);
create index if not exists estimate_places_estimate_id_idx on estimate_places(estimate_id);
create index if not exists estimate_items_estimate_place_id_idx on estimate_items(estimate_place_id);
create index if not exists invoices_estimate_id_idx on invoices(estimate_id);
create index if not exists invoice_items_invoice_id_idx on invoice_items(invoice_id);

insert into app_settings (id, payment_due_days, profit_rate)
values ('default', 30, 20)
on conflict (id) do nothing;

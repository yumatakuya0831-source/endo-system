-- Initial schema and seed data migrated from app/lib/domain.ts.
-- Run this in the Supabase SQL Editor for the configured project.

create table if not exists public.companies (
  id text primary key,
  name text not null,
  postal_code text not null,
  address text not null,
  phone text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customers (
  id text primary key,
  name text not null,
  address text not null,
  contact text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.work_items (
  id text primary key,
  category text not null,
  name text not null,
  unit text not null,
  material_cost numeric(12, 0) not null default 0,
  labor_cost numeric(12, 0) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.place_templates (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.material_templates (
  id text primary key,
  place_template_id text not null references public.place_templates(id) on delete cascade,
  name text not null,
  unit text not null,
  quantity numeric(12, 2) not null default 1,
  material_cost numeric(12, 0) not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.estimates (
  id text primary key,
  estimate_no text not null unique,
  customer_id text references public.customers(id) on delete set null,
  customer_name text not null,
  customer_address text not null,
  project_name text not null,
  site_address text not null,
  status text not null check (status in ('draft', 'completed')),
  created_at date not null,
  updated_at date not null
);

create table if not exists public.estimate_places (
  id text primary key,
  estimate_id text not null references public.estimates(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0
);

create table if not exists public.estimate_items (
  id text primary key,
  estimate_place_id text not null references public.estimate_places(id) on delete cascade,
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

create table if not exists public.invoices (
  id text primary key,
  invoice_no text not null unique,
  estimate_id text references public.estimates(id) on delete set null,
  estimate_no text not null,
  customer_id text references public.customers(id) on delete set null,
  company_name text not null,
  project_name text not null,
  issue_date date not null,
  due_date date not null,
  amount numeric(12, 0) not null default 0,
  status text not null check (status in ('draft', 'issued'))
);

create table if not exists public.invoice_items (
  id bigserial primary key,
  invoice_id text not null references public.invoices(id) on delete cascade,
  sort_order integer not null default 0,
  name text not null,
  quantity numeric(12, 2) not null default 1,
  unit text not null,
  amount numeric(12, 0) not null default 0
);

create index if not exists material_templates_place_template_id_idx on public.material_templates(place_template_id);
create index if not exists estimate_places_estimate_id_idx on public.estimate_places(estimate_id);
create index if not exists estimate_items_estimate_place_id_idx on public.estimate_items(estimate_place_id);
create index if not exists invoices_estimate_id_idx on public.invoices(estimate_id);
create index if not exists invoice_items_invoice_id_idx on public.invoice_items(invoice_id);

alter table public.companies enable row level security;
alter table public.customers enable row level security;
alter table public.work_items enable row level security;
alter table public.place_templates enable row level security;
alter table public.material_templates enable row level security;
alter table public.estimates enable row level security;
alter table public.estimate_places enable row level security;
alter table public.estimate_items enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'companies',
    'customers',
    'work_items',
    'place_templates',
    'material_templates',
    'estimates',
    'estimate_places',
    'estimate_items',
    'invoices',
    'invoice_items'
  ]
  loop
    execute format('drop policy if exists "Allow public demo access" on public.%I', table_name);
    execute format('drop policy if exists "Allow authenticated users" on public.%I', table_name);
    execute format('create policy "Allow authenticated users" on public.%I for all to authenticated using (true) with check (true)', table_name);
  end loop;
end $$;

insert into public.companies (id, name, postal_code, address, phone)
values
  ('co-1', '遠藤設備株式会社', '100-0005', '東京都千代田区丸の内1-1-1', '03-1234-5678')
on conflict (id) do update set
  name = excluded.name,
  postal_code = excluded.postal_code,
  address = excluded.address,
  phone = excluded.phone,
  updated_at = now();

insert into public.customers (id, name, address, contact)
values
  ('cu-1', '青葉不動産株式会社', '東京都世田谷区桜丘2-8-12', '施設管理部 佐藤様'),
  ('cu-2', '株式会社みなと商事', '神奈川県横浜市中区海岸通3-5', '総務部 高橋様'),
  ('cu-3', '西東京メディカル', '東京都練馬区石神井町4-10-2', '事務長 鈴木様')
on conflict (id) do update set
  name = excluded.name,
  address = excluded.address,
  contact = excluded.contact,
  updated_at = now();

insert into public.work_items (id, category, name, unit, material_cost, labor_cost)
values
  ('wo-1', 'トイレ工事', '便器取付工事', '台', 48000, 18000),
  ('wo-2', 'トイレ工事', '給排水接続工事', '式', 8500, 24000),
  ('wo-3', 'トイレ工事', '既設便器撤去・処分', '台', 3000, 12000),
  ('wo-4', '洗面所工事', '洗面化粧台取付', '台', 62000, 22000),
  ('wo-5', 'キッチン工事', '水栓交換工事', '台', 28000, 15000)
on conflict (id) do update set
  category = excluded.category,
  name = excluded.name,
  unit = excluded.unit,
  material_cost = excluded.material_cost,
  labor_cost = excluded.labor_cost,
  updated_at = now();

insert into public.place_templates (id, name)
values
  ('pl-1', 'トイレ'),
  ('pl-2', '洗面所'),
  ('pl-3', 'キッチン')
on conflict (id) do update set
  name = excluded.name,
  updated_at = now();

insert into public.material_templates (id, place_template_id, name, unit, quantity, material_cost, sort_order)
values
  ('ma-1', 'pl-1', '止水栓', '個', 1, 3200, 0),
  ('ma-2', 'pl-1', '給水フレキ管', '本', 1, 1800, 1),
  ('ma-3', 'pl-1', 'シール材・雑材', '式', 1, 2500, 2),
  ('ma-4', 'pl-2', '排水トラップ', '個', 1, 4800, 0),
  ('ma-5', 'pl-2', '接続管・雑材', '式', 1, 3200, 1),
  ('ma-6', 'pl-3', '給水接続部材', '式', 1, 4500, 0),
  ('ma-7', 'pl-3', 'シール材・雑材', '式', 1, 2800, 1)
on conflict (id) do update set
  place_template_id = excluded.place_template_id,
  name = excluded.name,
  unit = excluded.unit,
  quantity = excluded.quantity,
  material_cost = excluded.material_cost,
  sort_order = excluded.sort_order,
  updated_at = now();

insert into public.estimates (
  id, estimate_no, customer_id, customer_name, customer_address, project_name, site_address, status, created_at, updated_at
)
values
  ('es-1', 'EST-2026-001', 'cu-1', '青葉不動産株式会社', '東京都世田谷区桜丘2-8-12', '桜丘レジデンス 2階トイレ改修', '東京都世田谷区桜丘2-10-4', 'completed', '2026-09-02', '2026-09-04'),
  ('es-2', 'EST-2026-002', 'cu-2', '株式会社みなと商事', '神奈川県横浜市中区海岸通3-5', '本社給湯室 水栓更新', '神奈川県横浜市西区みなとみらい2-2-1', 'draft', '2026-09-05', '2026-09-05')
on conflict (id) do update set
  estimate_no = excluded.estimate_no,
  customer_id = excluded.customer_id,
  customer_name = excluded.customer_name,
  customer_address = excluded.customer_address,
  project_name = excluded.project_name,
  site_address = excluded.site_address,
  status = excluded.status,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at;

insert into public.estimate_places (id, estimate_id, name, sort_order)
values
  ('ep-1', 'es-1', '2階 共用トイレ', 0),
  ('ep-2', 'es-2', '3階 給湯室', 0)
on conflict (id) do update set
  estimate_id = excluded.estimate_id,
  name = excluded.name,
  sort_order = excluded.sort_order;

insert into public.estimate_items (
  id, estimate_place_id, source_id, type, name, specification, quantity, unit, material_cost, labor_cost, sort_order, required
)
values
  ('ei-1', 'ep-1', 'ma-1', 'material', '止水栓', '標準品', 2, '個', 3200, 0, 0, true),
  ('ei-2', 'ep-1', 'wo-1', 'work', '便器取付工事', '洋式便器', 2, '台', 48000, 18000, 1, false),
  ('ei-3', 'ep-1', 'wo-3', 'work', '既設便器撤去・処分', '搬出含む', 2, '台', 3000, 12000, 2, false),
  ('ei-4', 'ep-2', 'wo-5', 'work', '水栓交換工事', '混合水栓', 1, '台', 28000, 15000, 0, false)
on conflict (id) do update set
  estimate_place_id = excluded.estimate_place_id,
  source_id = excluded.source_id,
  type = excluded.type,
  name = excluded.name,
  specification = excluded.specification,
  quantity = excluded.quantity,
  unit = excluded.unit,
  material_cost = excluded.material_cost,
  labor_cost = excluded.labor_cost,
  sort_order = excluded.sort_order,
  required = excluded.required;

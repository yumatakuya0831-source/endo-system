-- Add default invoice settings.

create table if not exists public.app_settings (
  id text primary key,
  payment_due_days integer not null default 30,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

drop policy if exists "Allow authenticated users to read settings" on public.app_settings;
create policy "Allow authenticated users to read settings"
  on public.app_settings
  for select
  to authenticated
  using (true);

insert into public.app_settings (id, payment_due_days)
values ('default', 30)
on conflict (id) do nothing;

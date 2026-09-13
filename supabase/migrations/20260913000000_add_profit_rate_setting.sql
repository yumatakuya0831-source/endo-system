alter table public.app_settings
  add column if not exists profit_rate numeric(5, 2) not null default 20;

insert into public.app_settings (id, payment_due_days, profit_rate)
values ('default', 30, 20)
on conflict (id) do update
set profit_rate = coalesce(public.app_settings.profit_rate, excluded.profit_rate);

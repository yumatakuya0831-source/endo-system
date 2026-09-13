alter table public.app_settings
  add column if not exists profit_rate numeric(5, 2) not null default 20;

insert into public.app_settings (id, payment_due_days, profit_rate)
values ('default', 30, 20)
on conflict (id) do update
set profit_rate = coalesce(public.app_settings.profit_rate, excluded.profit_rate);

drop policy if exists "Allow admins to insert settings" on public.app_settings;
create policy "Allow admins to insert settings"
  on public.app_settings
  for insert
  to authenticated
  with check (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
    or auth.jwt() ->> 'email' = 'yumatakuya0831@gmail.com'
  );

drop policy if exists "Allow admins to update settings" on public.app_settings;
create policy "Allow admins to update settings"
  on public.app_settings
  for update
  to authenticated
  using (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
    or auth.jwt() ->> 'email' = 'yumatakuya0831@gmail.com'
  )
  with check (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
    or auth.jwt() ->> 'email' = 'yumatakuya0831@gmail.com'
  );

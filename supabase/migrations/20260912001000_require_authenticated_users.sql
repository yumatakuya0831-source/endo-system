-- Tighten demo policies so only registered Supabase Auth users can access data.
-- Run this after the initial migration if the public demo policy was already applied.

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

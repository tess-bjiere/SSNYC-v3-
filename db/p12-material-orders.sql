-- Tess, 2026-08-18: "add ability to create an order for materials from the
-- material library".
--
-- A new, additive table — a purchase order assembled from the materials library.
-- Each order is a named list scoped to a brand, with a status (draft → sent →
-- received) and an ordered `items` jsonb of lines: { material_id, qty, unit,
-- note }. The material row carries what the thing is; the line carries how much
-- this order asks for. Grouping by supplier for the printable PO happens in the
-- app, from each material's own supplier — the order itself can span suppliers.
-- Soft-delete like everything else.
--
-- Already applied to the FRED database (project vjiwcreytvmxvxasyvoo), where the
-- materials library lives. Run this by hand in the Supabase SQL editor of the
-- Loyalist project (axwavdjhzvtluvsixfjq) if/when material orders are switched on
-- there too — until then the /material-orders page renders its empty state (the
-- reader tolerates the missing table), so nothing breaks before you run it.

create table if not exists public.material_orders (
  id uuid primary key default gen_random_uuid(),
  brand text not null default 'sous-sous',
  name text not null,
  status text not null default 'draft',       -- 'draft' | 'sent' | 'received'
  ship_to text,                                -- where deliveries go (optional)
  notes text,
  items jsonb not null default '[]'::jsonb,    -- ordered [{material_id, qty, unit, note}]
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.material_orders enable row level security;
drop policy if exists material_orders_read on public.material_orders;
drop policy if exists material_orders_insert on public.material_orders;
drop policy if exists material_orders_update on public.material_orders;
create policy material_orders_read on public.material_orders for select to authenticated using (true);
create policy material_orders_insert on public.material_orders for insert to authenticated with check (true);
create policy material_orders_update on public.material_orders for update to authenticated using (true);

grant all on public.material_orders to anon, authenticated, service_role;
create index if not exists material_orders_brand_status_idx on public.material_orders (brand, status);
create index if not exists material_orders_deleted_idx on public.material_orders (deleted_at);

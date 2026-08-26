-- Tess, 2026-08-26: "I want to add a quote section to the sourcing page --- essentially
-- it's the same as the order page but doesnt include quantity or price and allows for
-- notes to be added" + "add ai file would be a hyper link".
--
-- A quote is a material order in a different mode: the same list of materials drawn
-- from the library, but with no quantity or unit (a quote asks a supplier to price
-- the materials — the numbers come back, they don't go out), the per-line note kept,
-- and each material's AI-file link carried through exactly as the order already does.
--
-- So rather than a second, near-identical table, this adds one column to
-- material_orders that says which mode a row is: 'order' (the default, every existing
-- row) or 'quote'. The Orders list shows kind='order', the new Quotes list shows
-- kind='quote', and the detail page renders the right mode from the row. Additive and
-- nullable-with-a-default, so every row already in the table becomes an 'order' and
-- nothing changes for orders. To undo: stop reading the column; the quotes simply
-- become orders again.
--
-- NOT yet applied anywhere as of 2026-08-26 — run it by hand in the Supabase SQL
-- editor of BOTH projects: the FRED project (vjiwcreytvmxvxasyvoo), where
-- material_orders already exists, and the Loyalist project (axwavdjhzvtluvsixfjq),
-- where material_orders must be created first (db/p12-material-orders.sql) because
-- material orders were never switched on there. The lists tolerate a missing column
-- (they read as 'order'), but CREATING a quote needs this column to exist.

alter table public.material_orders
  add column if not exists kind text not null default 'order';   -- 'order' | 'quote'

create index if not exists material_orders_brand_kind_idx
  on public.material_orders (brand, kind);

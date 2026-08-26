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
-- Already applied to the FRED database (project vjiwcreytvmxvxasyvoo), where material
-- orders live. Run this by hand in the Supabase SQL editor of the Loyalist project
-- (axwavdjhzvtluvsixfjq) if/when material orders are switched on there too — until
-- then the pages render their empty states (the readers tolerate the missing column),
-- so nothing breaks before you run it.

alter table public.material_orders
  add column if not exists kind text not null default 'order';   -- 'order' | 'quote'

create index if not exists material_orders_brand_kind_idx
  on public.material_orders (brand, kind);

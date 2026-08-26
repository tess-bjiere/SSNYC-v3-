import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTeam } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { activeBrand } from "@/lib/activeBrand";
import { ordersEnabled } from "@/lib/appConfig";
import {
  normalizeItems,
  normalizeStatus,
  normalizeKind,
  ORDER_STATUSES,
  type OrderStatus,
} from "@/lib/materialOrder";
import { createOrder } from "@/app/actions/materialOrders";

export const dynamic = "force-dynamic";

// The material quotes index (Tess, 2026-08-26: "add a quote section to the
// sourcing page --- essentially it's the same as the order page but doesnt include
// quantity or price and allows for notes to be added"). The same shape as the
// Orders list — grouped by status, one-line create — over the same table, filtered
// to kind='quote'. The create form carries a hidden kind=quote so createOrder marks
// the row; the detail page is shared with orders and renders the quote mode from
// the row. Team only and gated the same way orders are.
//
// select("*") tolerates the table/column not existing yet (before db/p24): the
// list comes back empty and nothing errors, the same graceful path Orders takes.

type Row = {
  id: string;
  name: string;
  status: string;
  kind?: string | null;
  items: unknown;
  updated_at?: string | null;
};

export default async function QuotesPage() {
  await requireTeam();
  const brand = await activeBrand();
  if (!ordersEnabled(brand)) notFound();

  const supabase = await createClient();
  const { data } = await supabase
    .from("material_orders")
    .select("*")
    .eq("brand", brand)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  const rows = ((data ?? []) as Row[]).filter((r) => normalizeKind(r.kind) === "quote");

  const byStatus = (s: OrderStatus) => rows.filter((r) => normalizeStatus(r.status) === s);

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title display">Quotes</h1>
      </div>

      {/* A quote is priced by the supplier, so it starts with no quantities — just
          the materials and any notes. Create an empty one here, then add materials. */}
      <form action={createOrder} className="ls-new mo-new">
        <input type="hidden" name="kind" value="quote" />
        <input
          className="input sm ls-new-name"
          name="name"
          placeholder="New quote — e.g. FW26 fabric pricing…"
          autoComplete="off"
          required
        />
        <button className="btn sm" type="submit">
          + New quote
        </button>
      </form>

      {ORDER_STATUSES.map((s) => {
        const list = byStatus(s.key);
        if (list.length === 0) return null;
        return (
          <section className="ls-group" key={s.key}>
            <h2>{s.label}</h2>
            <div className="ls-list">
              {list.map((r) => {
                const count = normalizeItems(r.items).length;
                return (
                  <Link key={r.id} href={`/material-orders/${r.id}`} className="ls-card">
                    <span className="ls-card-name">{r.name}</span>
                    <span className="ls-card-meta">
                      {count === 0
                        ? "Empty"
                        : `${count} ${count === 1 ? "material" : "materials"}`}
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}

      {rows.length === 0 && (
        <div className="empty">
          No quotes yet. Create one above, or select materials in{" "}
          <Link href="/materials">Materials</Link> and add them to a quote.
        </div>
      )}
    </div>
  );
}

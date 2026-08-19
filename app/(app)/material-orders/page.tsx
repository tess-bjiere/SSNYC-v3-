import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTeam } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { activeBrand } from "@/lib/activeBrand";
import { APP } from "@/lib/appConfig";
import {
  normalizeItems,
  normalizeStatus,
  ORDER_STATUSES,
  type OrderStatus,
} from "@/lib/materialOrder";
import { createOrder } from "@/app/actions/materialOrders";

export const dynamic = "force-dynamic";

// The material orders index (Tess, 2026-08-18: "add ability to create an order
// for materials from the material library"). Grouped by status — Draft, Sent,
// Received — with a one-line create form; the fuller way in is the library's
// select mode, which creates an order already seeded with the chosen materials.
// Team only, like the rest of the product side, and FRED-only like the materials
// library it draws from.
//
// The select("*") tolerates the material_orders table not existing yet (before
// db/p12-material-orders.sql is run) — data comes back null, the list is empty,
// and nothing errors, the same graceful path the materials page takes.

type Row = {
  id: string;
  name: string;
  status: string;
  items: unknown;
  updated_at?: string | null;
};

export default async function MaterialOrdersPage() {
  // FRED-only for now — orders draw on the FRED-only materials library.
  if (APP.id !== "fred") notFound();
  await requireTeam();
  const brand = await activeBrand();

  const supabase = await createClient();
  const { data } = await supabase
    .from("material_orders")
    .select("*")
    .eq("brand", brand)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  const rows = (data ?? []) as Row[];

  const byStatus = (s: OrderStatus) => rows.filter((r) => normalizeStatus(r.status) === s);

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title display">Material Orders</h1>
      </div>

      {/* Create an empty order here; or select materials in the library and
          create one already filled. The status is Draft on creation — it moves to
          Sent / Received from the order itself. */}
      <form action={createOrder} className="ls-new mo-new">
        <input
          className="input sm ls-new-name"
          name="name"
          placeholder="New order — e.g. FW26 fabric buy…"
          autoComplete="off"
          required
        />
        <button className="btn sm" type="submit">
          + New order
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
                        : `${count} ${count === 1 ? "line" : "lines"}`}
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
          No orders yet. Create one above, or select materials in{" "}
          <Link href="/materials">Materials</Link> and choose “Create order”.
        </div>
      )}
    </div>
  );
}

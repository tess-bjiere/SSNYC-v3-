import { createClient } from "@/lib/supabase/server";
import { activeBrand } from "@/lib/activeBrand";
import { getSessionUser } from "@/lib/access";
import { ordersEnabled } from "@/lib/appConfig";
import { normalizeStandards } from "@/lib/colorStandards";
import MaterialsClient, { type Material } from "./MaterialsClient";

export const dynamic = "force-dynamic";

// The materials library — fabrics, trims and packaging (Tess, 2026-08-18). Its
// own table, scoped to the active brand, told apart by `kind`. Available on every
// deploy: SOUS SOUS and Renggli document their (often evergreen) materials too,
// even though only FRED ORDERS them — the factory provides theirs directly (Tess,
// 2026-08-19). Reads tolerate the table not existing yet: until the materials
// table is created on the Loyalist database (db/p18-materials-loyalist.sql), this
// page shows its empty state rather than erroring.
export default async function MaterialsPage() {
  const supabase = await createClient();
  const brand = await activeBrand();
  // Ordering follows the brand now: FRED plus SOUS SOUS and Renggli (Tess,
  // 2026-08-24: "add the orders tab to sourcing on the sous sous and renggli
  // versions"). The library itself is not gated — every brand documents materials.
  const canOrder = ordersEnabled(brand);
  const [{ data, error }, ordersRes, stylesRes, user, stdsRes] = await Promise.all([
    supabase
      .from("materials")
      .select("*")
      .eq("brand", brand)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    // Open orders (draft or sent) so a selection can be added to one — FRED only;
    // off FRED there is no orders table, so don't even ask.
    canOrder
      ? supabase
          .from("material_orders")
          .select("id,name,status,kind")
          .eq("brand", brand)
          .is("deleted_at", null)
          .neq("status", "received")
          .order("updated_at", { ascending: false })
      : Promise.resolve({ data: [], error: null } as const),
    // The brand's products — its styles. These are the garments a fabric can be
    // used for (Tess, 2026-08-19: "the products listed on the website"), sourced
    // live so the dropdown never drifts from what's actually in the line. Each
    // carries its garment `type`, which gives the "filter by garment type" axis.
    supabase
      .from("styles")
      .select("name,garment")
      .eq("brand", brand)
      .is("deleted_at", null)
      .order("name", { ascending: true }),
    getSessionUser(),
    // Colour standards are FRED-only (Tess, 2026-08-23: "can you create a color
    // standard that lives in the tool for fred?") — the `color_standards` table
    // does not exist on the Loyalist database and never will, so this query is
    // gated behind canOrder (the same FRED-only flag material_orders above uses)
    // rather than run unconditionally. normalizeStandards(null) is kept as the
    // safety net below regardless: nothing sits between the query result and
    // that call, so if the gate is ever wrong a missing table still degrades to
    // an empty list instead of throwing.
    canOrder
      ? supabase
          .from("color_standards")
          .select("*")
          .eq("brand", brand)
          .is("deleted_at", null)
      : Promise.resolve({ data: [], error: null } as const),
  ]);

  const materials = (error ? [] : (data ?? [])) as Material[];
  // Open orders AND quotes come back together (same table); split by kind so the
  // pickbar can offer "Add to order…" and "Add to quote…" separately (Tess,
  // 2026-08-26: "put add to quote button in"). A row with no kind reads as an order.
  const openRows = (ordersRes.error ? [] : (ordersRes.data ?? [])) as {
    id: string;
    name: string;
    status: string;
    kind?: string | null;
  }[];
  const openOrders = openRows.filter((r) => r.kind !== "quote");
  const openQuotes = openRows.filter((r) => r.kind === "quote");
  // Distinct products by name (a garment type can have several products); each
  // keeps its type for the garment-type filter.
  const seen = new Set<string>();
  const products: { name: string; type: string | null }[] = [];
  for (const s of (stylesRes.data ?? []) as { name: string | null; garment: string | null }[]) {
    const name = (s.name ?? "").trim();
    if (name && !seen.has(name)) {
      seen.add(name);
      products.push({ name, type: (s.garment ?? "").trim() || null });
    }
  }
  // normalizeStandards(null) → [] is the whole mechanism: nothing sits between
  // the query and this call, so a missing table on Loyalist (stdsRes.data is
  // null there, not an array) can never throw — it just yields no standards,
  // and the client hides the chip and filter entirely when the list is empty.
  const standards = normalizeStandards(stdsRes.data);
  return (
    <MaterialsClient
      materials={materials}
      canEdit={user?.role === "team"}
      canOrder={canOrder}
      openOrders={openOrders}
      openQuotes={openQuotes}
      products={products}
      standards={standards}
    />
  );
}

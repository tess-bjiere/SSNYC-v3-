import { createClient } from "@/lib/supabase/server";
import { activeBrand } from "@/lib/activeBrand";
import { getSessionUser } from "@/lib/access";
import { APP } from "@/lib/appConfig";
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
  // Ordering is FRED-only (SOUS SOUS / Renggli get materials from the factory, so
  // there is nothing to order). The library itself is not gated.
  const canOrder = APP.id === "fred";
  const supabase = await createClient();
  const brand = await activeBrand();
  const [{ data, error }, ordersRes, stylesRes, user] = await Promise.all([
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
          .select("id,name,status")
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
  ]);

  const materials = (error ? [] : (data ?? [])) as Material[];
  const openOrders = (ordersRes.error ? [] : (ordersRes.data ?? [])) as {
    id: string;
    name: string;
    status: string;
  }[];
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
  return (
    <MaterialsClient
      materials={materials}
      canEdit={user?.role === "team"}
      canOrder={canOrder}
      openOrders={openOrders}
      products={products}
    />
  );
}

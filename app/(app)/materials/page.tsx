import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { activeBrand } from "@/lib/activeBrand";
import { getSessionUser } from "@/lib/access";
import { APP } from "@/lib/appConfig";
import MaterialsClient, { type Material } from "./MaterialsClient";

export const dynamic = "force-dynamic";

// The materials library — fabrics and trims (Tess, 2026-08-18). Its own table,
// scoped to the active brand, told apart by `kind`. Reads tolerate the table
// not existing yet: on the Loyalist database, until db/p11-materials.sql is run
// by hand, this page shows its empty state rather than erroring.
export default async function MaterialsPage() {
  // FRED-only for now (Tess, 2026-08-18: "hide fabric and trims ... on the sous
  // sous / renggli versions"). The nav hides the link on the SSYNC deploy; this
  // makes the URL itself a 404 there so a direct link can't reach it either.
  if (APP.id !== "fred") notFound();
  const supabase = await createClient();
  const brand = await activeBrand();
  const [{ data, error }, ordersRes, stylesRes, user] = await Promise.all([
    supabase
      .from("materials")
      .select("*")
      .eq("brand", brand)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    // Open orders (draft or sent) so a selection can be added to one — tolerates
    // the material_orders table not existing yet, like everything else.
    supabase
      .from("material_orders")
      .select("id,name,status")
      .eq("brand", brand)
      .is("deleted_at", null)
      .neq("status", "received")
      .order("updated_at", { ascending: false }),
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
      openOrders={openOrders}
      products={products}
    />
  );
}

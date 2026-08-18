import { createClient } from "@/lib/supabase/server";
import { activeBrand } from "@/lib/activeBrand";
import { getSessionUser } from "@/lib/access";
import MaterialsClient, { type Material } from "./MaterialsClient";

export const dynamic = "force-dynamic";

// The materials library — fabrics and trims (Tess, 2026-08-18). Its own table,
// scoped to the active brand, told apart by `kind`. Reads tolerate the table
// not existing yet: on the Loyalist database, until db/p11-materials.sql is run
// by hand, this page shows its empty state rather than erroring.
export default async function MaterialsPage() {
  const supabase = await createClient();
  const brand = await activeBrand();
  const [{ data, error }, user] = await Promise.all([
    supabase
      .from("materials")
      .select("*")
      .eq("brand", brand)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    getSessionUser(),
  ]);

  const materials = (error ? [] : (data ?? [])) as Material[];
  return <MaterialsClient materials={materials} canEdit={user?.role === "team"} />;
}

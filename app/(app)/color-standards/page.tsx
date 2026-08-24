import { notFound } from "next/navigation";
import { requireTeam } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { activeBrand } from "@/lib/activeBrand";
import { APP } from "@/lib/appConfig";
import { normalizeStandards } from "@/lib/colorStandards";
import StandardsClient, { type StandardMaterial } from "./StandardsClient";

export const dynamic = "force-dynamic";

// The colour standards index (Tess, 2026-08-23: "can you create a color
// standard that lives in the tool for fred?"). FRED-only, like the material
// orders drawn from the same library — a standard is the studio's own approved
// physical reference, not something a factory hands over. Mirrors
// app/(app)/material-orders/page.tsx exactly: gate, scope to the brand, hand
// the whole list to the client.
export default async function ColorStandardsPage() {
  if (APP.id !== "fred") notFound();
  await requireTeam();
  const brand = await activeBrand();
  const supabase = await createClient();

  // select("*") tolerates the color_standards table not existing yet — data
  // comes back null, the list is empty, nothing errors. Same graceful path
  // material-orders takes, because this codebase ships to SSYNC too, and SSYNC
  // has no such table.
  const { data } = await supabase
    .from("color_standards")
    .select("*")
    .eq("brand", brand)
    .is("deleted_at", null)
    .order("name");
  const standards = normalizeStandards(data);

  // The materials the approvals point at — just enough for the card's rollup
  // (rollup() needs the live-id set to skip a soft-deleted material's approval)
  // and, one day, a name. The fuller profile is only fetched on the detail page.
  const { data: mats } = await supabase
    .from("materials")
    .select("id,name,kind,color,supplier")
    .eq("brand", brand)
    .is("deleted_at", null);
  const materials: StandardMaterial[] = Array.isArray(mats) ? mats : [];

  return <StandardsClient standards={standards} materials={materials} />;
}

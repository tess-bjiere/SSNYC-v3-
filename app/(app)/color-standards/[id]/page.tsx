import { notFound } from "next/navigation";
import { requireTeam } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { activeBrand } from "@/lib/activeBrand";
import { APP } from "@/lib/appConfig";
import { normalizeStandard } from "@/lib/colorStandards";
import type { Material } from "@/app/(app)/materials/MaterialsClient";
import StandardClient from "./StandardClient";

export const dynamic = "force-dynamic";

// One colour standard: its master fields, plus every material in the brand —
// the approved ones resolve the approvals table, the whole set feeds the "add
// material" picker. Mirrors app/(app)/material-orders/[id]/page.tsx's shape.
export default async function ColorStandardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (APP.id !== "fred") notFound();
  await requireTeam();
  const { id } = await params;

  const supabase = await createClient();
  const brand = await activeBrand();
  // Scoped to the active brand and to live rows: without both, this route
  // would 200 on another brand's standard, or keep serving a soft-deleted one
  // fully editable after Remove redirects away (Findings 1 and 2).
  const { data } = await supabase
    .from("color_standards")
    .select("*")
    .eq("id", id)
    .eq("brand", brand)
    .is("deleted_at", null)
    .maybeSingle();
  const standard = normalizeStandard(data);
  if (!standard) notFound();

  // Every live material for this brand, full profile — the approval rows need
  // materialSpecLine's whole set of fields (composition/material, price,
  // supplier), not just the light columns the index reads.
  const { data: matRows } = await supabase
    .from("materials")
    .select("*")
    .eq("brand", brand)
    .is("deleted_at", null);
  const materials = (matRows ?? []) as Material[];

  return <StandardClient id={id} standard={standard} materials={materials} />;
}

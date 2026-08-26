import { notFound } from "next/navigation";
import { requireTeam } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { activeBrand } from "@/lib/activeBrand";
import { ordersEnabled } from "@/lib/appConfig";
import { loadBrands } from "@/lib/brandsServer";
import { brandName } from "@/lib/brands";
import { specLine, kindOf, materialFacts } from "@/lib/materials";
import { normalizeStandards, standardForMaterial, standardPoValue } from "@/lib/colorStandards";
import type { Material } from "@/app/(app)/materials/MaterialsClient";
import {
  normalizeItems,
  normalizeStatus,
  normalizeKind,
  buildOrder,
  type OrderEntryInput,
} from "@/lib/materialOrder";
import OrderClient, { type PickMaterial } from "./OrderClient";

export const dynamic = "force-dynamic";

// One material order: its lines resolved against the materials library and handed
// to the client. Mirrors the linesheet page — the row, then the materials it
// references and the full library for the add picker, mapped in `items` order,
// with the supplier grouping done by lib/materialOrder.ts.

type Row = {
  id: string;
  name: string;
  status: string;
  kind?: string | null;
  ship_to?: string | null;
  notes?: string | null;
  items: unknown;
};

function cover(m: Material): string {
  return m.thumb_url || m.image_url || "";
}

export default async function MaterialOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireTeam();
  const { id } = await params;

  const supabase = await createClient();
  const brand = await activeBrand();
  // On for FRED and for SOUS SOUS / Renggli (Tess, 2026-08-24); off elsewhere.
  if (!ordersEnabled(brand)) notFound();
  const { data } = await supabase.from("material_orders").select("*").eq("id", id).maybeSingle();
  const row = (data as Row) ?? null;
  if (!row) notFound();

  // Every live material for this brand — the referenced ones resolve the lines,
  // the whole set feeds the add picker. One read, like the linesheet.
  const { data: matRows } = await supabase
    .from("materials")
    .select("*")
    .eq("brand", brand)
    .is("deleted_at", null);
  const materials = (matRows ?? []) as Material[];
  const byId = new Map(materials.map((m) => [m.id, m]));

  // The colour standards these materials are matched to (Tess, 2026-08-23: "make
  // PO print linked colour standard"). This page is FRED-only, so the table is
  // always present here; normalizeStandards still degrades a null to [] on its own.
  const { data: stdRows } = await supabase
    .from("color_standards")
    .select("*")
    .eq("brand", brand)
    .is("deleted_at", null);
  const standards = normalizeStandards(stdRows);

  const items = normalizeItems(row.items);

  // Lines in the order's own order; a material since deleted simply drops.
  const inputs: OrderEntryInput[] = items
    .map((line): OrderEntryInput | null => {
      const m = byId.get(line.material_id);
      if (!m) return null;
      return {
        materialId: m.id,
        name: m.name,
        kind: m.kind,
        supplier: m.supplier,
        supplierRef: m.supplier_ref,
        // The full profile spec, plus the colour standard this material is
        // matched to. standardPoValue prints the name and the objective facts
        // only — never the standard's spec/notes/master_location, which are
        // written in internal voice.
        details: (() => {
          const facts = materialFacts(m, ["supplier", "supplier_ref", "ai_file"]);
          const std = standardForMaterial(standards, m.id);
          if (std) facts.push({ label: "Colour standard", value: standardPoValue(std) });
          return facts;
        })(),
        aiFile: m.ai_file ?? null,
        thumb: cover(m) || null,
        qty: line.qty ?? null,
        unit: line.unit ?? null,
        note: line.note ?? null,
      };
    })
    .filter((x): x is OrderEntryInput => x !== null);

  const order = buildOrder(
    { name: row.name, status: normalizeStatus(row.status) },
    inputs
  );

  // The add picker: every material, flagged if already on the order, with the
  // spec line the library shows so a row is recognisable.
  const inOrder = new Set(items.map((i) => i.material_id));
  const pickable: PickMaterial[] = materials.map((m) => ({
    id: m.id,
    name: m.name,
    kind: kindOf(m),
    supplier: m.supplier,
    spec: specLine(m),
    thumb: cover(m) || null,
    inOrder: inOrder.has(m.id),
  }));

  // The printable PO's masthead — the active brand's logo (or its name), like the
  // linesheet cover.
  const brands = await loadBrands();
  const brandLogo = brands.find((b) => b.slug === brand)?.logo_url || null;
  const brandLabel = brandName(brand, brands);
  const generatedOn = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  }).format(new Date());

  return (
    <OrderClient
      id={id}
      kind={normalizeKind(row.kind)}
      order={order}
      shipTo={row.ship_to ?? ""}
      notes={row.notes ?? ""}
      pickable={pickable}
      cover={{ brandLogo, brandLabel, generatedOn }}
    />
  );
}

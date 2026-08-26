"use server";

import { revalidatePath } from "next/cache";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireTeam } from "@/lib/access";
import { ordersEnabled } from "@/lib/appConfig";
import { activeBrand } from "@/lib/activeBrand";
import {
  addItems,
  removeItem,
  setItemField,
  normalizeItems,
  normalizeStatus,
  normalizeKind,
  type OrderLine,
} from "@/lib/materialOrder";

// Every write to a material order goes through here, matching
// app/actions/linesheets.ts: gate, read the row's items jsonb, apply a pure
// lib/materialOrder.ts helper, write the whole list back. Nothing hard-deletes.
// The gate closes the write behind the same door the pages use: ordering is on
// for FRED and for the SOUS SOUS / Renggli brands (Tess, 2026-08-24: "add the
// orders tab to sourcing on the sous sous and renggli versions"). A server action
// is a POST endpoint that stays callable even where no page imports it, so the
// brand check belongs on the write itself, not only on the route. It reads the
// active brand rather than the deploy, so a brand without ordering 404s here
// exactly as the whole deploy used to.
const TABLE = "material_orders";

async function requireOrdersTeam() {
  if (!ordersEnabled(await activeBrand())) notFound();
  return requireTeam();
}

async function readItems(
  id: string
): Promise<{ supabase: Awaited<ReturnType<typeof createClient>>; items: OrderLine[] }> {
  const supabase = await createClient();
  const { data } = await supabase.from(TABLE).select("items").eq("id", id).maybeSingle();
  return { supabase, items: normalizeItems(data?.items) };
}

// Both the Orders list and the Quotes list read this table; a write to either
// kind revalidates both, plus the shared detail route. Cheap, and it means a quote
// edit never leaves the Quotes list stale.
function revalidateOrders(id?: string) {
  revalidatePath("/material-orders");
  revalidatePath("/quotes");
  if (id) revalidatePath(`/material-orders/${id}`);
}

async function writeItems(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
  items: OrderLine[]
) {
  await supabase.from(TABLE).update({ items, updated_at: new Date().toISOString() }).eq("id", id);
  revalidateOrders(id);
}

// Create an order — born into the brand you are looking at, optionally seeded
// with the materials selected in the library. `material_ids` arrives as repeated
// form fields (the library's select mode) or is passed directly.
export async function createOrder(form: FormData) {
  const user = await requireOrdersTeam();
  const name = ((form.get("name") as string) || "").trim();
  if (!name) return;
  const ids = form.getAll("material_ids").map((v) => String(v)).filter(Boolean);
  const items = addItems([], ids);
  // 'order' by default; the Quotes list passes kind=quote (Tess, 2026-08-26).
  const kind = normalizeKind(form.get("kind"));

  const supabase = await createClient();
  const brand = await activeBrand();
  const { data } = await supabase
    .from(TABLE)
    // `kind` is only sent for a quote, so ordinary order creation stays byte-for-byte
    // what it was and keeps working on a database where db/p24 has not been run yet
    // (the column defaults to 'order' there anyway).
    .insert({
      name,
      status: "draft",
      items,
      brand,
      created_by: user?.email ?? null,
      ...(kind === "quote" ? { kind } : {}),
    })
    .select("id")
    .single();
  revalidateOrders();
  // The detail page is shared between both kinds and reads the row's kind, so a
  // quote and an order open at the same route.
  if (data?.id) redirect(`/material-orders/${data.id}`);
}

export async function renameOrder(id: string, form: FormData) {
  await requireOrdersTeam();
  const name = ((form.get("name") as string) || "").trim();
  if (!name) return;
  const supabase = await createClient();
  await supabase.from(TABLE).update({ name, updated_at: new Date().toISOString() }).eq("id", id);
  revalidateOrders(id);
}

export async function setOrderStatus(id: string, status: string) {
  await requireOrdersTeam();
  const supabase = await createClient();
  await supabase
    .from(TABLE)
    .update({ status: normalizeStatus(status), updated_at: new Date().toISOString() })
    .eq("id", id);
  revalidateOrders(id);
}

// The delivery address and the free-text notes on the order (both optional).
export async function setOrderMeta(
  id: string,
  patch: { ship_to?: string | null; notes?: string | null }
) {
  await requireOrdersTeam();
  const clean: Record<string, string | null> = {};
  for (const k of ["ship_to", "notes"] as const) {
    if (k in patch) {
      const v = patch[k];
      clean[k] = typeof v === "string" && v.trim() === "" ? null : v ?? null;
    }
  }
  if (Object.keys(clean).length === 0) return;
  const supabase = await createClient();
  await supabase
    .from(TABLE)
    .update({ ...clean, updated_at: new Date().toISOString() })
    .eq("id", id);
  revalidateOrders(id);
}

// Add materials to an existing order (from the library's "Add to order", or the
// detail page's own picker). Returns whether anything new landed, so a caller
// can toast accurately.
export async function addMaterialsToOrder(
  id: string,
  materialIds: string[]
): Promise<{ added: number }> {
  await requireOrdersTeam();
  const { supabase, items } = await readItems(id);
  const next = addItems(items, materialIds);
  const added = next.length - items.length;
  if (added > 0) await writeItems(supabase, id, next);
  return { added };
}

export async function removeOrderLine(id: string, materialId: string) {
  await requireOrdersTeam();
  const { supabase, items } = await readItems(id);
  const next = removeItem(items, materialId);
  if (next.length === items.length) return;
  await writeItems(supabase, id, next);
}

// A line's quantity / unit / note — what this order actually asks for.
export async function setOrderLine(
  id: string,
  materialId: string,
  patch: { qty?: string | null; unit?: string | null; note?: string | null }
) {
  await requireOrdersTeam();
  const { supabase, items } = await readItems(id);
  await writeItems(supabase, id, setItemField(items, materialId, patch));
}

// Delete an order — soft, like everything else: a deleted_at timestamp takes it
// off the list and Restore (setting it back to null) would bring it whole.
export async function deleteOrder(id: string) {
  await requireOrdersTeam();
  const supabase = await createClient();
  // Read the kind first so the redirect lands back on the list it came from.
  const { data: row } = await supabase.from(TABLE).select("kind").eq("id", id).maybeSingle();
  await supabase.from(TABLE).update({ deleted_at: new Date().toISOString() }).eq("id", id);
  revalidateOrders();
  redirect(normalizeKind(row?.kind) === "quote" ? "/quotes" : "/material-orders");
}

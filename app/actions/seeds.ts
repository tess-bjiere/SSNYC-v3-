"use server";

// The one-time imports behind Setup → Imports (Tess, 2026-11-02: "Update SYNC
// tool to have a section for vintage reference images … call it 'archival'",
// "Add photographers to ssync from deck", "create a space for potential models
// to be added as well and add the ones in the deck above").
//
// Why an in-app button and not a SQL file: the rows have to be written as a
// signed-in team member (RLS is closed to anon), the images ship with the deploy
// as static files (public/archival, public/roster — no upload step), and an
// import that can be pressed again safely is easier to trust than a script run
// once by hand. What gets added is decided by lib/seedPlan.ts, which looks at
// Trash too, so a second press never doubles a row or brings back something the
// team deleted. Card fields are only filled where blank (cardWithDefaults).
//
// Everything goes into SOUS SOUS — the deck and the image library are its — even
// if the person pressing is looking at another brand.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireTeam } from "@/lib/access";
import { PEOPLE, instagramUrl, type PeopleKind } from "@/lib/people";
import { cardWithDefaults } from "@/lib/photographerMeta";
import { nameKey, planSize, type PersonRecord } from "@/lib/peopleRecords";
import { previewPeopleSync, readPeople, syncPeopleLinks } from "@/lib/peopleDb";
import { planArchival, planPeople, type ExistingRow } from "@/lib/seedPlan";
import { ARCHIVAL_SEED } from "@/lib/seeds/archival";
import { PHOTOGRAPHER_SEED, MODEL_SEED, type PersonSeed } from "@/lib/seeds/creatives";

// "people" is not an import of new material: it runs the people-records sync
// (lib/peopleDb.ts) over every row, which tags whatever a write missed — the
// catch-up after the people phase-1 deploy (2026-11-02), and safe at any time.
export type SeedId = "archival" | "photographers" | "models" | "people";
const SEED_BRAND = "sous-sous";
const IMPORTS_KEY = "imports";
const COLS = "id,type,image_url,thumb_url,photographer,model,deleted_at";

type Supa = Awaited<ReturnType<typeof createClient>>;

// Every row of these types for the brand, Trash included, past PostgREST's
// 1,000-row page.
async function readRows(supabase: Supa, types: readonly string[]): Promise<ExistingRow[]> {
  const out: ExistingRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("references")
      .select(COLS)
      .eq("brand", SEED_BRAND)
      .in("type", types as string[])
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as ExistingRow[]));
    if (!data || data.length < 1000) return out;
  }
}

function peopleSeed(kind: PeopleKind): PersonSeed[] {
  return kind === "model" ? MODEL_SEED : PHOTOGRAPHER_SEED;
}
// A model borrows from Campaign rows (Alexandra Agoston, Lucinda Levant), so its
// read takes those in too; the photographer directory already reads them.
function peopleTypes(kind: PeopleKind): string[] {
  const c = PEOPLE[kind];
  return Array.from(new Set([...c.rowTypes, c.ownType, "editorial"]));
}

export type SeedStatus = { id: SeedId; total: number; missing: number; lastRun: { at: string; by: string; added: number } | null };

/** What each import would add right now — read by the Setup page. */
export async function seedStatuses(): Promise<SeedStatus[]> {
  await requireTeam();
  const supabase = await createClient();
  const [archRows, photoRows, modelRows, { data: imp }, peoplePlan] = await Promise.all([
    readRows(supabase, ["archival"]),
    readRows(supabase, peopleTypes("photographer")),
    readRows(supabase, peopleTypes("model")),
    supabase.from("settings").select("value").eq("key", IMPORTS_KEY).maybeSingle(),
    // Before db/p30 is applied the tables are not there; report nothing to do
    // rather than failing the whole Setup panel.
    previewPeopleSync(supabase, SEED_BRAND).catch(() => null),
  ]);
  const runs = (imp?.value ?? {}) as Record<string, SeedStatus["lastRun"]>;
  const p = PEOPLE.photographer;
  const m = PEOPLE.model;
  return [
    { id: "archival", total: ARCHIVAL_SEED.length, missing: planArchival(ARCHIVAL_SEED, archRows).length, lastRun: runs.archival ?? null },
    {
      id: "photographers",
      total: PHOTOGRAPHER_SEED.length,
      missing: planPeople("photographer", p.ownType, p.rowTypes, PHOTOGRAPHER_SEED, photoRows).length,
      lastRun: runs.photographers ?? null,
    },
    {
      id: "models",
      total: MODEL_SEED.length,
      missing: planPeople("model", m.ownType, m.rowTypes, MODEL_SEED, modelRows).length,
      lastRun: runs.models ?? null,
    },
    { id: "people", total: 0, missing: peoplePlan ? planSize(peoplePlan) : 0, lastRun: runs.people ?? null },
  ];
}

async function insertChunks(supabase: Supa, rows: Record<string, unknown>[]): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { data, error } = await supabase.from("references").insert(chunk).select("id");
    if (error) throw new Error(error.message);
    ids.push(...((data ?? []) as { id: string }[]).map((r) => r.id));
  }
  return ids;
}

export async function runSeed(id: SeedId): Promise<{ ok: boolean; added: number; cards: number; error?: string }> {
  const user = await requireTeam();
  const by = user.name || user.email;
  const supabase = await createClient();
  let added = 0;
  let cards = 0;
  try {
    if (id === "people") {
      const plan = await syncPeopleLinks(supabase, SEED_BRAND, "all", { by, quiet: false });
      added = plan ? planSize(plan) : 0;
      revalidatePath("/photographers");
      revalidatePath("/models");
    } else if (id === "archival") {
      const todo = planArchival(ARCHIVAL_SEED, await readRows(supabase, ["archival"]));
      // Newest-first is how Archival sorts, so each row is stamped a second
      // apart in seed order: the wall opens on the Mood images, then the library
      // grouped by name, rather than in whatever order one insert lands.
      const base = Date.now();
      added = (await insertChunks(
        supabase,
        todo.map((r, i) => ({
          brand: SEED_BRAND,
          type: "archival",
          designer: r.designer,
          photographer: r.photographer,
          model: r.model,
          location: r.location,
          year: r.year,
          notes: r.notes,
          image_url: r.image,
          thumb_url: r.thumb ?? r.image,
          created_by: by,
          created_at: new Date(base - (ARCHIVAL_SEED.indexOf(r) * 1000)).toISOString(),
        }))
      )).length;
      revalidatePath("/archival");
    } else {
      const kind: PeopleKind = id === "models" ? "model" : "photographer";
      const c = PEOPLE[kind];
      const seeds = peopleSeed(kind);
      const bySeed = new Map(seeds.map((s) => [s.name.trim().toLowerCase(), s]));
      const plan = planPeople(kind, c.ownType, c.rowTypes, seeds, await readRows(supabase, peopleTypes(kind)));
      const made = await insertChunks(
        supabase,
        plan.map((p) => {
          const s = bySeed.get(p.name.trim().toLowerCase());
          const base = {
            brand: SEED_BRAND,
            type: c.ownType,
            designer: "",
            location: p.location || null,
            image_url: p.image_url,
            thumb_url: p.thumb_url,
            notes: p.note,
            created_by: by,
          };
          // A model's own Instagram rides in `link` and `photographer` is the
          // picture's credit (lib/people.ts); a photographer's IG has its column.
          return kind === "model"
            ? { ...base, model: p.name, photographer: p.credit, link: s?.ig || s?.link || null }
            : { ...base, photographer: p.name, photographer_ig: s?.ig || null, link: s?.link || null };
        })
      );

      added = made.length;
      // Tag the new rows (creating anyone new), then fill each person's record
      // from the deck — blanks only, so nothing the team has typed is undone.
      // Since people phase 1 (2026-11-02) the card lives on the person, not in
      // the name-keyed settings map.
      await syncPeopleLinks(supabase, SEED_BRAND, made, { by, quiet: false });
      const people = (await readPeople(supabase, SEED_BRAND)).filter((p) => p.kind === kind && !p.deleted_at);
      const byName = new Map<string, PersonRecord>(people.map((p) => [nameKey(p.name), p]));
      for (const s of seeds) {
        const p = byName.get(nameKey(s.name));
        if (!p) continue;
        const card = cardWithDefaults(p.card, {
          group: s.group,
          role: s.role ?? (kind === "model" ? "" : "Photographer"),
          age: s.age ?? "",
          agency: s.agency ?? "",
          pastWork: s.pastWork,
          notes: s.notes,
          ...(s.photo != null ? { photo: s.photo } : {}),
          ...(s.video != null ? { video: s.video } : {}),
        });
        const { error } = await supabase
          .from("people")
          .update({
            card,
            city: p.city || s.location || null,
            ig: p.ig || instagramUrl(s.ig) || null,
            link: p.link || s.link || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", p.id);
        if (error) throw new Error(error.message);
        cards += 1;
      }
      revalidatePath(c.href);
    }

    // Remember the run, for the Setup page.
    const { data: imp } = await supabase.from("settings").select("value").eq("key", IMPORTS_KEY).maybeSingle();
    const runs = { ...((imp?.value ?? {}) as Record<string, unknown>), [id]: { at: new Date().toISOString(), by, added } };
    await supabase.from("settings").upsert({ key: IMPORTS_KEY, value: runs, updated_at: new Date().toISOString() });
    revalidatePath("/setup");
    return { ok: true, added, cards };
  } catch (e) {
    return { ok: false, added, cards, error: e instanceof Error ? e.message : "Import failed" };
  }
}

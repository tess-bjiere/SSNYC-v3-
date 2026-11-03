import { createClient } from "@/lib/supabase/server";
import { activeBrand } from "@/lib/activeBrand";
import { getSessionUser } from "@/lib/access";
import { type Reference } from "@/lib/types";
import { MOCK } from "@/lib/mock";
import { PEOPLE, type PeopleKind } from "@/lib/people";
import { withPhotographerMetaDefaults } from "@/lib/photographerMeta";
import { planPeopleSync, type PersonRecord } from "@/lib/peopleRecords";
import { loadPeopleDirectory, OWN_TYPES } from "@/lib/peopleDb";
import { PHOTOGRAPHER_SEED, MODEL_SEED } from "@/lib/seeds/creatives";

export type DirectoryData = {
  /** The pictures tagged to this directory's people, newest first. */
  refs: Reference[];
  /** The people — one record each, card included (db/p30). */
  people: PersonRecord[];
  /** Which picture is tagged to whom. */
  links: { reference_id: string; person_id: string }[];
  canEdit: boolean;
};

// What a people directory page needs. Shared by /photographers and /models
// (2026-11-02). Since people phase 1 the directory is the `people` records of
// that kind and the pictures tagged to them in `reference_people` — from any
// wall, Campaign and Archival included — rather than rows grouped by name.
export async function loadDirectory(kind: PeopleKind): Promise<DirectoryData> {
  if (MOCK) return mockDirectory(kind);

  const supabase = await createClient();
  const brand = await activeBrand();
  const [dir, user] = await Promise.all([loadPeopleDirectory<Reference>(supabase, brand, kind), getSessionUser()]);
  return { ...dir, canEdit: user?.role === "team" };
}

// The demo preview has no database: show what the deck import would bring in,
// with its people made by the same planner the live sync runs.
function mockDirectory(kind: PeopleKind): DirectoryData {
  const c = PEOPLE[kind];
  const seeds = kind === "model" ? MODEL_SEED : PHOTOGRAPHER_SEED;
  const refs: Reference[] = [];
  let metaValue: unknown = {};
  seeds.forEach((s, i) => {
    const imgs = s.images.length ? s.images.map((x) => x.src) : [null];
    imgs.forEach((src, j) => {
      refs.push({
        id: `${kind}-${i}-${j}`,
        image: null,
        thumb: null,
        image_url: src,
        thumb_url: src,
        designer: "",
        year: null,
        season: null,
        category: null,
        garment: null,
        fabric: null,
        color: null,
        color_hex: null,
        photographer: kind === "model" ? null : s.name,
        photographer_ig: kind === "model" ? null : s.ig ?? null,
        model: kind === "model" ? s.name : null,
        location: s.location || null,
        link: kind === "model" ? s.ig ?? s.link ?? null : s.link ?? null,
        price: null,
        notes: null,
        type: c.ownType,
        extra_images: null,
        created_by: null,
        deleted_at: null,
        created_at: null,
      });
    });
    metaValue = withPhotographerMetaDefaults(metaValue, s.name, {
      group: s.group,
      role: s.role ?? "",
      age: s.age ?? "",
      agency: s.agency ?? "",
      pastWork: s.pastWork,
      notes: s.notes,
      photo: s.photo ?? false,
      video: s.video ?? false,
    });
  });
  let n = 0;
  const plan = planPeopleSync({
    rows: refs,
    people: [],
    links: [],
    ownTypes: OWN_TYPES,
    newId: () => `${kind}-person-${++n}`,
    legacyCards: { [kind]: metaValue as Record<string, unknown> },
  });
  const people = plan.create.filter((p) => p.kind === kind) as PersonRecord[];
  const links = plan.add.filter((l) => l.role === kind).map(({ reference_id, person_id }) => ({ reference_id, person_id }));
  return { refs, people, links, canEdit: true };
}

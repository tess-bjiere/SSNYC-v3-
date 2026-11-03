import { createClient } from "@/lib/supabase/server";
import { activeBrand } from "@/lib/activeBrand";
import { getSessionUser } from "@/lib/access";
import { type Reference } from "@/lib/types";
import { MOCK } from "@/lib/mock";
import { PEOPLE, type PeopleKind } from "@/lib/people";
import { withPhotographerMetaDefaults } from "@/lib/photographerMeta";
import { PHOTOGRAPHER_SEED, MODEL_SEED } from "@/lib/seeds/creatives";

// What a people directory page needs: its rows, the team-entered cards, and
// whether this viewer may edit. Shared by /photographers and /models (2026-11-02);
// lib/people.ts says which rows and which settings key belong to which.
export async function loadDirectory(kind: PeopleKind): Promise<{
  refs: Reference[];
  metaValue: unknown;
  canEdit: boolean;
}> {
  const c = PEOPLE[kind];
  if (MOCK) return mockDirectory(kind);

  const supabase = await createClient();
  const brand = await activeBrand();
  const [{ data }, { data: metaRow }, user] = await Promise.all([
    supabase
      .from("references")
      .select("*")
      .eq("brand", brand)
      .is("deleted_at", null)
      // Photographers: the campaign images (type 'editorial') and the prospect
      // roster (type 'roster') build the directory; Campaign shows only
      // 'editorial', so the roster stays out of it. Models: their own 'model'
      // rows, which no other page reads.
      .in("type", c.rowTypes as string[])
      .order("created_at", { ascending: false }),
    supabase.from("settings").select("value").eq("key", c.metaKey).maybeSingle(),
    getSessionUser(),
  ]);
  return {
    refs: (data ?? []) as Reference[],
    metaValue: metaRow?.value ?? {},
    canEdit: user?.role === "team",
  };
}

// The demo preview has no database: show what the deck import would bring in.
function mockDirectory(kind: PeopleKind) {
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
  return { refs, metaValue, canEdit: true };
}

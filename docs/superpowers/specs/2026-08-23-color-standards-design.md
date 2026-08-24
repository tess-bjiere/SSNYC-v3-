# Colour standards — design

**Date:** 2026-08-23
**Deployment:** FRED only (`APP.id === "fred"`), like `/material-orders`
**Status:** approved in chat, not yet implemented

## Why

FRED's white decisions currently live in the free-text `materials.notes` field.
As of today that field carries a hand-written `WHITE STANDARD` block on seven
fabrics and two elastics, describing three standards:

- **A — cold / optic**: brief, thong, boxer, boxer brief. Referenced to the
  existing cold elastic waistband, which is locked for this round.
- **B — soft / warm**: tee and socks. A deliberate contrast.
- **C — neutral, leans cool**: the Oxford. Inherited from Sidogras 009 rather
  than specified.

Free text cannot answer the questions that matter at order time: which qualities
are approved against Standard A, where the physical master lives, when it was
signed, and whether this delivery was matched to the master or drifted off the
last one. It also prints verbatim onto supplier POs (see Known issue below).

The production reality this models:

1. **The standard is a physical object.** A signed, dated swatch. Everything
   stored here is metadata pointing at it — a hex is a thumbnail, never the
   standard.
2. **One master per colour, approved separately on every quality.** The same
   recipe on 270 GSM rib, 155 GSM rib, poplin and a knitted sock will not match;
   each quality is approved against the master individually.
3. **Every delivery is matched to the master, never to the previous delivery.**
   Chained matching walks the colour with no single step looking wrong.
4. **Approval happens under stated light.** Visual assessment at this scale, so
   who judged it, under what light, and on what date is the record.

Point 2 is the whole data model: one standard, many per-quality approvals.

## Data model

One new table, brand-scoped, following `material_orders` — a record that owns a
list of lines as `jsonb`, rather than a join table. The dataset is small (a
handful of standards, ~10 materials) and this repo already stores relations that
way (`material_orders.items`, `styles.material_ids`, `brands.palette`).

`db/p22-color-standards.sql`:

```
create table if not exists public.color_standards (
  id uuid primary key default gen_random_uuid(),
  brand text not null default 'fred',
  name text not null,               -- "Standard A"
  label text,                       -- "Cold / optic"
  kind text,                        -- 'white' | 'color'; whites carry no Pantone,
                                    -- so the form adapts and the list groups by it
  pantone text,                     -- TCX code; usually null for whites
  hex text,                         -- screen approximation only
  swatch_url text,                  -- photo of the physical master
  master_location text,             -- "studio, white binder, signed 2026-08-23"
  approved_on date,
  approved_by text,
  spec text,                        -- whiteness target, brightener yes/no, etc.
  brightener boolean,               -- optical brightener present
  notes text,
  approvals jsonb not null default '[]'::jsonb,
  archived boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
```

RLS + grants copied verbatim from `p18-materials-loyalist.sql` (authenticated
policy plus `grant all to anon, authenticated, service_role`) — the grant FRED's
tables have needed each time.

One `approvals` entry per **material** — fabric, trim or packaging. (The body
of this spec says "quality" where the point is specifically about cloth; the
elastics are trims and are linked the same way.)

```
{ material_id, status, judged_on, judged_by, light, lab_dip_url, note }
```

An approval whose `material_id` no longer resolves — the material was soft-deleted
or removed — is ignored on read rather than shown as a broken row, and
`rollup` does not count it. The entry is left in place so restoring the material
restores its approval.

`status` is `pending | approved | rejected`. `light` is free text with a small
suggested set (Daylight / Warm indoor / D65 / TL84) rather than an enum — the
studio's practice should not be constrained by a dropdown.

**Deliberately not built:** per-delivery approval history. The `approvals` entry
holds current state per quality. A `deliveries` list can be added inside each
entry later without restructuring. No order has been placed yet; building the
history machinery now is speculative.

## Gating

FRED-only, following `material-orders` exactly:

- `app/actions/colorStandards.ts` — every action behind `requireFredTeam`
- `Nav.tsx` — `/color-standards` added to the `FRED_ONLY` set, in the **Sourcing**
  group beside Materials and Material Orders
- the page `notFound()`s when `APP.id !== "fred"`

The shared codebase means SSYNC will not have this table. Every read tolerates
its absence and falls back to an empty list, the same way `/materials` tolerated
a missing `materials` table on Loyalist.

## Modules

**`lib/colorStandards.ts`** — pure, dependency-free, unit-tested, like the rest
of `lib/`:

- `normalizeStandard(raw)` / `normalizeApproval(raw)` — coerce stored shape
- `APPROVAL_STATUSES`, `statusLabel(s)`
- `approvalFor(standard, materialId)` — the entry, or null
- `standardForMaterial(standards, materialId)` — inverts the map for the
  materials page
- `rollup(standard)` — `{approved, pending, rejected, total}` for the list view
- `setApproval(standard, materialId, patch)` / `removeApproval(...)` — the
  edits, returning a new approvals array
- `specLine(standard)` — the one-line summary under the name

Every action scopes to the active brand via `lib/activeBrand.ts`, as the
materials actions do; the column default is a backstop, not the source.

**`app/actions/colorStandards.ts`** — `createStandard`, `updateStandard`,
`setApproval`, `removeApproval`, `addStandardImage`, `archiveStandard`,
`softDeleteStandard`. Swatch and lab-dip images upload to the existing
`references` storage bucket, as materials do.

**`app/(app)/color-standards/page.tsx` + `StandardsClient.tsx`** — list of
standards, each showing swatch, name, label, spec line and the approval rollup
("4 approved · 2 pending"). Detail view: the master's metadata, inline edit, and
the approval table — one row per linked material with status, date, judged-by,
light and lab-dip thumbnail.

**Materials page changes** — the standard as a chip on the swatch card and row,
a Standard filter in the bar alongside the existing ones, and a standard picker
on the material detail. Reuses `MultiSelect` and the existing filter machinery.

## Seed and notes cleanup

Once the table exists, as a data step rather than code:

1. Create Standards A, B and C from what is recorded in the notes today.
2. Link the seven fabrics and two elastics, with status `pending` — nothing has
   physically been approved yet.
3. Cut the `WHITE STANDARD` block in `materials.notes` down to a pointer at the
   standard, moving the substance onto the standard record. This also shrinks
   what leaks onto supplier POs.

## Known issue, not fixed here

`app/(app)/material-orders/[id]/page.tsx:78` calls
`materialFacts(m, ["supplier", "supplier_ref", "ai_file"])`. `notes` is not in
the skip list, so the whole internal notes field prints on the supplier PO PDF —
today that includes duty percentages and the Acton/Sidogras contact emails.
Out of scope for this work; flagged separately and undecided.

## Testing

- Unit tests in `lib/colorStandards.test.mts`, matching the existing lib suites
- `npx tsc --noEmit`
- `npm run build`
- Render testing needs auth and the FRED DB, so it is not done locally — same
  limitation the materials library shipped under.

## Out of scope

- Per-delivery approval history
- Spectrophotometer / Delta E values — visual assessment only at this scale
- Any change to `brands.palette` or the moodboard. The palette is design intent;
  a standard is production truth. They stay separate.
- Colour standards on the SSYNC / Loyalist deployment

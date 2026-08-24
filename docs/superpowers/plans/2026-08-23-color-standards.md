# FRED Colour Standards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give FRED a colour standard record — the approved physical reference a material's colour is matched to — so the A/B/C white decisions stop living in `materials.notes` free text.

**Architecture:** One brand-scoped `color_standards` table owning its per-material approvals as a `jsonb` array, following the `material_orders` pattern already in this repo. A pure `lib/colorStandards.ts` owns the stored shape and every edit to it; server actions gate on `requireFredTeam` and write the whole array back; the page renders. One master standard per colour, approved separately on every material.

**Tech Stack:** Next.js App Router (server components + server actions), Supabase Postgres, TypeScript, `node --test` with `--experimental-strip-types` for the pure lib modules.

**Spec:** `docs/superpowers/specs/2026-08-23-color-standards-design.md`

## Global Constraints

- **FRED-only.** Every server action gates on `requireFredTeam()` from `@/lib/access`. The page calls `notFound()` when `APP.id !== "fred"`. `/color-standards` is added to the `FRED_ONLY` set in `app/(app)/Nav.tsx`.
- **Reads tolerate a missing table.** The codebase is shared with the SSYNC/Loyalist deployment, which will not have `color_standards`. Every `select` must let a null result fall through to an empty list rather than throwing — the same graceful path `app/(app)/material-orders/page.tsx` documents.
- **`lib/` modules are pure and unit-tested.** No React, no Supabase, no Next imports. Tests are `lib/<name>.test.mts` using `node:test` + `node:assert/strict`, run by `npm test`.
- **Brand-scoped.** Every read filters and every insert sets `brand` from `activeBrand()`, matching `materials` and `material_orders`.
- **Nothing hard-deletes.** Soft-delete via `deleted_at`, archive via `archived`.
- **House comment style.** Modules open with a comment explaining *why* the shape is what it is, citing the request that prompted it (Tess, 2026-08-23: "can you create a color standard that lives in the tool for fred?"). Match the density of `lib/materialOrder.ts`.
- **Commit after every task.** Do not push — Tess pushes.

---

### Task 1: `lib/colorStandards.ts` — types and normalization

**Files:**
- Create: `lib/colorStandards.ts`
- Test: `lib/colorStandards.test.mts`

**Interfaces:**
- Consumes: `normalizeHex` from `lib/palette.ts` (existing, exported).
- Produces: `ApprovalStatus`, `APPROVAL_STATUSES`, `normalizeStatus`, `statusLabel`, `Approval`, `normalizeApproval`, `normalizeApprovals`, `ColorStandard`, `normalizeStandard`, `normalizeStandards`.

- [ ] **Step 1: Write the failing test**

Create `lib/colorStandards.test.mts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeStatus,
  statusLabel,
  normalizeApproval,
  normalizeApprovals,
  normalizeStandard,
  normalizeStandards,
} from "./colorStandards.ts";

test("normalizeStatus defaults to pending and only accepts the known keys", () => {
  assert.equal(normalizeStatus("approved"), "approved");
  assert.equal(normalizeStatus("rejected"), "rejected");
  assert.equal(normalizeStatus("pending"), "pending");
  assert.equal(normalizeStatus("nonsense"), "pending");
  assert.equal(normalizeStatus(undefined), "pending");
  assert.equal(statusLabel("approved"), "Approved");
});

// An approval is worthless without the material it is about.
test("normalizeApproval requires a material_id and defaults status", () => {
  assert.equal(normalizeApproval({ status: "approved" }), null);
  assert.equal(normalizeApproval(null), null);
  assert.equal(normalizeApproval("nope"), null);
  const a = normalizeApproval({ material_id: " m1 " });
  assert.deepEqual(a, { material_id: "m1", status: "pending" });
});

test("normalizeApproval keeps the judgement fields it is given", () => {
  const a = normalizeApproval({
    material_id: "m1",
    status: "approved",
    judged_on: "2026-08-23",
    judged_by: "tess@theloyalist.com",
    light: "Daylight",
    lab_dip_url: "https://example.com/dip.jpg",
    note: "half step warmer than the master",
  });
  assert.equal(a?.status, "approved");
  assert.equal(a?.judged_on, "2026-08-23");
  assert.equal(a?.light, "Daylight");
  assert.equal(a?.note, "half step warmer than the master");
});

// One approval per material — a material is either approved against this
// standard or it is not, so a duplicate is a bug, and the first wins.
test("normalizeApprovals drops duplicates and junk, keeping order", () => {
  const list = normalizeApprovals([
    { material_id: "a", status: "approved" },
    { material_id: "b" },
    { material_id: "a", status: "rejected" },
    { status: "approved" },
    null,
  ]);
  assert.deepEqual(list.map((a) => a.material_id), ["a", "b"]);
  assert.equal(list[0].status, "approved");
});

test("normalizeApprovals returns [] for non-arrays", () => {
  assert.deepEqual(normalizeApprovals(undefined), []);
  assert.deepEqual(normalizeApprovals("nope"), []);
});

// A standard with no id or no name cannot be shown or linked to.
test("normalizeStandard requires id and name", () => {
  assert.equal(normalizeStandard({ name: "Standard A" }), null);
  assert.equal(normalizeStandard({ id: "s1" }), null);
  assert.equal(normalizeStandard(null), null);
});

test("normalizeStandard fills the full shape and cleans the hex", () => {
  const s = normalizeStandard({
    id: "s1",
    name: " Standard A ",
    label: "Cold / optic",
    kind: "white",
    hex: "FFF",
    master_location: "studio, white binder",
    approved_on: "2026-08-23",
    brightener: true,
    approvals: [{ material_id: "m1", status: "approved" }],
  });
  assert.equal(s?.name, "Standard A");
  assert.equal(s?.kind, "white");
  assert.equal(s?.hex, "#ffffff");
  assert.equal(s?.brightener, true);
  assert.equal(s?.approvals.length, 1);
  assert.equal(s?.archived, false);
});

// brightener is a tri-state: yes, no, and not-yet-known. Only a real boolean
// counts, so an unset column stays null rather than reading as "no brightener".
test("normalizeStandard keeps brightener tri-state and rejects unknown kinds", () => {
  assert.equal(normalizeStandard({ id: "s", name: "n" })?.brightener, null);
  assert.equal(normalizeStandard({ id: "s", name: "n", brightener: false })?.brightener, false);
  assert.equal(normalizeStandard({ id: "s", name: "n", brightener: "yes" })?.brightener, null);
  assert.equal(normalizeStandard({ id: "s", name: "n", kind: "pantone" })?.kind, "");
});

test("normalizeStandards drops the rows that do not survive", () => {
  const list = normalizeStandards([
    { id: "s1", name: "Standard A" },
    { id: "s2" },
    null,
  ]);
  assert.deepEqual(list.map((s) => s.name), ["Standard A"]);
  assert.deepEqual(normalizeStandards(undefined), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test 2>&1 | tail -20`
Expected: FAIL — `Cannot find module './colorStandards.ts'`

- [ ] **Step 3: Write minimal implementation**

Create `lib/colorStandards.ts`:

```ts
// A colour standard — the approved physical reference a material's colour is
// matched to (Tess, 2026-08-23: "can you create a color standard that lives in
// the tool for fred?"; FRED-only, like the material orders drawn from the same
// library).
//
// The standard is a physical object: a signed, dated swatch held in the studio.
// Everything stored here is metadata pointing AT that object — `hex` is a screen
// thumbnail for the chip and is never the standard itself, because monitors and
// dye lots do not agree.
//
// One master per colour, approved separately on every material. The same recipe
// on 270 GSM rib, 155 GSM rib, poplin and a knitted sock does not match — fibre,
// construction and surface change how light comes back — so each material earns
// its own approval against the one master. That is the whole shape: a standard
// row owning an `approvals` list with one entry per material, the same way
// material_orders owns its `items`.
//
// Pure like the rest of lib/. The one import is `normalizeHex` from ./palette.ts,
// which already does exactly this job; hex parsing should have one implementation
// rather than two that drift.

import { normalizeHex } from "./palette.ts";

export type ApprovalStatus = "pending" | "approved" | "rejected";

export const APPROVAL_STATUSES: { key: ApprovalStatus; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

export function normalizeStatus(raw: unknown): ApprovalStatus {
  return raw === "approved" || raw === "rejected" ? raw : "pending";
}

export function statusLabel(s: ApprovalStatus): string {
  return APPROVAL_STATUSES.find((x) => x.key === s)?.label ?? "Pending";
}

// One material's approval against this standard. `light` is free text rather
// than an enum — the studio judges at a window and in warm indoor light today
// and may get a light box later; a dropdown would only get in the way. What
// matters is that WHICH light is recorded at all, because two whites can agree
// in daylight and part under a warm bulb.
export type Approval = {
  material_id: string;
  status: ApprovalStatus;
  judged_on?: string;
  judged_by?: string;
  light?: string;
  lab_dip_url?: string;
  note?: string;
};

// A standard will link a handful of materials; this only stops a bad write from
// bloating the row.
const MAX_APPROVALS = 200;

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export function normalizeApproval(raw: unknown): Approval | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const material_id = str(r.material_id, 64);
  if (!material_id) return null;
  const a: Approval = { material_id, status: normalizeStatus(r.status) };
  const judged_on = str(r.judged_on, 32);
  const judged_by = str(r.judged_by, 120);
  const light = str(r.light, 80);
  const lab_dip_url = str(r.lab_dip_url, 2048);
  const note = str(r.note, 1000);
  if (judged_on) a.judged_on = judged_on;
  if (judged_by) a.judged_by = judged_by;
  if (light) a.light = light;
  if (lab_dip_url) a.lab_dip_url = lab_dip_url;
  if (note) a.note = note;
  return a;
}

// A material appears at most once — it is either approved against this standard
// or it is not — so a duplicate is a bug and the first entry wins.
export function normalizeApprovals(raw: unknown): Approval[] {
  if (!Array.isArray(raw)) return [];
  const out: Approval[] = [];
  const seen = new Set<string>();
  for (const x of raw) {
    const a = normalizeApproval(x);
    if (!a || seen.has(a.material_id)) continue;
    seen.add(a.material_id);
    out.push(a);
    if (out.length >= MAX_APPROVALS) break;
  }
  return out;
}

export type ColorStandard = {
  id: string;
  name: string;
  label: string;
  // Whites carry no usable Pantone (the TCX range barely covers them), colours
  // do — so the form adapts and the list groups on this.
  kind: "white" | "color" | "";
  pantone: string;
  // A screen approximation for the chip. NOT the standard.
  hex: string;
  swatch_url: string;
  // Where the physical master actually lives, in plain words.
  master_location: string;
  approved_on: string;
  approved_by: string;
  spec: string;
  // Tri-state: brightener present, absent, or not yet known. An unset column
  // must not read as "no brightener".
  brightener: boolean | null;
  notes: string;
  approvals: Approval[];
  archived: boolean;
};

export function normalizeStandard(raw: unknown): ColorStandard | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = str(r.id, 64);
  const name = str(r.name, 80);
  if (!id || !name) return null;
  return {
    id,
    name,
    label: str(r.label, 80),
    kind: r.kind === "white" || r.kind === "color" ? r.kind : "",
    pantone: str(r.pantone, 40),
    hex: normalizeHex(r.hex),
    swatch_url: str(r.swatch_url, 2048),
    master_location: str(r.master_location, 200),
    approved_on: str(r.approved_on, 32),
    approved_by: str(r.approved_by, 120),
    spec: str(r.spec, 2000),
    brightener: typeof r.brightener === "boolean" ? r.brightener : null,
    notes: str(r.notes, 4000),
    approvals: normalizeApprovals(r.approvals),
    archived: r.archived === true,
  };
}

export function normalizeStandards(raw: unknown): ColorStandard[] {
  if (!Array.isArray(raw)) return [];
  const out: ColorStandard[] = [];
  for (const x of raw) {
    const s = normalizeStandard(x);
    if (s) out.push(s);
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test 2>&1 | tail -20`
Expected: PASS, and the pre-existing suite count goes up rather than any prior test failing.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/colorStandards.ts lib/colorStandards.test.mts
git commit -m "Colour standards: stored shape and normalization"
```

---

### Task 2: `lib/colorStandards.ts` — lookups, edits and rollup

**Files:**
- Modify: `lib/colorStandards.ts` (append)
- Test: `lib/colorStandards.test.mts` (append)

**Interfaces:**
- Consumes: `ColorStandard`, `Approval`, `normalizeApprovals`, `normalizeStatus` from Task 1.
- Produces: `approvalFor`, `standardForMaterial`, `rollup`, `setApproval`, `removeApproval`, `specLine`. `setApproval`/`removeApproval` return a NEW `Approval[]` — they never mutate — and the action writes the whole array back, exactly as `material_orders` does.

- [ ] **Step 1: Write the failing test**

Append to `lib/colorStandards.test.mts`:

```ts
import {
  approvalFor,
  standardForMaterial,
  rollup,
  setApproval,
  removeApproval,
  specLine,
  type ColorStandard,
} from "./colorStandards.ts";

function std(over: Partial<ColorStandard> = {}): ColorStandard {
  return {
    id: "s1", name: "Standard A", label: "", kind: "", pantone: "", hex: "",
    swatch_url: "", master_location: "", approved_on: "", approved_by: "",
    spec: "", brightener: null, notes: "", approvals: [], archived: false,
    ...over,
  };
}

test("approvalFor finds the material's entry or returns null", () => {
  const s = std({ approvals: [{ material_id: "m1", status: "approved" }] });
  assert.equal(approvalFor(s, "m1")?.status, "approved");
  assert.equal(approvalFor(s, "m2"), null);
});

// The materials page needs the other direction: given a material, which standard
// claims it. A material belongs to at most one standard; the first wins.
test("standardForMaterial inverts the map", () => {
  const a = std({ id: "a", name: "A", approvals: [{ material_id: "m1", status: "pending" }] });
  const b = std({ id: "b", name: "B", approvals: [{ material_id: "m2", status: "pending" }] });
  assert.equal(standardForMaterial([a, b], "m2")?.name, "B");
  assert.equal(standardForMaterial([a, b], "m9"), null);
});

test("rollup counts by status", () => {
  const s = std({ approvals: [
    { material_id: "m1", status: "approved" },
    { material_id: "m2", status: "approved" },
    { material_id: "m3", status: "pending" },
    { material_id: "m4", status: "rejected" },
  ] });
  assert.deepEqual(rollup(s), { approved: 2, pending: 1, rejected: 1, total: 4 });
});

// A material that was soft-deleted leaves its approval behind. It must not be
// counted or shown as a broken row, but the entry stays so restoring the
// material restores its approval.
test("rollup ignores approvals whose material no longer resolves", () => {
  const s = std({ approvals: [
    { material_id: "m1", status: "approved" },
    { material_id: "gone", status: "approved" },
  ] });
  assert.deepEqual(rollup(s, new Set(["m1"])), { approved: 1, pending: 0, rejected: 0, total: 1 });
});

test("setApproval adds a new entry and patches an existing one without mutating", () => {
  const s = std({ approvals: [{ material_id: "m1", status: "pending" }] });
  const added = setApproval(s, "m2", { status: "approved", light: "Daylight" });
  assert.deepEqual(added.map((a) => a.material_id), ["m1", "m2"]);
  assert.equal(added[1].status, "approved");
  assert.equal(s.approvals.length, 1, "original untouched");

  const patched = setApproval(s, "m1", { judged_by: "tess@theloyalist.com" });
  assert.equal(patched[0].status, "pending", "unspecified fields survive");
  assert.equal(patched[0].judged_by, "tess@theloyalist.com");
});

// Clearing a field is a real edit — passing "" must remove it, not be ignored.
test("setApproval clears a field when given an empty string", () => {
  const s = std({ approvals: [{ material_id: "m1", status: "approved", note: "old" }] });
  assert.equal(setApproval(s, "m1", { note: "" })[0].note, undefined);
});

test("removeApproval drops just that material", () => {
  const s = std({ approvals: [
    { material_id: "m1", status: "pending" },
    { material_id: "m2", status: "pending" },
  ] });
  assert.deepEqual(removeApproval(s, "m1").map((a) => a.material_id), ["m2"]);
  assert.deepEqual(removeApproval(s, "nope").map((a) => a.material_id), ["m1", "m2"]);
});

test("specLine joins what is set and stays empty when nothing is", () => {
  assert.equal(specLine(std()), "");
  assert.equal(
    specLine(std({ label: "Cold / optic", pantone: "11-0601 TCX", brightener: true })),
    "Cold / optic · 11-0601 TCX · Optical brightener",
  );
  assert.equal(specLine(std({ label: "Soft", brightener: false })), "Soft · No brightener");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test 2>&1 | tail -20`
Expected: FAIL — `approvalFor` and the rest are not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `lib/colorStandards.ts`:

```ts
export function approvalFor(s: ColorStandard, materialId: string): Approval | null {
  return s.approvals.find((a) => a.material_id === materialId) ?? null;
}

// The materials page needs the other direction — given a material, which standard
// claims it. A material belongs to at most one standard; if two claim it that is
// a data bug and the first wins rather than the page guessing.
export function standardForMaterial(
  standards: ColorStandard[],
  materialId: string,
): ColorStandard | null {
  return standards.find((s) => s.approvals.some((a) => a.material_id === materialId)) ?? null;
}

// `liveIds`, when given, is the set of material ids that still resolve. An
// approval for a soft-deleted material is skipped rather than counted — but the
// entry itself is left in the row, so restoring the material restores it.
export function rollup(
  s: ColorStandard,
  liveIds?: Set<string> | null,
): { approved: number; pending: number; rejected: number; total: number } {
  const out = { approved: 0, pending: 0, rejected: 0, total: 0 };
  for (const a of s.approvals) {
    if (liveIds && !liveIds.has(a.material_id)) continue;
    out[a.status] += 1;
    out.total += 1;
  }
  return out;
}

// Add or patch one material's approval, returning a new list. An empty string
// CLEARS a field — "" is how the form says "remove this", and dropping it would
// make a note impossible to delete.
export function setApproval(
  s: ColorStandard,
  materialId: string,
  patch: Partial<Omit<Approval, "material_id">>,
): Approval[] {
  const id = materialId.trim();
  if (!id) return s.approvals.map((a) => ({ ...a }));
  const next = s.approvals.map((a) => ({ ...a }));
  const at = next.findIndex((a) => a.material_id === id);
  const base: Approval = at >= 0 ? next[at] : { material_id: id, status: "pending" };
  const merged: Approval = { ...base };
  if (patch.status !== undefined) merged.status = normalizeStatus(patch.status);
  for (const key of ["judged_on", "judged_by", "light", "lab_dip_url", "note"] as const) {
    if (patch[key] === undefined) continue;
    const v = str(patch[key], 2048);
    if (v) merged[key] = v;
    else delete merged[key];
  }
  if (at >= 0) next[at] = merged;
  else next.push(merged);
  return next;
}

export function removeApproval(s: ColorStandard, materialId: string): Approval[] {
  return s.approvals.filter((a) => a.material_id !== materialId).map((a) => ({ ...a }));
}

// The one line under the name, in the list and at the top of the detail. Same
// job as materials' specLine: say what this thing IS in as few words as the
// filled-in fields allow.
export function specLine(s: ColorStandard): string {
  const parts: string[] = [];
  if (s.label) parts.push(s.label);
  if (s.pantone) parts.push(s.pantone);
  if (s.brightener === true) parts.push("Optical brightener");
  if (s.brightener === false) parts.push("No brightener");
  return parts.join(" · ");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test 2>&1 | tail -20`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/colorStandards.ts lib/colorStandards.test.mts
git commit -m "Colour standards: lookups, approval edits and rollup"
```

---

### Task 3: Database migration

**Files:**
- Create: `db/p22-color-standards.sql`

**Interfaces:**
- Produces: the `public.color_standards` table the actions in Task 4 read and write.

There is no unit test for a migration. The deliverable is verified by applying it and reading the table back.

- [ ] **Step 1: Write the migration**

Create `db/p22-color-standards.sql`:

```sql
-- Colour standards (Tess, 2026-08-23: "can you create a color standard that
-- lives in the tool for fred?" — FRED-only, like the material orders drawn from
-- the same library).
--
-- A colour standard is the approved PHYSICAL reference a material's colour is
-- matched to: a signed, dated swatch held in the studio. Every column here is
-- metadata pointing at that object. `hex` is a screen approximation for the chip
-- and is explicitly NOT the standard — monitors and dye lots do not agree.
--
-- One master per colour, approved separately on every material: the same recipe
-- on 270 GSM rib, 155 GSM rib, poplin and a knitted sock will not match, because
-- fibre, construction and surface change how light comes back. So the approvals
-- ride the standard as a jsonb list with one entry per material, the same shape
-- material_orders uses for its lines (db/p12):
--
--   [ { "material_id": "…", "status": "pending|approved|rejected",
--       "judged_on": "2026-08-23", "judged_by": "…", "light": "Daylight",
--       "lab_dip_url": "…", "note": "…" }, … ]
--
-- Deliberately NOT here: per-delivery approval history. This holds current state
-- per material; a `deliveries` list can be added inside each entry later without
-- restructuring.
--
-- APPLY: FRED (vjiwcreytvmxvxasyvoo) via the Supabase MCP. NOT applied to the
-- Loyalist DB — the feature is FRED-only and every read tolerates the table
-- being absent, so SSYNC is unaffected.

create table if not exists public.color_standards (
  id uuid primary key default gen_random_uuid(),
  brand text not null default 'fred',
  name text not null,
  label text,
  kind text,
  pantone text,
  hex text,
  swatch_url text,
  master_location text,
  approved_on date,
  approved_by text,
  spec text,
  brightener boolean,
  notes text,
  approvals jsonb not null default '[]'::jsonb,
  archived boolean not null default false,
  deleted_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Column guards, in case the table already exists from an earlier partial run.
alter table public.color_standards add column if not exists label text;
alter table public.color_standards add column if not exists kind text;
alter table public.color_standards add column if not exists pantone text;
alter table public.color_standards add column if not exists hex text;
alter table public.color_standards add column if not exists swatch_url text;
alter table public.color_standards add column if not exists master_location text;
alter table public.color_standards add column if not exists approved_on date;
alter table public.color_standards add column if not exists approved_by text;
alter table public.color_standards add column if not exists spec text;
alter table public.color_standards add column if not exists brightener boolean;
alter table public.color_standards add column if not exists notes text;
alter table public.color_standards add column if not exists approvals jsonb not null default '[]'::jsonb;
alter table public.color_standards add column if not exists archived boolean not null default false;
alter table public.color_standards add column if not exists deleted_at timestamptz;

alter table public.color_standards enable row level security;
drop policy if exists color_standards_read on public.color_standards;
drop policy if exists color_standards_insert on public.color_standards;
drop policy if exists color_standards_update on public.color_standards;
create policy color_standards_read on public.color_standards for select to authenticated using (true);
create policy color_standards_insert on public.color_standards for insert to authenticated with check (true);
create policy color_standards_update on public.color_standards for update to authenticated using (true);

-- The grant FRED's tables have needed every time; RLS alone is not enough here.
grant all on public.color_standards to anon, authenticated, service_role;

create index if not exists color_standards_brand_idx on public.color_standards (brand);
create index if not exists color_standards_deleted_idx on public.color_standards (deleted_at);
```

- [ ] **Step 2: Apply it to the FRED database**

Apply the file's contents to Supabase project `vjiwcreytvmxvxasyvoo` using the Supabase MCP `apply_migration` tool, migration name `color_standards`.

Note: `execute_sql` on this MCP connection is **read-only**, so DDL and any data write must go through `apply_migration`.

- [ ] **Step 3: Verify the table exists and is empty**

Run (via the Supabase MCP `execute_sql` against `vjiwcreytvmxvxasyvoo`):

```sql
select count(*) as rows,
       (select count(*) from information_schema.columns
         where table_name = 'color_standards') as cols
from public.color_standards;
```

Expected: `rows` = 0, `cols` = 19.

- [ ] **Step 4: Commit**

```bash
git add db/p22-color-standards.sql
git commit -m "Colour standards: db/p22 table, applied to FRED"
```

---

### Task 4: Server actions

**Files:**
- Create: `app/actions/colorStandards.ts`

**Interfaces:**
- Consumes: `normalizeStandard`, `setApproval`, `removeApproval`, `type Approval` from `lib/colorStandards.ts`; `requireFredTeam` from `lib/access`; `activeBrand` from `lib/activeBrand`; `createClient` from `lib/supabase/server`.
- Produces: `createStandard(form: FormData)`, `updateStandard(id: string, patch: Record<string, unknown>)`, `saveApproval(id: string, materialId: string, patch: Partial<Omit<Approval,"material_id">>)`, `dropApproval(id: string, materialId: string)`, `addStandardImage(id: string, form: FormData, slot: "swatch" | "lab_dip", materialId?: string)`, `archiveStandard(id: string, archived: boolean)`, `softDeleteStandard(id: string)`. All are `"use server"` and gate on `requireFredTeam()`.

Naming note: the actions are `saveApproval`/`dropApproval` rather than `setApproval`/`removeApproval` so they do not shadow the pure lib functions they call.

- [ ] **Step 1: Write the implementation**

Create `app/actions/colorStandards.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireFredTeam } from "@/lib/access";
import { activeBrand } from "@/lib/activeBrand";
import {
  normalizeStandard,
  setApproval,
  removeApproval,
  type Approval,
  type ColorStandard,
} from "@/lib/colorStandards";

// Every write to a colour standard goes through here, matching
// app/actions/materialOrders.ts: gate, read the row, apply a pure
// lib/colorStandards.ts helper, write the whole approvals list back. Nothing
// hard-deletes. The gate is requireFredTeam because standards are FRED-only and
// a server action stays callable on SSYNC even with no page there importing it.

const TABLE = "color_standards";

// The columns a form is allowed to set. Anything else in a patch is ignored, so
// a stray field cannot write to a column it has no business touching.
const FIELDS = [
  "name", "label", "kind", "pantone", "hex", "swatch_url",
  "master_location", "approved_on", "approved_by", "spec", "notes",
] as const;

function pick(patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of FIELDS) {
    if (patch[f] === undefined) continue;
    const v = String(patch[f] ?? "").trim();
    out[f] = v === "" ? null : v;
  }
  // brightener is tri-state: "yes" | "no" | anything else means not-yet-known.
  if (patch.brightener !== undefined) {
    const b = String(patch.brightener ?? "");
    out.brightener = b === "yes" ? true : b === "no" ? false : null;
  }
  return out;
}

async function readStandard(id: string): Promise<ColorStandard | null> {
  const supabase = await createClient();
  const { data } = await supabase.from(TABLE).select("*").eq("id", id).maybeSingle();
  return normalizeStandard(data);
}

async function writeApprovals(id: string, approvals: Approval[]) {
  const supabase = await createClient();
  await supabase
    .from(TABLE)
    .update({ approvals, updated_at: new Date().toISOString() })
    .eq("id", id);
  revalidatePath("/color-standards");
  revalidatePath(`/color-standards/${id}`);
  revalidatePath("/materials");
}

export async function createStandard(form: FormData) {
  const user = await requireFredTeam();
  const name = ((form.get("name") as string) || "").trim();
  if (!name) return;
  const patch: Record<string, unknown> = { name };
  for (const f of FIELDS) {
    const v = form.get(f);
    if (v !== null) patch[f] = v;
  }
  const b = form.get("brightener");
  if (b !== null) patch.brightener = b;

  const supabase = await createClient();
  const brand = await activeBrand();
  const { data } = await supabase
    .from(TABLE)
    .insert({ ...pick(patch), name, brand, created_by: user?.email ?? null })
    .select("id")
    .single();
  revalidatePath("/color-standards");
  if (data?.id) redirect(`/color-standards/${data.id}`);
}

export async function updateStandard(id: string, patch: Record<string, unknown>) {
  await requireFredTeam();
  const supabase = await createClient();
  await supabase
    .from(TABLE)
    .update({ ...pick(patch), updated_at: new Date().toISOString() })
    .eq("id", id);
  revalidatePath("/color-standards");
  revalidatePath(`/color-standards/${id}`);
  revalidatePath("/materials");
}

// Add or patch one material's approval against this standard. Named saveApproval
// so it does not shadow the pure setApproval it calls.
export async function saveApproval(
  id: string,
  materialId: string,
  patch: Partial<Omit<Approval, "material_id">>,
) {
  await requireFredTeam();
  const s = await readStandard(id);
  if (!s) return;
  await writeApprovals(id, setApproval(s, materialId, patch));
}

export async function dropApproval(id: string, materialId: string) {
  await requireFredTeam();
  const s = await readStandard(id);
  if (!s) return;
  await writeApprovals(id, removeApproval(s, materialId));
}

// The swatch photo of the physical master, and a lab dip against it. Both go to
// the existing `references` storage bucket, as materials' images do — a second
// bucket would need its own policies for no gain.
export async function addStandardImage(
  id: string,
  form: FormData,
  slot: "swatch" | "lab_dip",
  materialId?: string,
) {
  await requireFredTeam();
  const file = form.get("file") as File | null;
  if (!file || !file.size) return;
  const supabase = await createClient();
  const path = `color-standards/${id}/${slot}-${Date.now()}-${file.name}`;
  const { error } = await supabase.storage.from("references").upload(path, file, { upsert: true });
  if (error) return;
  const { data: pub } = supabase.storage.from("references").getPublicUrl(path);
  const url = pub?.publicUrl;
  if (!url) return;

  if (slot === "swatch") {
    await supabase
      .from(TABLE)
      .update({ swatch_url: url, updated_at: new Date().toISOString() })
      .eq("id", id);
    revalidatePath("/color-standards");
    revalidatePath(`/color-standards/${id}`);
    revalidatePath("/materials");
    return;
  }
  // A lab dip belongs to one material's approval, not to the standard.
  if (!materialId) return;
  const std = await readStandard(id);
  if (!std) return;
  await writeApprovals(id, setApproval(std, materialId, { lab_dip_url: url }));
}

export async function archiveStandard(id: string, archived: boolean) {
  await requireFredTeam();
  const supabase = await createClient();
  await supabase
    .from(TABLE)
    .update({ archived, updated_at: new Date().toISOString() })
    .eq("id", id);
  revalidatePath("/color-standards");
}

export async function softDeleteStandard(id: string) {
  await requireFredTeam();
  const supabase = await createClient();
  await supabase
    .from(TABLE)
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  revalidatePath("/color-standards");
  redirect("/color-standards");
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. If `requireFredTeam` is reported as not exported, check its name in `lib/access.ts` — `app/actions/materialOrders.ts:6` imports it and is the reference.

- [ ] **Step 3: Confirm the lib suite still passes**

Run: `npm test 2>&1 | tail -5`
Expected: PASS — the actions are not unit-tested (they are I/O), but the lib helpers they call are.

- [ ] **Step 4: Commit**

```bash
git add app/actions/colorStandards.ts
git commit -m "Colour standards: server actions, FRED-gated"
```

---

### Task 5: The `/color-standards` page and Nav

**Files:**
- Create: `app/(app)/color-standards/page.tsx`
- Create: `app/(app)/color-standards/StandardsClient.tsx`
- Create: `app/(app)/color-standards/[id]/page.tsx`
- Create: `app/(app)/color-standards/[id]/StandardClient.tsx`
- Modify: `app/(app)/Nav.tsx:148` (the `FRED_ONLY` set) and the Sourcing group at `app/(app)/Nav.tsx:110-121`

**Interfaces:**
- Consumes: everything exported from `lib/colorStandards.ts`; the actions from Task 4; `Material` and `specLine` from `lib/materials.ts` for the approval rows.
- Produces: the routes `/color-standards` and `/color-standards/[id]`.

Read `app/(app)/material-orders/page.tsx` and `app/(app)/material-orders/[id]/OrderClient.tsx` first and follow them closely — this page is the same shape (FRED-gated index, detail with an editable list of material lines) and should not invent new patterns.

- [ ] **Step 1: Write the index page**

Create `app/(app)/color-standards/page.tsx`. It must:

```tsx
export const dynamic = "force-dynamic";

export default async function ColorStandardsPage() {
  if (APP.id !== "fred") notFound();
  await requireTeam();
  const brand = await activeBrand();
  const supabase = await createClient();

  // select("*") tolerates the color_standards table not existing yet — data
  // comes back null, the list is empty, nothing errors. Same graceful path
  // material-orders takes.
  const { data } = await supabase
    .from("color_standards")
    .select("*")
    .eq("brand", brand)
    .is("deleted_at", null)
    .order("name");
  const standards = normalizeStandards(data);

  // The materials the approvals point at, for names and for the live-id set
  // rollup() uses to skip soft-deleted ones.
  const { data: mats } = await supabase
    .from("materials")
    .select("id,name,kind,color,supplier")
    .eq("brand", brand)
    .is("deleted_at", null);
  const materials = Array.isArray(mats) ? mats : [];

  return <StandardsClient standards={standards} materials={materials} />;
}
```

- [ ] **Step 2: Write the index client**

Create `app/(app)/color-standards/StandardsClient.tsx` (`"use client"`). It renders:

- a header row `Colour Standards` with an `+ ADD STANDARD` button, matching the `Materials` header in `app/(app)/materials/MaterialsClient.tsx`
- one card per standard: the swatch (`swatch_url` image, else a chip filled with `hex`, else an empty outline), `name`, `specLine(s)` beneath, and the rollup as `"{approved} approved · {pending} pending"` built from `rollup(s, liveIds)` where `liveIds = new Set(materials.map(m => m.id))`
- archived standards hidden unless an `Archived` toggle is on, matching the materials library bar

The swatch and rollup, concretely:

```tsx
const liveIds = new Set(materials.map((m) => m.id));

function swatchChip(s: ColorStandard) {
  if (s.swatch_url) return <img className="cs-swatch" src={s.swatch_url} alt="" />;
  if (s.hex) return <span className="cs-swatch" style={{ background: s.hex }} />;
  return <span className="cs-swatch cs-swatch-empty" />;
}

function rollupLabel(s: ColorStandard) {
  const r = rollup(s, liveIds);
  if (!r.total) return "No materials linked";
  const parts = [`${r.approved} approved`, `${r.pending} pending`];
  if (r.rejected) parts.push(`${r.rejected} rejected`);
  return parts.join(" · ");
}
```
- the add-modal posting to `createStandard` with fields: name, label, kind (White/Colour segmented), pantone, hex, master_location, approved_on, approved_by, brightener (Yes/No/Unknown), spec, notes

- [ ] **Step 3: Write the detail page and client**

Create `app/(app)/color-standards/[id]/page.tsx` — same guards, loads the one standard plus every material in the brand (for the picker), and passes both to `StandardClient.tsx`.

`StandardClient.tsx` renders two halves:

1. **The master** — swatch, name, spec line, and an inline edit form over the same fields as the add-modal, calling `updateStandard(id, patch)`. `master_location` is labelled "Where the physical standard lives" so it reads as an instruction, not a database field.
2. **The approvals table** — one row per entry in `standard.approvals` whose `material_id` resolves in the materials list (unresolved entries are skipped, per `rollup`'s rule). Each row shows the material's name and its spec line. **Both `lib/materials.ts` and `lib/colorStandards.ts` export a `specLine`** — import the material one aliased so they cannot collide:

```tsx
import { specLine as materialSpecLine } from "@/lib/materials";
import { specLine, rollup, statusLabel, approvalFor } from "@/lib/colorStandards";
```

Then `materialSpecLine(material)` for the row, plus editable `status` (segmented Pending/Approved/Rejected), `judged_on` (date), `judged_by`, `light` (free text with a datalist of Daylight / Warm indoor / D65 / TL84), and `note` — each calling `saveApproval(id, materialId, patch)` on change. A two-click remove calls `dropApproval`. Below the table, an "Add material" picker over the brand's materials that are not already linked, calling `saveApproval(id, materialId, {})`.

- [ ] **Step 4: Wire the Nav**

In `app/(app)/Nav.tsx`, add to the Sourcing group's `links` array, after Materials and before Orders:

```tsx
      // The approved physical colour references materials are matched to (Tess,
      // 2026-08-23: "can you create a color standard that lives in the tool for
      // fred?"). FRED-only, like Orders.
      { href: "/color-standards", label: "Colour Standards" },
```

and add the route to the FRED_ONLY set:

```tsx
  const FRED_ONLY = new Set(["/photographers", "/material-orders", "/color-standards"]);
```

- [ ] **Step 5: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: both clean.

- [ ] **Step 6: Confirm the tests still pass**

Run: `npm test 2>&1 | tail -5`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/\(app\)/color-standards app/\(app\)/Nav.tsx
git commit -m "Colour standards: page, detail with approvals, nav"
```

---

### Task 6: Show the standard on the materials library

**Files:**
- Modify: `app/(app)/materials/page.tsx`
- Modify: `app/(app)/materials/MaterialsClient.tsx`

**Interfaces:**
- Consumes: `normalizeStandards`, `standardForMaterial`, `approvalFor`, `statusLabel` from `lib/colorStandards.ts`; the `saveApproval`/`dropApproval` actions from Task 4.
- Produces: no new exports — this is the consumer side.

- [ ] **Step 1: Load the standards in the page**

In `app/(app)/materials/page.tsx`, alongside the existing `openOrders` query, add:

```tsx
  // Colour standards are FRED-only; on SSYNC the query returns null and the
  // chip simply never renders.
  const { data: stds } = await supabase
    .from("color_standards")
    .select("*")
    .eq("brand", brand)
    .is("deleted_at", null);
  const standards = normalizeStandards(stds);
```

and pass `standards={standards}` into `MaterialsClient`.

- [ ] **Step 2: Show the chip and the filter**

In `MaterialsClient.tsx`:

- accept `standards: ColorStandard[]` (default `[]`) in the props type
- build `const stdFor = (id: string) => standardForMaterial(standards, id)` once
- in both `swatchCard` and `swatchRow`, render the standard as an inline `.mat-ibadge` chip beside the name — the same chip the sourcing (Custom/Stock) label uses, so nothing new goes onto the image. Label it `{standard.name}` and, when the approval is not `pending`, append `· {statusLabel(approval.status)}`
- add a **Standard** filter to the bar, built from `standards.map(s => s.name)` plus a `No standard` option, using the existing `MultiSelect` the Garment-type and Product filters use
- when `standards.length === 0`, render neither the chip nor the filter, so SSYNC is untouched

The chip and the filter predicate, concretely:

```tsx
// Beside the name, never on the image — the thumbnail is already carrying the
// sourcing chip and the in-production badge.
function standardChip(materialId: string) {
  const s = standardForMaterial(standards, materialId);
  if (!s) return null;
  const a = approvalFor(s, materialId);
  const suffix = a && a.status !== "pending" ? ` · ${statusLabel(a.status)}` : "";
  return <span className="mat-ibadge">{s.name}{suffix}</span>;
}

const NO_STANDARD = "No standard";

// Selected is the set of names ticked in the Standard MultiSelect; empty = no
// filtering, matching how the other filters in this bar behave.
function matchesStandard(materialId: string, selected: Set<string>) {
  if (!selected.size) return true;
  const s = standardForMaterial(standards, materialId);
  return selected.has(s ? s.name : NO_STANDARD);
}
```

- [ ] **Step 3: Add the picker to the material detail**

In the material detail view, add a `Colour standard` row showing the current standard (or `—`) and a select of every standard. Choosing one calls `saveApproval(standardId, materialId, {})`; choosing the blank option calls `dropApproval(currentStandardId, materialId)`. Moving a material between standards is a `dropApproval` on the old followed by a `saveApproval` on the new.

- [ ] **Step 4: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: both clean.

- [ ] **Step 5: Confirm the tests still pass**

Run: `npm test 2>&1 | tail -5`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/\(app\)/materials
git commit -m "Materials: show and filter by colour standard"
```

---

### Task 7: Seed Standards A, B and C, and trim the notes

**Files:** none — this is a data step against the FRED database, run with the Supabase MCP `apply_migration` tool (`execute_sql` is read-only on this connection).

**Interfaces:**
- Consumes: the table from Task 3 and the approvals shape from Task 1.

The material ids are current as of 2026-08-23. Re-read them before writing rather than trusting this list, since the library is edited in the app between sessions:

```sql
select id, name, color from public.materials
where deleted_at is null and (kind = 'fabric' or name ilike '%elastic%')
order by kind, name;
```

Known ids at time of writing: Heavy Cotton Rib w Stretch `4edc0b63-6905-4a6b-91ad-268f58eec760`, Cotton Rib v1 `724cd743-463d-4401-9697-b644e62e5c8f`, Cotton Rib v2 `3e0e6b57-725b-49ce-936b-7f2c21091638`, Cotton Rib 155 `72f60c49-03c6-4205-85f4-6a1e35c840c3`, Double Jersey `8f5faa42-df26-41ce-a840-df5def4057f2`, Poplin `34e16ed9-4828-4915-b6a0-8d1605d19ce5`, New Oxford `515ad5c1-28ad-4662-8750-ba72c65be007`, Elastic Waistband `e35c9531-b587-4458-b130-0cf3d75c50ca` and `d88462fe-e025-4ab3-841d-3b21678cf1d3`.

- [ ] **Step 1: Insert the three standards with their approvals**

Every approval is `pending` — nothing has physically been approved yet, and seeding them as `approved` would be a lie the tool then repeats.

```sql
insert into public.color_standards (brand, name, label, kind, brightener, master_location, spec, approvals)
values
  ('fred', 'Standard A', 'Cold / optic', 'white', true,
   'NOT YET HELD - no physical master signed',
   'Optic white. Referenced to the existing cold elastic waistband, which is locked for this round, so the ELASTIC is the reference and the fabrics match it. Reverses next round when the tape is re-run less blue.',
   '[{"material_id":"4edc0b63-6905-4a6b-91ad-268f58eec760","status":"pending"},
     {"material_id":"724cd743-463d-4401-9697-b644e62e5c8f","status":"pending"},
     {"material_id":"3e0e6b57-725b-49ce-936b-7f2c21091638","status":"pending"},
     {"material_id":"8f5faa42-df26-41ce-a840-df5def4057f2","status":"pending"},
     {"material_id":"34e16ed9-4828-4915-b6a0-8d1605d19ce5","status":"pending"},
     {"material_id":"e35c9531-b587-4458-b130-0cf3d75c50ca","status":"pending"},
     {"material_id":"d88462fe-e025-4ab3-841d-3b21678cf1d3","status":"pending"}]'::jsonb),
  ('fred', 'Standard B', 'Soft / warm', 'white', false,
   'NOT YET HELD - no physical master signed',
   'Tee and socks. A deliberate contrast, not a failed match. Must be specified as a BLEACHED, brightener-free white toned to an approved standard - raw natural cotton shifts delivery to delivery and will not repeat. Approve against the Oxford 009 (Standard C), not only against the optic underwear.',
   '[{"material_id":"72f60c49-03c6-4205-85f4-6a1e35c840c3","status":"pending"}]'::jsonb),
  ('fred', 'Standard C', 'Neutral, leans cool', 'white', null,
   'NOT YET HELD - pull a current Sidogras 009 swatch',
   'The Oxford. Inherited rather than specified: Sidogras 009 accepted as it comes, which makes it the fixed point the other two are judged against.',
   '[{"material_id":"515ad5c1-28ad-4662-8750-ba72c65be007","status":"pending"}]'::jsonb);
```

- [ ] **Step 2: Verify the seed**

```sql
select name, label, jsonb_array_length(approvals) as linked from public.color_standards
where deleted_at is null order by name;
```

Expected: Standard A / 7, Standard B / 1, Standard C / 1.

- [ ] **Step 3: Cut the notes down to a pointer**

The `WHITE STANDARD` block currently in `materials.notes` is now duplicated by the standard record. Replace it with a pointer, keeping each material's own original notes (duties, contacts, "next order" lines) untouched. `split_part` on the block's heading is how the earlier passes did this:

```sql
update public.materials
set notes = rtrim(split_part(coalesce(notes, ''), E'\n\nWHITE STANDARD - decided 2026-08-23. THREE whites:', 1))
  || E'\n\nColour standard: see Sourcing > Colour Standards. This material is linked to its standard there, with its own approval state.'
where deleted_at is null
  and notes like '%WHITE STANDARD - decided 2026-08-23. THREE whites:%';
```

- [ ] **Step 4: Verify nothing was lost**

```sql
select name,
       (notes like '%THREE whites%') as block_gone_should_be_false,
       (notes like '%Colour standard: see Sourcing%') as pointer_added,
       (notes like '%Duties%' or notes like '%Next order%' or notes like '%Original fabric%') as own_notes_kept
from public.materials
where deleted_at is null and notes like '%Colour standard: see Sourcing%'
order by kind, name;
```

Expected: `block_gone_should_be_false` false for every row, `pointer_added` true for all nine, `own_notes_kept` true for the rows that had duties or "next order" lines before (all except the two Sidogras rows, which keep their contact lines and should also read true).

- [ ] **Step 5: Record the work**

Append an entry to `/Users/tess/.claude/projects/-Users-tess/memory/WORK-MAP.md` under the marker, per the maintain-work-map rule, and update `fred-materials-library.md` with the new module. Do not restate the spec — link to it.

- [ ] **Step 6: Commit**

There are no file changes in this task; the deliverable is data. Confirm the tree is clean:

```bash
git status --short
```

---

## Verification

After Task 7, the whole feature is verified by:

```bash
npm test && npx tsc --noEmit && npm run build
```

Render testing needs auth and the FRED database, so it cannot be done locally — the same limitation the materials library shipped under. Tess pushes; both Vercel projects build from the one branch, and SSYNC must be checked to confirm the Sourcing menu still shows only Materials there.

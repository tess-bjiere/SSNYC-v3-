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
// Pure like the rest of lib/. Imports nothing at runtime — a unit-tested lib
// module runs under `node --experimental-strip-types` with no build step.
// `normalizeHex` is inlined rather than imported, kept byte-identical to
// lib/palette.ts's version so the two cannot drift apart in behaviour.

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

// Inlined rather than imported from ./palette.ts, which exports the same
// function. A unit-tested lib module imports nothing at runtime — the test runs
// under `node --experimental-strip-types` with no build step, and a value import
// would need either a `.ts` specifier (TS5097) or an extensionless one node
// cannot resolve. Kept byte-identical to palette.ts's so the two cannot drift
// apart in behaviour.
function normalizeHex(input: unknown): string {
  if (typeof input !== "string") return "";
  let s = input.trim().toLowerCase();
  if (s.startsWith("#")) s = s.slice(1);
  if (/^[0-9a-f]{3}$/.test(s)) s = s.split("").map((c) => c + c).join("");
  if (/^[0-9a-f]{6}$/.test(s)) return "#" + s;
  return "";
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

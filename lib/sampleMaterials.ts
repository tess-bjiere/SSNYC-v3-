// The link between a sample round and the fabric & trim library.
//
// style_samples.material_ids is a jsonb array of materials.id. It arrives from
// Postgres as unknown, and from a form as repeated fields, so both doors go
// through here and neither trusts what it was handed.
//
// Pure and dependency-free, like the rest of lib/: no Supabase, no React.

/** Normalise whatever the column holds into a clean, ordered, unique id list.
 *
 * Tolerates the three shapes the column can legitimately be in — an array, a
 * jsonb string that was never parsed, and null on a row written before the
 * column existed — and drops anything else on the floor rather than throwing.
 * A malformed cell should cost a round its links, not its whole page. */
export function normalizeMaterialIds(raw: unknown): string[] {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const id = entry.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Read the picker's repeated `material_ids` fields off a submitted form.
 *
 * Kept separate from normalizeMaterialIds so the form path cannot accidentally
 * inherit the JSON-string tolerance the database path needs. */
export function readMaterialIds(values: readonly unknown[]): string[] {
  return normalizeMaterialIds(values.map((v) => (typeof v === "string" ? v : "")));
}

/** A material as the round needs to display it — the few fields worth showing
 * on a sample profile, not the whole library row. */
export type LinkedMaterial = {
  id: string;
  name: string;
  kind: string;
  supplier: string | null;
  composition: string | null;
  color: string | null;
  color_hex: string | null;
  deleted: boolean;
};

/** Resolve ids against the library, in the order the round lists them.
 *
 * Ids with no match are dropped — a material can be hard-deleted by someone
 * with SQL access even though the app only ever soft-deletes, and a round
 * pointing at a row that is genuinely gone should render as if unlinked rather
 * than as a broken chip. Soft-deleted materials DO resolve, flagged, because
 * the round was really made in them and that history is worth keeping. */
export function resolveMaterials(
  ids: readonly string[],
  library: readonly LinkedMaterial[],
): LinkedMaterial[] {
  const byId = new Map(library.map((m) => [m.id, m]));
  const out: LinkedMaterial[] = [];
  for (const id of ids) {
    const found = byId.get(id);
    if (found) out.push(found);
  }
  return out;
}

/** Split resolved materials the way the library does, so a round shows its
 * fabric before its trims regardless of the order they were picked in. */
export function splitByKind(materials: readonly LinkedMaterial[]): {
  fabrics: LinkedMaterial[];
  trims: LinkedMaterial[];
} {
  const fabrics: LinkedMaterial[] = [];
  const trims: LinkedMaterial[] = [];
  for (const m of materials) (m.kind === "trim" ? trims : fabrics).push(m);
  return { fabrics, trims };
}

"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { resolveMaterials, type LinkedMaterial } from "@/lib/sampleMaterials";
import { setStyleMaterials } from "@/app/actions/styles";

// The materials a style is made in, linked from the library (Tess, 2026-08-19:
// "add fabric and trims from library to a style in development or production").
//
// This is the style-level sibling of the round's material picker: a round records
// what one sample was sewn in (style_samples.material_ids); this records what the
// STYLE is made in (styles.material_ids), independent of any one round. Same
// library, same chips, so a fabric reads the same everywhere.
//
// The client owns the full id list and writes the whole thing on every add or
// remove — the same shape setStyleMaterials expects — so there is no per-link
// round trip to keep in sync, only a refresh to re-render the server strip.

const KINDS: { key: string; label: string }[] = [
  { key: "fabric", label: "Fabrics" },
  { key: "trim", label: "Trims" },
  { key: "packaging", label: "Packaging" },
];
function kindOf(m: LinkedMaterial): string {
  return m.kind === "trim" ? "trim" : m.kind === "packaging" ? "packaging" : "fabric";
}

function Chip({ m }: { m: LinkedMaterial }) {
  const under = [m.composition, m.supplier].filter(Boolean).join(" · ");
  return (
    <span className={`sr-mat${m.deleted ? " is-retired" : ""}`}>
      {m.color_hex ? <i className="sr-mat-dot" style={{ background: m.color_hex }} aria-hidden="true" /> : null}
      <span className="sr-mat-name">{m.name}</span>
      {under ? <span className="sr-mat-sub">{under}</span> : null}
      {m.deleted ? <span className="sr-mat-flag">retired</span> : null}
    </span>
  );
}

export default function StyleMaterials({
  styleId,
  library,
  linked,
}: {
  styleId: string;
  /** The whole material library, already loaded by the page. */
  library: LinkedMaterial[];
  /** Ids already on this style. */
  linked: string[];
}) {
  const router = useRouter();
  const [ids, setIds] = useState<string[]>(linked);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();

  const chosen = useMemo(() => resolveMaterials(ids, library), [ids, library]);

  function commit(next: string[]) {
    setIds(next);
    start(async () => {
      await setStyleMaterials(styleId, next);
      router.refresh();
    });
  }
  const add = (id: string) => !ids.includes(id) && commit([...ids, id]);
  const remove = (id: string) => commit(ids.filter((x) => x !== id));

  // What can still be added — live materials not already linked, matched on the
  // same words the library search reads.
  const query = q.trim().toLowerCase();
  const offer = useMemo(
    () =>
      library.filter(
        (m) =>
          !m.deleted &&
          !ids.includes(m.id) &&
          (!query ||
            `${m.name} ${m.composition ?? ""} ${m.supplier ?? ""} ${m.color ?? ""}`
              .toLowerCase()
              .includes(query)),
      ),
    [library, ids, query],
  );

  return (
    <div className="stmat">
      {chosen.length > 0 ? (
        <div className="stmat-chips">
          {chosen.map((m) => (
            <span className="stmat-chiprow" key={m.id}>
              {/* Click a linked material to open it in the library (Tess,
                  2026-08-20: "you should be able to click into the material and
                  trims list"). A retired material has no live page to open, so it
                  stays plain text. */}
              {m.deleted ? (
                <Chip m={m} />
              ) : (
                <Link
                  href={`/materials?m=${m.id}`}
                  className="stmat-chiplink"
                  title="Open in the materials library"
                >
                  <Chip m={m} />
                </Link>
              )}
              <button
                type="button"
                className="stmat-x"
                title="Remove from this style"
                aria-label="Remove"
                disabled={pending}
                onClick={() => remove(m.id)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : (
        <div style={{ color: "var(--muted)", fontSize: 13 }}>
          Nothing linked yet. Add the fabrics, trims or packaging this style is made in.
        </div>
      )}

      {open ? (
        <div className="stmat-picker">
          <div className="stmat-pickhead">
            <input
              className="input"
              value={q}
              autoFocus
              placeholder="Search the library — name, composition, supplier, colour"
              onChange={(e) => setQ(e.target.value)}
            />
            <button className="btn link" type="button" onClick={() => setOpen(false)}>
              Done
            </button>
          </div>
          {offer.length === 0 ? (
            <div className="linkref-msg">
              {query ? "Nothing in the library matches that." : "Everything in the library is already on this style."}
            </div>
          ) : (
            KINDS.map(({ key, label }) => {
              const items = offer.filter((m) => kindOf(m) === key);
              if (items.length === 0) return null;
              return (
                <div className="stmat-group" key={key}>
                  <div className="stmat-grouplabel">{label}</div>
                  <div className="stmat-offerlist">
                    {items.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className="stmat-offer"
                        disabled={pending}
                        onClick={() => add(m.id)}
                      >
                        <Chip m={m} />
                        <span className="stmat-add">+ Add</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        <button className="btn link" type="button" style={{ marginTop: 12 }} onClick={() => setOpen(true)}>
          Add materials from library
        </button>
      )}
    </div>
  );
}

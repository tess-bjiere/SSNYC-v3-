"use client";

// The reference detail card. Shared by the Library grid and the Moodboard, so a
// reference reads the same wherever you click it.
//
// `actions` controls which buttons appear:
//   "library"   — Edit / Share / Develop this / Add to moodboard / Delete
//   "editorial" — Edit / Share / Delete. Same as the library minus the moodboard
//                 and develop buttons: editorial images are credits, not the
//                 product references a style gets made from.
//   "board"     — Edit / Share / Develop this. No Delete from a moodboard:
//                 deleting there would remove the reference from the whole
//                 library, which is not what clicking an image on a board
//                 should ever do.
//   "read-only" — no actions at all.

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { refImage, extraImageUrls, type Reference } from "@/lib/types";
import { updateReference, softDeleteReference } from "@/app/actions/references";
import {
  developFromReference,
  linkReference,
  searchStyles,
  stylesForReference,
  unlinkReference,
  type LinkedStyle,
} from "@/app/actions/styleRefs";

// Editable fields for the in-place Edit form (label + input type).
const EDIT_FIELDS: { key: keyof Reference; label: string; type?: "text" | "textarea" }[] = [
  { key: "designer", label: "Designer" },
  { key: "year", label: "Year" },
  { key: "season", label: "Season" },
  { key: "category", label: "Category" },
  { key: "garment", label: "Garment" },
  { key: "fabric", label: "Fabric" },
  { key: "color", label: "Color" },
  { key: "color_hex", label: "Color hex" },
  { key: "price", label: "Price point" },
  { key: "photographer", label: "Photographer" },
  { key: "photographer_ig", label: "Photographer IG" },
  { key: "model", label: "Model" },
  { key: "location", label: "Location" },
  { key: "link", label: "Product link" },
  { key: "notes", label: "Notes", type: "textarea" },
];

export type DetailActions = "library" | "editorial" | "board" | "read-only";

export default function DetailModal({
  r,
  onClose,
  onAdd,
  onToast,
  onDeleted,
  actions = "library",
}: {
  r: Reference;
  onClose: () => void;
  onAdd?: () => void;
  onToast: (m: string) => void;
  onDeleted?: () => void;
  actions?: DetailActions;
}) {
  const router = useRouter();
  const [cur, setCur] = useState<Reference>(r);
  const [editing, setEditing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  const images = [refImage(cur), ...extraImageUrls(cur)].filter(Boolean);
  const [active, setActive] = useState(images[0] || "");

  // --- Develop this ------------------------------------------------------
  // A reference can be developed from the library and from a board — both are
  // places where you are looking at a product reference and deciding to make it.
  // Editorial credits and read-only views are not.
  const canDevelop = actions === "library" || actions === "board";

  const [links, setLinks] = useState<LinkedStyle[] | null>(null);
  const [devOpen, setDevOpen] = useState(false);
  const [devBusy, setDevBusy] = useState(false);
  const [pickQ, setPickQ] = useState("");
  const [picks, setPicks] = useState<LinkedStyle[]>([]);
  const [armedUnlink, setArmedUnlink] = useState<string | null>(null);

  // Loaded once when the card opens, so "In development" shows without a click.
  // One small query, and only on the surfaces that can develop.
  useEffect(() => {
    if (!canDevelop) return;
    let live = true;
    stylesForReference(cur.id)
      .then((s) => live && setLinks(s))
      .catch(() => live && setLinks([]));
    return () => {
      live = false;
    };
  }, [canDevelop, cur.id]);

  // The picker's list, refreshed as you type. Styles already linked are filtered
  // out rather than shown and rejected.
  useEffect(() => {
    if (!devOpen) return;
    let live = true;
    const t = setTimeout(() => {
      searchStyles(pickQ)
        .then((s) => live && setPicks(s))
        .catch(() => live && setPicks([]));
    }, 150);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [devOpen, pickQ]);

  const linkedIds = new Set((links ?? []).map((s) => s.id));

  function develop() {
    setDevBusy(true);
    start(async () => {
      const res = await developFromReference(cur.id);
      setDevBusy(false);
      if (res.id) {
        onToast("Style created");
        router.push(`/styles/${res.id}`);
        return;
      }
      onToast(res.error || "Could not create the style.");
    });
  }

  function link(styleId: string) {
    setDevBusy(true);
    start(async () => {
      const res = await linkReference(styleId, cur.id);
      setDevBusy(false);
      if (!res.ok) return onToast(res.error || "Could not link that style.");
      setLinks(res.styles ?? []);
      setPickQ("");
      onToast("Linked");
    });
  }

  function unlink(styleId: string) {
    setDevBusy(true);
    start(async () => {
      const res = await unlinkReference(styleId, cur.id);
      setDevBusy(false);
      setArmedUnlink(null);
      if (!res.ok) return onToast(res.error || "Could not unlink that style.");
      setLinks(res.styles ?? []);
      onToast("Unlinked — the reference is untouched");
    });
  }

  function beginEdit() {
    const d: Record<string, string> = {};
    for (const f of EDIT_FIELDS) d[f.key] = (cur[f.key] as string) || "";
    setDraft(d);
    setConfirmDel(false);
    setEditing(true);
  }

  function save() {
    start(async () => {
      await updateReference(cur.id, draft);
      setCur((c) => ({ ...c, ...(draft as Partial<Reference>) }));
      setEditing(false);
      onToast("Saved");
    });
  }

  function share() {
    const url = `${window.location.origin}/r/${cur.id}`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(() => onToast("Link copied")).catch(() => onToast(url));
    } else {
      onToast(url);
    }
  }

  function del() {
    start(async () => {
      await softDeleteReference(cur.id);
      onDeleted?.();
    });
  }

  const rows: [string, React.ReactNode][] = [
    ["Year", cur.year],
    ["Season", cur.season],
    ["Category", cur.category],
    ["Garment", cur.garment],
    ["Fabric", cur.fabric],
    ["Color", cur.color ? (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
        {cur.color_hex && (
          <span style={{ width: 16, height: 16, background: cur.color_hex, border: "1px solid var(--line)", display: "inline-block" }} />
        )}
        {cur.color}
      </span>
    ) : null],
    ["Price point", cur.price],
    ["Photographer", [cur.photographer, cur.photographer_ig].filter(Boolean).join(" · ")],
    ["Model", cur.model],
    ["Location", cur.location],
    ["Notes", cur.notes],
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="detail-grid">
          <div className="detail-imgs">
            <div className="detail-main">{active ? <img src={active} alt={cur.designer || ""} /> : null}</div>
            {images.length > 1 && (
              <div className="detail-thumbs">
                {images.map((im, i) => (
                  <button key={i} className={"detail-thumb" + (im === active ? " active" : "")} onClick={() => setActive(im)}>
                    <img src={im} alt="" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="detail-info">
            <button className="detail-x" onClick={onClose} aria-label="Close">×</button>

            {editing ? (
              <>
                <div className="detail-head">
                  <h2 className="display">Edit reference</h2>
                </div>
                <div className="detail-edit">
                  {EDIT_FIELDS.map((f) => (
                    <div className="field" key={f.key}>
                      <label>{f.label}</label>
                      {f.type === "textarea" ? (
                        <textarea
                          className="textarea"
                          rows={3}
                          value={draft[f.key] ?? ""}
                          onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                        />
                      ) : (
                        <input
                          className="input"
                          value={draft[f.key] ?? ""}
                          onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                        />
                      )}
                    </div>
                  ))}
                </div>
                <div className="detail-actions">
                  <button className="btn" disabled={pending} onClick={save}>{pending ? "Saving…" : "Save"}</button>
                  <button className="btn link" disabled={pending} onClick={() => setEditing(false)}>Cancel</button>
                </div>
              </>
            ) : (
              <>
                <div className="detail-head">
                  <h2 className="display">{cur.designer || "Reference"}</h2>
                  {cur.year && <div className="yr">{cur.year}</div>}
                </div>

                {links && links.length > 0 && (
                  <div className="dev-links">
                    <span className="k">In development</span>
                    <span className="v">
                      {links.map((s) => (
                        <Link key={s.id} href={`/styles/${s.id}`} className="dev-link">
                          {s.name}
                          {s.style_no ? ` · ${s.style_no}` : ""}
                        </Link>
                      ))}
                    </span>
                  </div>
                )}

                <div className="detail-rows">
                  {rows.map(([k, v]) =>
                    v ? (
                      <div className="detail-row" key={k}>
                        <span className="k">{k}</span>
                        <span className="v">{v}</span>
                      </div>
                    ) : null
                  )}
                </div>

                {actions !== "read-only" && (
                  <div className="detail-actions">
                    <button className="btn ghost" onClick={beginEdit}>Edit</button>
                    {canDevelop && (
                      <button
                        className={"btn" + (devOpen ? "" : " ghost")}
                        onClick={() => { setDevOpen((o) => !o); setConfirmDel(false); }}
                      >
                        {links && links.length > 0 ? "Development" : "Develop this"}
                      </button>
                    )}
                    {actions === "library" && (
                      <button className="btn" onClick={onAdd}>Add to moodboard</button>
                    )}
                  </div>
                )}

                {devOpen && (
                  <div className="dev-panel">
                    {links === null ? (
                      <div className="dev-empty">Loading…</div>
                    ) : links.length === 0 ? (
                      <div className="dev-empty">
                        Not being developed yet. Start a style from this reference, or link it to one
                        that already exists.
                      </div>
                    ) : (
                      <div className="dev-list">
                        {links.map((s) => {
                          const isArmed = armedUnlink === s.id;
                          return (
                            <div className="dev-row" key={s.id}>
                              <Link href={`/styles/${s.id}`} className="dev-row-name">
                                {s.name}
                              </Link>
                              <span className={"badge " + (s.status === "development" ? "dev" : s.status === "production" ? "prod" : s.status)}>
                                {s.status}
                              </span>
                              <div className="spacer" />
                              <button
                                className={"btn ghost sm" + (isArmed ? " danger" : "")}
                                disabled={devBusy}
                                onClick={() => (isArmed ? unlink(s.id) : setArmedUnlink(s.id))}
                                onBlur={() => setArmedUnlink((a) => (a === s.id ? null : a))}
                                title={isArmed ? "Click again to unlink" : "Unlink this style"}
                              >
                                {isArmed ? "Unlink?" : "Unlink"}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <button className="btn sm dev-new" disabled={devBusy || pending} onClick={develop}>
                      {devBusy ? "Working…" : "Start a new style from this"}
                    </button>

                    <div className="dev-or">or link to an existing style</div>
                    <input
                      className="input sm"
                      placeholder="Search styles by name or number…"
                      value={pickQ}
                      autoComplete="off"
                      onChange={(e) => setPickQ(e.target.value)}
                    />
                    <div className="dev-picks">
                      {picks.filter((s) => !linkedIds.has(s.id)).length === 0 ? (
                        <div className="dev-empty">
                          {pickQ.trim() ? "No styles match that." : "No other styles yet."}
                        </div>
                      ) : (
                        picks
                          .filter((s) => !linkedIds.has(s.id))
                          .map((s) => (
                            <button
                              key={s.id}
                              className="dev-pick"
                              disabled={devBusy}
                              onClick={() => link(s.id)}
                            >
                              <span>{s.name}{s.style_no ? ` · ${s.style_no}` : ""}</span>
                              <span className="dev-pick-add">Link</span>
                            </button>
                          ))
                      )}
                    </div>
                  </div>
                )}

                {confirmDel && (
                  <div className="detail-confirm">
                    <span>Move this reference to Trash?</span>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn danger sm" disabled={pending} onClick={del}>{pending ? "…" : "Delete"}</button>
                      <button className="btn link" disabled={pending} onClick={() => setConfirmDel(false)}>Cancel</button>
                    </div>
                  </div>
                )}

                {/* The quiet footer of ways OUT of the reference, kept apart from
                    the row of boxed actions above so the bottom stops feeling
                    busy (Tess, 2026-08-11: "clean up buttons and links towards
                    the bottom so it feels less messy"). View product and Share
                    sit left (Tess, 2026-08-07: "move share down next to view
                    product"); Delete is a quiet danger link pushed to the right
                    — still one click to the confirm, but no longer a loud red
                    box orphaned on its own line among the primary actions.

                    Rendered whenever there is anything to show, so a reference
                    with no product link still has somewhere for Share and Delete
                    to live. */}
                {(cur.link || actions !== "read-only") && (
                  <div className="view-product">
                    {cur.link && (
                      <a href={cur.link} target="_blank" rel="noreferrer">View product ↗</a>
                    )}
                    {actions !== "read-only" && (
                      <button className="btn link" onClick={share}>Share</button>
                    )}
                    {(actions === "library" || actions === "editorial") && (
                      <button
                        className="btn link danger detail-del"
                        onClick={() => { setConfirmDel(true); setDevOpen(false); }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                )}

                {cur.created_by && <div className="detail-savedby">Saved by {cur.created_by}</div>}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

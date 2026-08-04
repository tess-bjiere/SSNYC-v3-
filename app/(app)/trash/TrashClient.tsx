"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { refThumb, extraImageUrls, type Reference } from "@/lib/types";
import { restoreReference, purgeReference } from "@/app/actions/references";
import DetailModal from "@/app/(app)/library/DetailModal";

function whenDeleted(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "Deleted today";
  if (days === 1) return "Deleted yesterday";
  if (days < 30) return `Deleted ${days} days ago`;
  const months = Math.round(days / 30);
  return months === 1 ? "Deleted last month" : `Deleted ${months} months ago`;
}

export default function TrashClient({
  refs,
  boardNames,
}: {
  refs: Reference[];
  boardNames: Record<string, string[]>;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<Reference | null>(null);
  // Permanent delete is two clicks and never a browser confirm(): the first
  // arms the card, the second on "Delete forever?" does it.
  const [armed, setArmed] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function flashToast(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 2400);
  }

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return refs;
    return refs.filter((r) =>
      [r.designer, r.garment, r.color, r.category, r.season, r.year, r.notes]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(s)
    );
  }, [refs, q]);

  function restore(r: Reference) {
    setArmed(null);
    setBusy(r.id);
    start(async () => {
      await restoreReference(r.id);
      setBusy(null);
      flashToast(`“${r.designer || "Reference"}” is back in the Library`);
      router.refresh();
    });
  }

  function purge(r: Reference) {
    setArmed(null);
    setBusy(r.id);
    start(async () => {
      const res = await purgeReference(r.id);
      setBusy(null);
      flashToast(res.ok ? "Deleted permanently" : res.error || "Could not delete that.");
      router.refresh();
    });
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title serif">Trash</h1>
        <span className="count">
          {list.length}
          {list.length !== refs.length ? ` / ${refs.length}` : ""}
        </span>
        <div className="spacer" />
        {refs.length > 0 && (
          <input
            className="input lib-search"
            placeholder="Search the trash…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        )}
      </div>

      <p className="trash-note">
        Deleting a reference in the Library moves it here — nothing is lost, and Restore puts it back
        exactly as it was, moodboard placements included. Deleting it from the Trash removes the
        reference and its image files for good.
      </p>

      {refs.length === 0 ? (
        <div className="empty">The Trash is empty.</div>
      ) : list.length === 0 ? (
        <div className="empty">Nothing in the Trash matches that search.</div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(190px,1fr))" }}>
          {list.map((r) => {
            const src = refThumb(r);
            const sub = [r.year && r.year !== "Unknown" ? r.year : null, r.garment, r.color]
              .filter(Boolean)
              .join(" · ");
            const extra = extraImageUrls(r).length;
            const boards = boardNames[r.id] || [];
            const working = busy === r.id && pending;
            return (
              <div
                className={"card lib-card trash-card" + (working ? " working" : "")}
                key={r.id}
                onMouseLeave={() => setArmed((a) => (a === r.id ? null : a))}
              >
                {extra > 0 && <span className="card-extra">+{extra}</span>}
                <div className="imgwrap" onClick={() => setDetail(r)}>
                  {src ? <img src={src} alt={r.designer || ""} loading="lazy" /> : null}
                </div>
                <div className="meta">
                  <div className="d">{r.designer || "Untitled"}</div>
                  {sub && <div className="s">{sub}</div>}
                  <div className="s trash-when">{whenDeleted(r.deleted_at)}</div>
                  {boards.length > 0 && (
                    <div className="s trash-boards" title={boards.join(", ")}>
                      On {boards.length} board{boards.length === 1 ? "" : "s"}
                    </div>
                  )}
                </div>
                <div className="trash-actions">
                  <button className="btn ghost sm" disabled={working} onClick={() => restore(r)}>
                    Restore
                  </button>
                  {armed === r.id ? (
                    <button className="btn danger sm" disabled={working} onClick={() => purge(r)}>
                      Delete forever?
                    </button>
                  ) : (
                    <button
                      className="btn ghost sm trash-danger"
                      disabled={working}
                      onClick={() => setArmed(r.id)}
                      title="Permanently delete this reference and its image files"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Read-only detail — a reference in the Trash is not editable until it is
          restored, so this card shows everything and offers nothing. */}
      {detail && (
        <DetailModal
          r={detail}
          actions="read-only"
          onClose={() => setDetail(null)}
          onToast={flashToast}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

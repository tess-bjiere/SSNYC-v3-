"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { readWip, readWipFromText, applyWipField, applyWipStatus, type WipView } from "@/app/actions/wip";
import { STYLE_STATUS_LABELS, type StyleStatus } from "@/lib/types";

// Pull from WIP — the sheet, beside the style, one field at a time.
//
// Tess, 2026-08-06: "Pull from WIP".
//
// The shape of this panel is the argument. It is a two-column list: what the
// style says now, and what the sheet says. Nothing is applied by opening it,
// nothing is applied by scrolling past it, and there is no button that applies
// everything. Each row has its own Use, and pressing it writes that one field.
//
// Fills and replacements are marked apart because they are different sizes of
// decision. Filling an empty fabric costs nothing and can be undone by clearing
// it. Replacing a factory somebody typed here means the sheet and the person
// disagreed and you are siding with the sheet — that is worth a second of
// looking, so the word REPLACE is there to slow you down for exactly that long.
//
// The panel is closed until asked. A style profile is already a long page and
// this is not something you consult every visit; a section that costs a fetch
// to Google should not fetch on the chance you might scroll past it.

type Applied = Record<string, string>;

export default function WipPull({ styleId, sheetName }: { styleId: string; sheetName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<WipView | null>(null);
  const [paste, setPaste] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [applied, setApplied] = useState<Applied>({});
  const [busy, start] = useTransition();

  const load = () => {
    setApplied({});
    start(async () => {
      setView(await readWip(styleId));
    });
  };

  const loadPasted = () => {
    setApplied({});
    start(async () => {
      setView(await readWipFromText(styleId, paste));
    });
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !view) load();
  };

  const use = (field: string, value: string) => {
    start(async () => {
      await applyWipField(styleId, field, value);
      setApplied((a) => ({ ...a, [field]: value }));
      router.refresh();
    });
  };

  const useStatus = (status: string) => {
    start(async () => {
      await applyWipStatus(styleId, status);
      setApplied((a) => ({ ...a, status }));
      router.refresh();
    });
  };

  const statusRow =
    view && view.found && view.status.mapped && view.status.mapped !== view.status.current
      ? view.status
      : null;

  const nothingToDo =
    view && view.ok && view.found && view.changes.length === 0 && !statusRow;

  return (
    <div className="wip">
      {/* sm on the control scale (Tess, 2026-08-07: "pull from wip button
          should be smaller"). It sits under Details as an occasional errand,
          not as the act of the page — the same weight as the other small
          controls in that column rather than the size of a primary action. */}
      <button type="button" className="btn ghost sm wip-open" onClick={toggle} aria-expanded={open}>
        {open ? "Hide WIP" : "Pull from WIP"}
      </button>

      {open && (
        <div className="wip-body">
          {busy && !view && <p className="wip-note">Reading {sheetName}…</p>}

          {view && !view.ok && (
            <>
              <p className="wip-note">{view.reason}</p>
              {/* Whatever went wrong with Drive, pasting still works. The
                  fallback is offered at the moment it is needed rather than
                  living somewhere else in the tool. */}
              {!showPaste && (
                <button type="button" className="btn link" onClick={() => setShowPaste(true)}>
                  Paste the rows instead
                </button>
              )}
            </>
          )}

          {view && view.ok && !view.found && <p className="wip-note">{view.reason}</p>}

          {nothingToDo && (
            <p className="wip-note">
              {sheetName} agrees with this style. Nothing to fill.
            </p>
          )}

          {view && view.ok && view.found && (
            <>
              <p className="wip-src">
                {view.fileName}
                {view.sheetName ? ` · ${view.sheetName}` : ""}
                {view.fetchedAt ? ` · read ${new Date(view.fetchedAt).toLocaleString()}` : ""}
              </p>

              {statusRow && (
                <div className="wip-row">
                  <span className="wip-f">Status</span>
                  <span className="wip-now">
                    {view.status.current
                      ? STYLE_STATUS_LABELS[view.status.current as StyleStatus] ?? view.status.current
                      : "—"}
                  </span>
                  <span className="wip-new">
                    {STYLE_STATUS_LABELS[statusRow.mapped as StyleStatus] ?? statusRow.mapped}
                    <em className="wip-from">sheet says “{statusRow.raw}”</em>
                  </span>
                  {applied.status ? (
                    <span className="wip-done">Set</span>
                  ) : (
                    <button
                      type="button"
                      className="btn link"
                      disabled={busy}
                      onClick={() => useStatus(statusRow.mapped)}
                    >
                      Use
                    </button>
                  )}
                </div>
              )}

              {view.changes.map((c) => (
                <div key={c.field} className="wip-row">
                  <span className="wip-f">
                    {c.label}
                    <em className={"wip-kind " + c.kind}>{c.kind === "fill" ? "fill" : "replace"}</em>
                  </span>
                  <span className="wip-now">{c.current || "—"}</span>
                  <span className="wip-new">
                    {c.value}
                    <em className="wip-from">{c.from}</em>
                  </span>
                  {applied[c.field] ? (
                    <span className="wip-done">{c.kind === "fill" ? "Filled" : "Replaced"}</span>
                  ) : (
                    <button
                      type="button"
                      className="btn link"
                      disabled={busy}
                      onClick={() => use(c.field, c.value)}
                    >
                      Use
                    </button>
                  )}
                </div>
              ))}

              {/* Read-only on purpose. A sample round has photos, comments and
                  a received date somebody set with the box in their hand;
                  creating one from a spreadsheet cell is a bigger decision than
                  this panel is allowed to make. Seeing what the sheet claims is
                  useful by itself. */}
              {view.rounds.length > 0 && (
                <div className="wip-rounds">
                  <span className="wip-f">Rounds in the sheet</span>
                  <ul>
                    {view.rounds.map((r) => (
                      <li key={r.round}>
                        <b>{r.label}</b>
                        {r.sent ? ` sent ${r.sent}` : ""}
                        {r.received ? ` · received ${r.received}` : ""}
                      </li>
                    ))}
                  </ul>
                  <p className="wip-note">
                    Rounds are shown, not written. Add them under Sample rounds when they are real.
                  </p>
                </div>
              )}
            </>
          )}

          {showPaste && (
            <div className="wip-paste">
              <label htmlFor="wip-paste">
                Paste the rows, including the header row with Style Number in it.
              </label>
              <textarea
                id="wip-paste"
                className="input"
                rows={5}
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                placeholder="Notes,Product Image,Status,…"
              />
              <button type="button" className="btn ghost" disabled={busy || !paste.trim()} onClick={loadPasted}>
                Read the paste
              </button>
            </div>
          )}

          {view && (
            <div className="wip-foot">
              <button type="button" className="btn link" disabled={busy} onClick={load}>
                Re-read the sheet
              </button>
              {!showPaste && (
                <button type="button" className="btn link" onClick={() => setShowPaste(true)}>
                  Paste rows instead
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

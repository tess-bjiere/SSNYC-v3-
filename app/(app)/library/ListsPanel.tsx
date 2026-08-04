"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  LIST_FIELDS,
  LIST_LABELS,
  LIST_SINGULARS,
  addOption,
  moveOption,
  removeOption,
  resolveList,
  type ListField,
  type ListsSetting,
} from "@/lib/lists";
import { saveLists } from "@/app/actions/settings";

// The taxonomy editor — the original tool's "Manage list options" drawer.
//
// Two deliberate differences from the original. It reorders with ↑/↓ buttons
// rather than drag, which is easier to hit and works the same on a trackpad. And
// removing a chip is a two-click armed control instead of a browser confirm()
// dialog — the same pattern the Trash uses, and the reason is the same: a modal
// confirm can't be styled and blocks the page.
//
// Every edit saves immediately. Local state updates first so the drawer never
// feels laggy, and rolls back if the write fails.
export default function ListsPanel({
  lists,
  onClose,
  onToast,
}: {
  lists: ListsSetting;
  onClose: () => void;
  onToast: (m: string) => void;
}) {
  const router = useRouter();
  const [state, setState] = useState<ListsSetting>(lists);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [armed, setArmed] = useState<string | null>(null);
  const [, start] = useTransition();

  function commit(next: ListsSetting, message?: string) {
    const before = state;
    setState(next);
    setArmed(null);
    start(async () => {
      const res = await saveLists(next);
      if (!res.ok) {
        setState(before);
        onToast(res.error || "Could not save that change.");
        return;
      }
      if (message) onToast(message);
      router.refresh();
    });
  }

  function add(field: ListField) {
    const v = (drafts[field] || "").trim();
    if (!v) return;
    if (resolveList(field, state).some((o) => o.toLowerCase() === v.toLowerCase())) {
      onToast(`“${v}” is already on that list.`);
      return;
    }
    setDrafts((d) => ({ ...d, [field]: "" }));
    commit(addOption(state, field, v), `Added “${v}”`);
  }

  return (
    <div className="notes-drawer lists-drawer open">
      <div className="notes-drawer-head">
        <span>Manage list options</span>
        <button className="notes-close" onClick={onClose} title="Close">×</button>
      </div>

      <div className="notes-drawer-body">
        <p className="lists-help">
          Reorder options with ↑/↓, click × to remove, or type below to add. Order and edits apply
          to every dropdown. Removing an option doesn’t change references already tagged with it —
          those values stay in the filters so you can still find them.
        </p>

        {LIST_FIELDS.map((field) => {
          const options = resolveList(field, state);
          return (
            <div className="lists-group" key={field}>
              <div className="lists-group-head">{LIST_LABELS[field]}</div>

              {options.length === 0 ? (
                <div className="lists-empty">Nothing on this list yet.</div>
              ) : (
                <div className="lists-chips">
                  {options.map((o, i) => {
                    const key = `${field}:${o}`;
                    const isArmed = armed === key;
                    return (
                      <span className={"lists-chip" + (isArmed ? " armed" : "")} key={key}>
                        <button
                          className="lists-move"
                          title="Move up"
                          disabled={i === 0}
                          onClick={() => commit(moveOption(state, field, o, -1))}
                        >
                          ↑
                        </button>
                        <button
                          className="lists-move"
                          title="Move down"
                          disabled={i === options.length - 1}
                          onClick={() => commit(moveOption(state, field, o, 1))}
                        >
                          ↓
                        </button>
                        <span className="lists-chip-label">{o}</span>
                        <button
                          className="lists-x"
                          title={isArmed ? "Click again to remove" : "Remove"}
                          onClick={() =>
                            isArmed ? commit(removeOption(state, field, o), `Removed “${o}”`) : setArmed(key)
                          }
                          onBlur={() => setArmed((a) => (a === key ? null : a))}
                        >
                          {isArmed ? "Remove?" : "×"}
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}

              <div className="lists-add">
                <input
                  className="input"
                  placeholder={`Add ${LIST_SINGULARS[field]}…`}
                  value={drafts[field] || ""}
                  autoComplete="off"
                  onChange={(e) => setDrafts((d) => ({ ...d, [field]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      add(field);
                    }
                  }}
                />
                <button className="btn ghost sm" onClick={() => add(field)}>
                  Add
                </button>
              </div>
            </div>
          );
        })}

        <button className="btn sm lists-close" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

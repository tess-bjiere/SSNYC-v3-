"use client";

// The Photographer / Model line of a picture's detail card, with its people
// (people phase 3, Tess 2026-11-02: "and phase 3").
//
// Each name in the credit reads as it always has; a name that is someone in
// Photographers or Models is a link to their profile. The team also gets:
//   ×          on a tag — takes them off this picture (and out of its credit);
//   + Name     on a credited name nobody has a record for — puts them in the
//              directory and tags them, one deliberate click;
//   + Tag      tag anyone from the directory, or type a new name to add them.
// See app/actions/people.ts for why the credit and the tags move together.

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addPersonFromImage,
  tagImage,
  untagImage,
  type ImagePeople,
} from "@/app/actions/people";
import { creditNames, nameKey, type PersonKind } from "@/lib/peopleRecords";

const DIRECTORY: Record<PersonKind, { href: string; title: string; noun: string }> = {
  photographer: { href: "/photographers", title: "Photographers", noun: "photographer" },
  model: { href: "/models", title: "Models", noun: "model" },
};

export default function PeopleCredit({
  refId,
  kind,
  credit,
  people,
  onPeople,
  allowAdd,
}: {
  refId: string;
  kind: PersonKind;
  /** The typed credit, as the card already had it. */
  credit: string | null;
  /** Null until the tags have loaded — the plain credit shows meanwhile. */
  people: ImagePeople | null;
  onPeople: (p: ImagePeople) => void;
  /** Offer "+ Tag" even with nothing credited (Campaign, Archival, profiles). */
  allowAdd: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dir = DIRECTORY[kind];

  const tags = (people?.tags ?? []).filter((t) => t.kind === kind);
  const own = people?.ownRole === kind;
  const canEdit = !!people?.canEdit;
  const suggestions = new Set(
    (people?.suggestions ?? []).filter((s) => s.kind === kind).map((s) => nameKey(s.name))
  );

  // The credit's names in order: the whole credit, or the parts of a listed one.
  const names = creditNames(credit, own);
  const shown = names.length > 1 ? names.slice(1) : names;
  const tagged = (n: string) => tags.find((t) => nameKey(t.name) === nameKey(n)) ?? null;
  // A tag the credit text does not spell the same way still shows.
  const extra = tags.filter((t) => !shown.some((n) => nameKey(n) === nameKey(t.name)));

  function run(fn: () => Promise<ImagePeople>) {
    setErr(null);
    start(async () => {
      const res = await fn();
      if (res.error) setErr(res.error);
      onPeople(res);
      router.refresh();
    });
  }

  const match = people?.people.find((p) => p.kind === kind && nameKey(p.name) === nameKey(text)) ?? null;
  function submit() {
    const name = text.trim();
    if (!name) return;
    setAdding(false);
    setText("");
    run(() => (match ? tagImage(refId, match.id) : addPersonFromImage(refId, kind, name)));
  }

  if (!shown.length && !extra.length && !(canEdit && allowAdd)) return null;

  return (
    <span className="ppl">
      {shown.map((n, i) => {
        const t = tagged(n);
        return (
          <span className="ppl-name" key={`${n}-${i}`}>
            {t ? (
              <span className="ppl-chip">
                <Link href={`${dir.href}?person=${t.id}`} className="detail-link" title={`Open ${t.name} in ${dir.title}`}>
                  {n}
                </Link>
                {canEdit && !own && (
                  <button
                    type="button"
                    className="ppl-x"
                    title={`Take ${t.name} off this picture`}
                    aria-label={`Take ${t.name} off this picture`}
                    disabled={pending}
                    onClick={() => run(() => untagImage(refId, t.id))}
                  >
                    ×
                  </button>
                )}
              </span>
            ) : (
              <>
                {n}
                {canEdit && suggestions.has(nameKey(n)) && (
                  <button
                    type="button"
                    className="ppl-sugg"
                    title={`Add ${n} to ${dir.title} and tag them here`}
                    disabled={pending}
                    onClick={() => run(() => addPersonFromImage(refId, kind, n))}
                  >
                    + {dir.title}
                  </button>
                )}
              </>
            )}
          </span>
        );
      })}
      {extra.map((t) => (
        <span className="ppl-name" key={t.id}>
          <span className="ppl-chip">
            <Link href={`${dir.href}?person=${t.id}`} className="detail-link">{t.name}</Link>
          </span>
        </span>
      ))}
      {canEdit &&
        (adding ? (
          <span className="ppl-adding">
            <input
              className="input ppl-input"
              autoFocus
              list={`ppl-${kind}-${refId}`}
              placeholder={own ? `Move to another ${dir.noun}…` : `Tag a ${dir.noun}…`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
                if (e.key === "Escape") { setAdding(false); setText(""); }
              }}
            />
            <datalist id={`ppl-${kind}-${refId}`}>
              {(people?.people ?? [])
                .filter((p) => p.kind === kind && !tags.some((t) => t.id === p.id))
                .map((p) => <option key={p.id} value={p.name} />)}
            </datalist>
            <button type="button" className="btn ghost sm" disabled={pending || !text.trim()} onClick={submit}>
              {!text.trim() || match ? "Tag" : `Add to ${dir.title}`}
            </button>
            <button type="button" className="btn link sm" onClick={() => { setAdding(false); setText(""); }}>
              Cancel
            </button>
          </span>
        ) : (
          (allowAdd || shown.length > 0) && (
            <button
              type="button"
              className="ppl-add"
              disabled={pending || !people}
              title={own ? `This is their own picture — tag someone else to move it` : `Tag a ${dir.noun} from ${dir.title}`}
              onClick={() => setAdding(true)}
            >
              {own ? "Move" : "+ Tag"}
            </button>
          )
        ))}
      {err && <span className="ppl-err">{err}</span>}
    </span>
  );
}

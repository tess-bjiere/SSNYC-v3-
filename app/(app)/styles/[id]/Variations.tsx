"use client";

import { useMemo, useState, useTransition } from "react";
import { VARIATION_AXES, briefText, buildBrief, type VariationStyle } from "@/lib/variations";
import { generateVariationImage, recordVariation } from "@/app/actions/variations";

// AI variations (P5).
//
// The brief is built as you type, on the client, from the style record — no
// round trip, because there is nothing to ask a server for until you want an
// image or want to keep one. Showing it rather than hiding it is deliberate:
// the prompt is the part that decides whether the result is usable, and a
// designer who can read it can fix it before spending a render on it.
//
// Everything else here follows from one rule — a generated image is not a
// photograph of a sample. It is saved as a version, flagged AI, with the brief
// that produced it kept alongside; it never touches the cover image and never
// touches a photography slot.

export default function Variations({
  styleId,
  style,
  connected,
}: {
  styleId: string;
  style: VariationStyle;
  connected: boolean;
}) {
  const [axisId, setAxisId] = useState("");
  const [value, setValue] = useState("");
  const [extra, setExtra] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  const axis = VARIATION_AXES.find((a) => a.id === axisId) ?? null;
  const brief = useMemo(
    () => buildBrief(style, { axisId, value, extra }),
    [style, axisId, value, extra]
  );

  function copy() {
    navigator.clipboard?.writeText(briefText(brief)).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => setNote("Couldn't reach the clipboard — select the brief and copy it by hand.")
    );
  }

  function generate() {
    setNote("");
    start(async () => {
      const res = await generateVariationImage(styleId, { axisId, value, extra });
      setNote(res.message);
      if (res.url) setImageUrl(res.url);
    });
  }

  function save() {
    setNote("");
    start(async () => {
      const res = await recordVariation(styleId, { axisId, value, extra }, imageUrl || null);
      setNote(res.message);
      if (res.ok) {
        setValue("");
        setExtra("");
        setImageUrl("");
      }
    });
  }

  return (
    <details className="section vary">
      <summary className="section-toggle">AI variations</summary>

      <p className="vary-note">
        One change at a time, on the garment you already have — a colourway, a print, a trim, a
        detail. The brief below is built from this style&apos;s own record, so every variation of it
        starts from the same description, and it names what must <em>not</em> move: same silhouette,
        same crop, same body. Anything saved lands in <strong>Versions</strong>, flagged AI. It never
        becomes the cover image and never fills a photography slot.
      </p>

      <div className="vary-axes">
        {VARIATION_AXES.map((a) => (
          <button
            key={a.id}
            type="button"
            className={"chip" + (axisId === a.id ? " on" : "")}
            onClick={() => setAxisId((cur) => (cur === a.id ? "" : a.id))}
          >
            {a.label}
          </button>
        ))}
      </div>

      {axis && (
        <>
          <div className="row">
            <div className="field">
              <label>{axis.ask}</label>
              <input
                className="input"
                value={value}
                placeholder={axis.placeholder}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Anything else (optional)</label>
              <input
                className="input"
                value={extra}
                placeholder="e.g. keep the hem tape"
                onChange={(e) => setExtra(e.target.value)}
              />
            </div>
          </div>

          {brief.warnings.length > 0 && (
            <ul className="vary-warn">
              {brief.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}

          {/* Shown, not hidden: the prompt is the thing worth reading before
              anything is generated from it. */}
          <div className="vary-brief">
            <div className="vary-brieftop">
              <span className="vary-title">{brief.title}</span>
              <button type="button" className="btn ghost sm" onClick={copy} disabled={!brief.ready}>
                {copied ? "Copied" : "Copy brief"}
              </button>
            </div>
            <pre className="vary-prompt">{brief.prompt}</pre>
          </div>

          <div className="vary-actions">
            {connected ? (
              <button className="btn sm" type="button" onClick={generate} disabled={!brief.ready || pending}>
                {pending ? "Working…" : "Generate"}
              </button>
            ) : (
              <span className="vary-off">
                No image model connected — copy the brief and run it wherever you like, then paste
                the result back below.
              </span>
            )}
          </div>

          <div className="row">
            <div className="field">
              <label>Image URL (optional)</label>
              <input
                className="input"
                value={imageUrl}
                placeholder="paste the generated image back here"
                onChange={(e) => setImageUrl(e.target.value)}
              />
            </div>
            <div className="field vary-savefield">
              <button className="btn ghost sm" type="button" onClick={save} disabled={!brief.ready || pending}>
                Save to versions
              </button>
            </div>
          </div>

          {imageUrl && (
            <div className="vary-preview">
              <img src={imageUrl} alt={brief.title} />
            </div>
          )}

          {note && <div className="vary-msg">{note}</div>}
        </>
      )}
    </details>
  );
}

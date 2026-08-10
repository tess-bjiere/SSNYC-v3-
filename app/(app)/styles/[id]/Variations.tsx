"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { VARIATION_AXES, briefText, buildBrief, type VariationStyle } from "@/lib/variations";
import {
  generateVariationImage,
  recordVariation,
  recordVariationAsStyle,
} from "@/app/actions/variations";

// AI variations (P5), rebuilt for the modal (Tess, 2026-08-05).
//
// The brief is built as you type, on the client, from the style record — no
// round trip, because there is nothing to ask a server for until you want an
// image or want to keep one. Showing it rather than hiding it is deliberate:
// the prompt is the part that decides whether the result is usable, and a
// designer who can read it can fix it before spending a render on it.
//
// Everything else follows from one rule — a generated image is not a photograph
// of a sample. It never touches a photography slot, and it is always marked AI
// wherever it lands.
//
// THREE THINGS CHANGED when this moved into a box:
//
//   Six axes, not four. Tess named them: "color, print, details, trim,
//   embroidery, length". The two new ones live in lib/variations.ts with their
//   own hold lists — length being the only axis in the whole set that is
//   allowed to move the garment's proportion, so it has to say what it is still
//   holding or the model redraws the thing.
//
//   You pick what it is drawn FROM. "allow the user to edit the existing sketch
//   or model images" — it was hardcoded to the cover image, which meant a
//   studio that had shot a proto could not vary the photograph and a style
//   whose cover is a flat could not vary the drawing. Every picture of the
//   garment is offered, the cover first. Picking nothing still means the cover,
//   so nothing that worked before stopped working.
//
//   You choose where it lands. "create a new style or add alternate options to
//   the existing style profile" — two outcomes, and only the designer knows
//   which is right: a colourway is an option on this style, a re-length is
//   usually a different garment with its own rounds. So the box asks rather
//   than guessing.

export type VariationSource = {
  url: string;
  label: string;
};

export default function Variations({
  styleId,
  style,
  connected,
  sources = [],
}: {
  styleId: string;
  style: VariationStyle;
  connected: boolean;
  sources?: VariationSource[];
}) {
  const router = useRouter();
  const [axisId, setAxisId] = useState("");
  const [value, setValue] = useState("");
  const [extra, setExtra] = useState("");
  const [source, setSource] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  const axis = VARIATION_AXES.find((a) => a.id === axisId) ?? null;
  const req = useMemo(() => ({ axisId, value, extra, source }), [axisId, value, extra, source]);
  const brief = useMemo(() => buildBrief(style, req), [style, req]);

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
      const res = await generateVariationImage(styleId, req);
      setNote(res.message);
      if (res.url) setImageUrl(res.url);
    });
  }

  function saveAsVersion() {
    setNote("");
    start(async () => {
      const res = await recordVariation(styleId, req, imageUrl || null);
      setNote(res.message);
      if (res.ok) {
        setValue("");
        setExtra("");
        setImageUrl("");
        router.refresh();
      }
    });
  }

  function saveAsStyle() {
    setNote("");
    start(async () => {
      const res = await recordVariationAsStyle(styleId, req, imageUrl || null);
      setNote(res.message);
      if (res.ok && res.id) router.push(`/styles/${res.id}`);
    });
  }

  return (
    <div className="vary">
      <p className="vary-note">
        One change at a time, on the garment you already have. The brief below is built from this
        style&apos;s own record, so every variation of it starts from the same description, and it
        names what must <em>not</em> move: same silhouette, same crop, same body. Nothing made here
        ever becomes a photograph of a sample — it is marked AI wherever it lands.
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

          {/* Which picture it is drawn from. Thumbnails rather than a dropdown,
              because the thing being chosen is a picture and nobody can pick
              one from a list of filenames. */}
          {sources.length > 0 && (
            <div className="vary-src">
              <div className="vary-src-head">Work from</div>
              <div className="vary-src-list">
                {sources.map((s) => (
                  <button
                    type="button"
                    key={s.url}
                    title={s.label}
                    className={
                      "vary-src-tile" + ((source || sources[0]?.url) === s.url ? " on" : "")
                    }
                    onClick={() => setSource(s.url)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.url} alt="" />
                    <span>{s.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

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
              <button type="button" className="btn link" onClick={copy} disabled={!brief.ready}>
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
          </div>

          {imageUrl && (
            <div className="vary-preview">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt={brief.title} />
            </div>
          )}

          {/* The two outcomes, side by side and equally weighted, because
              neither is the default answer. */}
          <div className="vary-keep">
            <div className="vary-keep-one">
              <button
                className="btn sm"
                type="button"
                onClick={saveAsVersion}
                disabled={!brief.ready || pending}
              >
                Keep as a version of this style
              </button>
              <span className="h">
                An alternate option on this profile. Same rounds, same photography, one more entry
                in the history above.
              </span>
            </div>
            <div className="vary-keep-one">
              <button
                className="btn ghost sm"
                type="button"
                onClick={saveAsStyle}
                disabled={!brief.ready || pending}
              >
                Make it a new style
              </button>
              <span className="h">
                Its own profile, its own sample rounds, starting in development with no style
                number. Use this when it is really a different garment.
              </span>
            </div>
          </div>

          {note && <div className="vary-msg">{note}</div>}
        </>
      )}
    </div>
  );
}

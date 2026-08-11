import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  SAMPLE_ROUNDS,
  sampleRatingLabel,
  type Style,
  type StyleVersion,
  type StyleSample,
  type StyleComment,
} from "@/lib/types";
import { sortSamples, latestSample } from "@/lib/sampleCycle";
import { normalizePhotos, PHOTO_SLOTS } from "@/lib/photoSlots";
import { withRoundPhotos, styleFaces } from "@/lib/styleCover";
import { readImages, SHOTS_KEY } from "@/lib/imageList";
import { linkify } from "@/lib/linkify";
import { brandName } from "@/lib/brands";
import {
  buildStyleDoc,
  isEmptySection,
  type ExportInput,
  type ExportSample,
} from "@/lib/styleExport";
import ExportActions from "./ExportActions";

// A run of text with any URL, email or www. address in it turned into a real
// link (Tess, 2026-08-10: "any links should be hyperlinked"). Used for every
// cell value, note and the general-notes paragraph, so a tech pack, a WIP
// folder or a link pasted into a comment is clickable in the exported page and
// survives the paste into Google Docs. See lib/linkify.ts.
function Linked({ text }: { text: string }) {
  return (
    <>
      {linkify(text).map((seg, i) =>
        seg.kind === "link" ? (
          <a key={i} href={seg.href} target="_blank" rel="noreferrer">
            {seg.text}
          </a>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </>
  );
}

// Rows whose value is a folder link the studio opens rather than reads (Tess,
// 2026-08-10: "instead of including full url for links -- just include techpack
// and wip underlined with arrows"). A whole Google Sheets URL on the page is
// noise no one reads; the label already says which link it is, so the value is a
// short "Open ↗" instead. Every other value still linkifies in full — a photo
// URL is worth seeing.
const LINK_ROWS = new Set(["Tech pack", "WIP"]);

function RowValue({ row }: { row: { label: string; value: string } }) {
  if (LINK_ROWS.has(row.label)) {
    return (
      <a className="paper-arrow" href={row.value} target="_blank" rel="noreferrer">
        Open ↗
      </a>
    );
  }
  return <Linked text={row.value} />;
}

export const dynamic = "force-dynamic";

// The style's whole history on one page (P4).
//
// Deliberately black on white while the rest of the app is cream on near-black:
// this page exists to leave the app. Google Docs keeps the colours of what you
// paste, a print keeps the background you give it, and a dark export would come
// out either unreadable or as a wall of toner. So the document looks like a
// document.
function studioToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

export default async function StyleExport({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: style } = await supabase.from("styles").select("*").eq("id", id).maybeSingle();
  if (!style) notFound();
  const st = style as Style;

  const [{ data: versions }, { data: samples }, { data: comments }, { data: links }] =
    await Promise.all([
      // Oldest-first at the query, not just at the sort: rows written in one
      // transaction share a `created_at`, and a tie there falls back to the
      // order they arrived in — so the order they arrive in has to be right.
      supabase
        .from("style_versions")
        .select("*")
        .eq("style_id", id)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .order("version_no", { ascending: true }),
      supabase.from("style_samples").select("*").eq("style_id", id),
      // Withdrawn comments are not exported at all — not even to their own
      // author. An export is a document that leaves the building, and a
      // sentence somebody took back has no business in it.
      supabase
        .from("style_comments")
        .select("*")
        .eq("style_id", id)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true }),
      supabase.from("style_references").select("reference_id,created_at").eq("style_id", id).order("created_at", { ascending: true }),
    ]);

  // Same two-query shape the profile uses, and for the same reason: a reference
  // that has since been trashed still has to appear in the record.
  const refIds = (links ?? []).map((l) => l.reference_id as string).filter(Boolean);
  let refs: ExportInput["references"] = [];
  if (refIds.length) {
    const { data: rows } = await supabase
      .from("references")
      .select("id,designer,year,season,garment,deleted_at")
      .in("id", refIds);
    const byId = new Map((rows ?? []).map((r) => [r.id as string, r]));
    refs = refIds
      .map((rid) => byId.get(rid))
      .filter(Boolean)
      .map((r) => ({
        designer: r!.designer as string | null,
        year: r!.year as string | null,
        season: r!.season as string | null,
        garment: r!.garment as string | null,
        deleted_at: r!.deleted_at as string | null,
      }));
  }

  // Cycle order, not row order — the same rule the profile follows.
  const rounds = sortSamples((samples ?? []) as StyleSample[], SAMPLE_ROUNDS);

  // The shot list on the printed record is the newest photography there is:
  // the style's own map with the latest round's laid over it (Tess,
  // 2026-08-05: photography moved onto the rounds). An export that read only
  // styles.photos would print "—" beside every slot for a garment shot on the
  // PPS, and this is the page that gets sent to people who were not in the
  // room. Anything shot before the move is still in the merged map and still
  // prints. See lib/styleCover.ts.
  const coverStyle = withRoundPhotos(st, latestSample(rounds, SAMPLE_ROUNDS)?.photos);
  const photos = normalizePhotos(coverStyle.photos);
  // The sketch at the top of the record (Tess, 2026-08-10: "include sketch of
  // style at top with style info"). styleFaces resolves the same face the grid
  // shows — the drawing first, front and back where both exist.
  const faces = styleFaces(coverStyle);
  // A swatch per colourway the style is being made in (Tess, 2026-08-10). The
  // field is the free text the studio quotes — "black / bone / olive" — so it is
  // split on those separators; each name doubles as the swatch colour where the
  // browser knows it, and always shows as a label so an unknown name still reads.
  const swatches = (st.colors ?? "").split(/[\/,;·|]+/).map((c) => c.trim()).filter(Boolean);
  const generatedOn = studioToday();

  // Each round carried into the export with its rating turned into a word and
  // its shots pulled off the round's photo map, so the photographs travel with
  // the fit notes rather than only in the style-level slot list (Tess,
  // 2026-08-10). buildStyleDoc reverses this to newest-round-first.
  const exportSamples: ExportSample[] = rounds.map((s) => {
    // A round's photographs live under the standard slot keys (model_front,
    // flat_back, …) with any extra model shots in a separate list. Both belong
    // in the round's entry — the slot shots labelled by what they are, the extra
    // shots by their caption — so the pictures sit with the fit notes for the
    // round they came from (Tess, 2026-08-10).
    const slots = normalizePhotos(s.photos);
    return {
      round: s.round,
      factory: s.factory,
      status: s.status,
      rating: sampleRatingLabel(s.rating) || null,
      location: s.location,
      material_supplier: s.material_supplier,
      material_ordered_date: s.material_ordered_date,
      material_eta_date: s.material_eta_date,
      material_received_date: s.material_received_date,
      material_notes: s.material_notes,
      submitted_date: s.submitted_date,
      received_date: s.received_date,
      fitting_date: s.fitting_date,
      notes_sent_date: s.notes_sent_date,
      fit_notes: s.fit_notes,
      comments: s.comments,
      photos: [
        ...PHOTO_SLOTS.filter((slot) => slots[slot.id]).map((slot) => ({
          label: slot.label,
          url: slots[slot.id],
        })),
        ...readImages(s.photos, SHOTS_KEY).map((im) => ({ label: im.caption || "Shot", url: im.url })),
      ],
    };
  });

  const doc = buildStyleDoc({
    // The stored brand is a slug now (multi-brand); the document shows its name.
    style: { ...st, brand: brandName(st.brand) },
    references: refs,
    samples: exportSamples,
    // An optional slot only appears in the export if it was actually shot.
    // The export prints "Shot" or "Not shot yet" against every line, and
    // printing "Detail 2 — Not shot yet" on a garment that needs one detail
    // would put a gap on the page that is not a gap.
    photos: PHOTO_SLOTS.filter((slot) => !slot.optional || photos[slot.id]).map((slot) => ({
      label: slot.label,
      url: photos[slot.id] ?? null,
    })),
    versions: (versions ?? []) as StyleVersion[],
    comments: (comments ?? []) as StyleComment[],
    generatedOn,
  });

  return (
    <div className="page">
      <div className="page-head no-print">
        <Link href={`/styles/${st.id}`} className="count">
          ← {st.name}
        </Link>
      </div>

      <ExportActions />

      <article id="style-doc" className="paper">
        <header className="paper-head">
          {(faces.front || faces.back) && (
            <div className="paper-sketch">
              {faces.front && <img src={faces.front.url} alt={`${doc.title} — ${faces.front.label}`} />}
              {faces.back && <img src={faces.back.url} alt={`${doc.title} — ${faces.back.label}`} />}
            </div>
          )}
          <div className="paper-head-info">
            <h1>{doc.title}</h1>
            {doc.subtitle && <p className="paper-sub">{doc.subtitle}</p>}
            {swatches.length > 0 && (
              <div className="paper-swatches">
                {swatches.map((c, i) => (
                  <span className="paper-swatch" key={`${c}-${i}`}>
                    <span className="paper-swatch-dot" style={{ background: c }} />
                    {c}
                  </span>
                ))}
              </div>
            )}
          </div>
        </header>

        {doc.sections.map((s) => (
          <section key={s.title}>
            <h2>{s.title}</h2>

            {isEmptySection(s) ? (
              <p className="paper-empty">{s.empty}</p>
            ) : (
              <>
                {s.rows.length > 0 && (
                  <table>
                    <tbody>
                      {s.rows.map((r) => (
                        <tr key={r.label}>
                          <th>{r.label}</th>
                          <td><RowValue row={r} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {s.body && <p className="paper-body"><Linked text={s.body} /></p>}

                {s.entries.map((e, i) => (
                  <div className="paper-entry" key={`${e.heading}-${i}`}>
                    <h3>
                      {e.heading}
                      {e.sub && <span className="paper-entry-sub"> — {e.sub}</span>}
                    </h3>
                    {e.rows.length > 0 && (
                      <table>
                        <tbody>
                          {e.rows.map((r) => (
                            <tr key={r.label}>
                              <th>{r.label}</th>
                              <td><RowValue row={r} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {e.notes.map((n, ni) => (
                      <p className="paper-body" key={ni}>
                        {n.label && <strong>{n.label}: </strong>}
                        <Linked text={n.text} />
                      </p>
                    ))}
                    {e.photos && e.photos.length > 0 && (
                      <div className="paper-shots">
                        {e.photos.map((p, pi) => (
                          <figure key={p.url ?? pi}>
                            <span className="paper-shot-frame">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={p.url ?? ""} alt={p.label} />
                            </span>
                            {p.label && (
                              <figcaption>
                                <strong>{p.label}</strong>
                              </figcaption>
                            )}
                          </figure>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
          </section>
        ))}

        <p className="paper-footer">{doc.footer}</p>
      </article>
    </div>
  );
}

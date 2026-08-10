import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  SAMPLE_ROUNDS,
  type Style,
  type StyleVersion,
  type StyleSample,
  type StyleComment,
} from "@/lib/types";
import { sortSamples, latestSample } from "@/lib/sampleCycle";
import { normalizePhotos, PHOTO_SLOTS } from "@/lib/photoSlots";
import { withRoundPhotos } from "@/lib/styleCover";
import {
  buildStyleDoc,
  isEmptySection,
  renderDocText,
  type ExportInput,
} from "@/lib/styleExport";
import ExportActions from "./ExportActions";

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
  const photos = normalizePhotos(
    withRoundPhotos(st, latestSample(rounds, SAMPLE_ROUNDS)?.photos).photos
  );
  const generatedOn = studioToday();

  const doc = buildStyleDoc({
    style: st,
    references: refs,
    samples: rounds,
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

  const text = renderDocText(doc);

  return (
    <div className="page">
      <div className="page-head no-print">
        <Link href={`/styles/${st.id}`} className="count">
          ← {st.name}
        </Link>
      </div>

      <ExportActions targetId="style-doc" text={text} />

      <article id="style-doc" className="paper">
        <h1>{doc.title}</h1>
        {doc.subtitle && <p className="paper-sub">{doc.subtitle}</p>}

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
                          <td>{r.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {s.body && <p className="paper-body">{s.body}</p>}

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
                              <td>{r.value}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {e.notes.map((n, ni) => (
                      <p className="paper-body" key={ni}>
                        {n.label && <strong>{n.label}: </strong>}
                        {n.text}
                      </p>
                    ))}
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

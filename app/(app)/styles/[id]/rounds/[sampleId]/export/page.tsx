import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  SAMPLE_ROUND_LABELS,
  sampleLocationLabel,
  sampleRatingLabel,
  sampleStatusLabel,
  type SampleRound,
  type Style,
  type StyleSample,
} from "@/lib/types";
import { PHOTO_SLOTS, normalizePhotos } from "@/lib/photoSlots";
import { readImages, SHOTS_KEY } from "@/lib/imageList";
import { readNotes } from "@/lib/imageNotes";
import {
  buildRoundDoc,
  missingLine,
  type RoundExportImage,
  type RoundExportInput,
} from "@/lib/roundExport";
import RoundExportActions from "./RoundExportActions";

export const dynamic = "force-dynamic";

// One sample round, as a page you can send to a factory.
//
// Black on white, like the whole-style export next door and for the same
// reason: this page exists to leave the app. A mail client keeps the colours of
// what you paste and a printer keeps the background you give it, so a dark
// export arrives either unreadable or as a wall of toner.
//
// What is different from the style export is the scope, and it is the whole
// point. The style export is the history — every round, every version, every
// comment — and it is what you file or send to a buyer. A factory being asked
// about a hem needs one round: what we asked for, what came back, what is
// wrong, and the pictures of what is wrong. Sending the season's history to
// explain a hem is how the hem gets missed.
//
// The photographs go as links. They are already on public storage URLs — the
// same ones the app loads them from — and a factory that can open the mail can
// open the link. Attaching them would mean pulling every full-size photograph
// into memory and MIME-encoding it into a URL, which no client would take.
//
// Everything the document says is built in lib/roundExport.ts, which is pure
// and unit-tested. This file only fetches the row and lays it out.

function studioToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

export default async function RoundExport({
  params,
}: {
  params: Promise<{ id: string; sampleId: string }>;
}) {
  const { id, sampleId } = await params;
  const supabase = await createClient();

  const [{ data: style }, { data: sample }] = await Promise.all([
    supabase.from("styles").select("*").eq("id", id).maybeSingle(),
    supabase.from("style_samples").select("*").eq("id", sampleId).maybeSingle(),
  ]);

  if (!style || !sample) notFound();
  const st = style as Style;
  const s = sample as StyleSample;
  // A round id from a different style would otherwise render happily under this
  // style's name, which is the one mistake on this page that reaches a factory.
  if (s.style_id !== st.id) notFound();

  const slotPhotos = normalizePhotos(s.photos);
  const notes = readNotes(s.photos);
  const shots = readImages(s.photos, SHOTS_KEY);

  // The standard first, in shoot order, then everything else — so two rounds of
  // the same garment print their photographs in the same order and can actually
  // be compared. Nothing is listed twice even if the same URL is in both.
  const seen = new Set<string>();
  const images: RoundExportImage[] = [];
  const add = (url: string, label: string) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    const note = notes[url];
    // The marks go out numbered, and the same numbers are drawn on the picture
    // below (Tess, 2026-08-05: "these should only include essential details
    // from the sample round including marked up images"). A factory reading
    // "1cm too wide" with no idea where is being asked to guess; a factory
    // reading it against a dot on the waist is being told.
    const pins = (note?.pins ?? []).filter((p) => (p.text ?? "").trim());
    const marks = pins.map((p, i) => `${i + 1}. ${p.text.trim()}`);
    const caption = [(note?.caption ?? "").trim(), ...marks].filter(Boolean).join(" · ");
    images.push({
      url,
      label,
      note: caption || null,
      pins: pins.map((p) => ({ x: p.x, y: p.y, text: p.text.trim() })),
    });
  };
  for (const slot of PHOTO_SLOTS) add(slotPhotos[slot.id] ?? "", slot.label);
  for (const im of shots) add(im.url, im.caption || "Extra");

  const generatedOn = studioToday();
  const input: RoundExportInput = {
    styleName: st.name ?? "",
    styleNo: st.style_no,
    season: st.season,
    // The round in the studio's own words. lib/roundExport.ts never imports the
    // round list — it is handed the label, which is what keeps it testable.
    roundLabel: SAMPLE_ROUND_LABELS[s.round as SampleRound] ?? s.round,
    factory: s.factory ?? st.factory,
    contactName: s.contact_name,
    contactEmail: s.contact_email,
    status: s.status ? sampleStatusLabel(s.status) : null,
    location: s.location ? sampleLocationLabel(s.location) : null,
    rating: s.rating ? sampleRatingLabel(s.rating) : null,
    requestedDate: s.submitted_date,
    receivedDate: s.received_date,
    etaDate: s.eta_date,
    materialType: s.material_type,
    materialContents: s.material_contents,
    materialSupplier: s.material_supplier,
    materialNotes: s.material_notes,
    fitNotes: s.fit_notes,
    factoryComments: s.comments,
    images,
    generatedOn,
  };

  const doc = buildRoundDoc(input);

  return (
    <div className="page">
      <div className="page-head no-print">
        <Link href={`/styles/${st.id}`} className="count">
          ← {st.name}
        </Link>
      </div>

      <RoundExportActions />

      {/* Said out loud, because it is the thing somebody will assume wrongly:
          pressing a button here does not send anything. One clause now that the
          mail draft is gone — there is no longer a To line to explain. */}
      <p className="export-note no-print">
        Nothing is sent from here — save or copy this, then attach it to your own mail.
      </p>

      <article id="round-doc" className="paper paper-tight">
        <h1>{doc.title}</h1>
        <p className="paper-sub">{doc.subtitle}</p>

        {/* Only the sections that have something in them. An empty section used
            to print a sentence apologising for itself, which on a half-filled
            round was most of the document; what is missing is now named once at
            the bottom instead. */}
        {doc.sections
          .filter((sec) => sec.heading !== "Photographs")
          .map((sec) => (
            <section key={sec.heading}>
              <h2>{sec.heading}</h2>
              {sec.lines.map((line, i) => (
                <p className="paper-body" key={i}>
                  {line}
                </p>
              ))}
            </section>
          ))}

        {/* The photographs are shown, not listed — a factory reading this in a
            browser should see the garment, and the URL printed under each one
            was a line of machine text under a picture that was already there.
            The plain-text version behind "Copy everything" and the mail draft
            still carry every link, because that is the only form a mail holds. */}
        {doc.images.length > 0 && (
          <section>
            <h2>Photographs</h2>
            <div className="paper-shots">
              {doc.images.map((im) => (
                <figure key={im.url}>
                  {/* The frame is exactly the picture — no letterboxing — so the
                      marks land where they were made. See .paper-shot-frame. */}
                  <span className="paper-shot-frame">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={im.url} alt={im.label} />
                    {(im.pins ?? []).map((pin, i) => (
                      <span
                        className="paper-pin"
                        key={i}
                        style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}
                        aria-hidden="true"
                      >
                        {i + 1}
                      </span>
                    ))}
                  </span>
                  <figcaption>
                    <strong>{im.label}</strong>
                    {im.note && <span> — {im.note}</span>}
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}

        {/* Everything that has nothing on it, in one line. A factory is still
            told that nobody has fitted the sample; it just is not told four
            times in four headings. */}
        {doc.missing.length > 0 && <p className="paper-missing">{missingLine(doc.missing)}</p>}

        <p className="paper-footer">{doc.title} · {generatedOn}</p>
      </article>
    </div>
  );
}

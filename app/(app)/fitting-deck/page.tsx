import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  SAMPLE_ROUNDS,
  SAMPLE_ROUND_LABELS,
  type SampleRound,
  type Style,
  type StyleSample,
} from "@/lib/types";
import { sortSamples, latestSample } from "@/lib/sampleCycle";
import { normalizePhotos, PHOTO_SLOTS } from "@/lib/photoSlots";
import { readNotes } from "@/lib/imageNotes";
import {
  buildFittingDeck,
  type DeckImage,
  type DeckSlideInput,
} from "@/lib/fittingDeck";
import DeckActions from "./DeckActions";

export const dynamic = "force-dynamic";

// The fitting deck (Tess, 2026-08-10: "select multiple products to include into
// a recent beautiful fitting deck"). Several styles' most-recent rounds, one to
// a page, laid out as a review to save as a PDF — the model shots with their
// mark-ups, the fit notes and factory comments, and the raw material.
//
// Black on white, like the other exports and for the same reason: it exists to
// leave the app, and a dark page prints as a wall of toner. The model shots use
// the same .paper-shot-frame / .paper-pin as the round export, so a mark-up
// lands on exactly the point it was placed on.
//
// The database read and the pin assembly are here; the deck's shape is in
// lib/fittingDeck.ts, pure and tested.

const MODEL_SLOTS = PHOTO_SLOTS.filter((s) => s.group === "model");

function studioToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

/** The model shots of one round, each with its mark-up pins. Same path the round export walks. */
function modelImages(sample: StyleSample | null): DeckImage[] {
  if (!sample) return [];
  const slotPhotos = normalizePhotos(sample.photos);
  const notes = readNotes(sample.photos);
  const out: DeckImage[] = [];
  for (const slot of MODEL_SLOTS) {
    const url = slotPhotos[slot.id];
    if (!url) continue;
    const note = notes[url];
    const pins = (note?.pins ?? []).filter((p) => (p.text ?? "").trim());
    const marks = pins.map((p, i) => `${i + 1}. ${p.text.trim()}`);
    const caption = [(note?.caption ?? "").trim(), ...marks].filter(Boolean).join(" · ");
    out.push({
      url,
      label: slot.label,
      note: caption || null,
      pins: pins.map((p) => ({ x: p.x, y: p.y, text: p.text.trim() })),
    });
  }
  return out;
}

export default async function FittingDeckPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const { ids: raw } = await searchParams;
  // Selection order is kept — the deck reads in the order the styles were picked.
  const ids = (raw ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  const supabase = await createClient();
  let styles: Style[] = [];
  let samples: StyleSample[] = [];
  if (ids.length) {
    const [{ data: styleRows }, { data: sampleRows }] = await Promise.all([
      supabase.from("styles").select("*").in("id", ids).is("deleted_at", null),
      supabase.from("style_samples").select("*").in("style_id", ids),
    ]);
    styles = (styleRows ?? []) as Style[];
    samples = (sampleRows ?? []) as StyleSample[];
  }

  const byId = new Map(styles.map((s) => [s.id, s]));
  const roundsByStyle = new Map<string, StyleSample[]>();
  for (const s of samples) {
    const list = roundsByStyle.get(s.style_id) ?? [];
    list.push(s);
    roundsByStyle.set(s.style_id, list);
  }

  const slideInputs: DeckSlideInput[] = ids
    .map((id) => byId.get(id))
    .filter((s): s is Style => Boolean(s))
    .map((st) => {
      const rounds = sortSamples(roundsByStyle.get(st.id) ?? [], SAMPLE_ROUNDS);
      const round = latestSample(rounds, SAMPLE_ROUNDS);
      return {
        styleNo: st.style_no,
        name: st.name,
        garment: st.garment,
        season: st.season,
        brand: st.brand,
        roundLabel: round ? SAMPLE_ROUND_LABELS[round.round as SampleRound] ?? round.round : null,
        factory: round?.factory ?? st.factory,
        images: modelImages(round),
        fitNotes: round?.fit_notes,
        factoryComments: round?.comments,
        materialType: round?.material_type,
        materialContents: round?.material_contents,
        materialSupplier: round?.material_supplier,
      };
    });

  const deck = buildFittingDeck(slideInputs, { generatedOn: studioToday() });

  return (
    <div className="page">
      <div className="page-head no-print">
        <Link href="/development" className="count">
          ← Development
        </Link>
      </div>

      <DeckActions />

      {deck.slides.length === 0 ? (
        <p className="export-note no-print">
          No styles selected. Go back to Development, choose <strong>Select</strong>, tick the styles
          you want, then <strong>Fitting deck</strong>.
        </p>
      ) : (
        <article id="fitting-deck" className="deck">
          <section className="deck-slide deck-cover">
            {/* The SOUS SOUS wordmark at the masthead (Tess, 2026-08-10:
                "here's the logo to use"). Her black wordmark, trimmed of its
                whitespace; it reads on the white cover. See public/. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="deck-cover-logo" src="/sous-sous-logo.png" alt="SOUS SOUS" />
            <div className="deck-cover-head">
              {(deck.season || deck.brand) && (
                <p className="deck-cover-kicker">
                  {[deck.brand, deck.season].filter(Boolean).join(" · ")}
                </p>
              )}
              <h1>{deck.title}</h1>
              <p className="deck-sub">{deck.subtitle}</p>
            </div>
            <ol className="deck-contents">
              {deck.contents.map((c, i) => (
                <li key={i}>
                  <span className="deck-contents-no">{String(i + 1).padStart(2, "0")}</span>
                  <span className="deck-contents-name">{c.name}</span>
                  {c.styleNo && <span className="deck-contents-sku">{c.styleNo}</span>}
                </li>
              ))}
            </ol>
          </section>

          {deck.slides.map((slide, i) => (
            <section className="deck-slide" key={i}>
              <header className="deck-slide-head">
                <h2>{slide.name}</h2>
                {slide.subtitle && <p className="deck-sub">{slide.subtitle}</p>}
              </header>

              {slide.empty ? (
                <p className="deck-empty">No fitting recorded for this style yet.</p>
              ) : (
                <>
                  {slide.images.length > 0 && (
                    <div className="deck-shots">
                      {slide.images.map((im) => (
                        <figure key={im.url}>
                          <span className="paper-shot-frame">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={im.url} alt={im.label} />
                            {im.pins.map((pin, pi) => (
                              <span
                                className="paper-pin"
                                key={pi}
                                style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}
                                aria-hidden="true"
                              >
                                {pi + 1}
                              </span>
                            ))}
                          </span>
                          <figcaption>
                            <strong>{im.label}</strong>
                            {/* The mark-up note drops onto its own line below the
                                shot's title (Tess, 2026-08-10), so the title stays
                                scannable and the fit note reads as the note it is. */}
                            {im.note && <span className="deck-shot-note">{im.note}</span>}
                          </figcaption>
                        </figure>
                      ))}
                    </div>
                  )}

                  <div className="deck-detail">
                    {slide.fitNotes && (
                      <div className="deck-note">
                        <h3>Fit notes</h3>
                        <p>{slide.fitNotes}</p>
                      </div>
                    )}
                    {slide.factoryComments && (
                      <div className="deck-note">
                        <h3>Factory comments</h3>
                        <p>{slide.factoryComments}</p>
                      </div>
                    )}
                    {slide.material && (
                      <div className="deck-note">
                        <h3>Raw material</h3>
                        <p>{slide.material}</p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </section>
          ))}
        </article>
      )}
    </div>
  );
}

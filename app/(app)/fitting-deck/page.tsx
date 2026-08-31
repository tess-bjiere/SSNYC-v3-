import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireTeam } from "@/lib/access";
import { activeBrand } from "@/lib/activeBrand";
import { loadBrands } from "@/lib/brandsServer";
import { brandName } from "@/lib/brands";
import {
  SAMPLE_ROUNDS,
  SAMPLE_ROUND_LABELS,
  sampleRatingLabel,
  type SampleRound,
  type Style,
  type StyleSample,
} from "@/lib/types";
import { sortSamples, latestSample, shortDate } from "@/lib/sampleCycle";
import { normalizePhotos, PHOTO_SLOTS } from "@/lib/photoSlots";
import { readNotes } from "@/lib/imageNotes";
import { docToText } from "@/lib/richNote";
import {
  buildFittingDeck,
  noteLines,
  type DeckImage,
  type DeckNoteLine,
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

/**
 * A note (fit notes, factory comments) rendered line by line. A bullet line is a
 * marker column and a text column, so when the text wraps its second line aligns
 * under the first line's text rather than under the bullet (Tess, 2026-08-28:
 * "when bullets wrap the second line aligns with the first"). Plain paragraph
 * lines render as ordinary text.
 */
function NoteBody({ text }: { text: string | null }) {
  const lines = noteLines(text);
  if (!lines.length) return null;
  return (
    <div className="deck-notebody">
      {lines.map((l: DeckNoteLine, i) =>
        l.kind === "break" ? (
          <div className="deck-break" key={i} aria-hidden="true" />
        ) : l.kind === "bullet" ? (
          <div className="deck-bullet" key={i} style={{ paddingLeft: `${l.depth * 14}px` }}>
            <span className="deck-bullet-mark" aria-hidden="true">
              {l.marker}
            </span>
            <span className="deck-bullet-text">{l.text}</span>
          </div>
        ) : (
          <p className="deck-para" key={i}>
            {l.text}
          </p>
        )
      )}
    </div>
  );
}

export default async function FittingDeckPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string; history?: string }>;
}) {
  await requireTeam(); // product side, team only
  const { ids: raw, history: historyRaw } = await searchParams;
  // Selection order is kept — the deck reads in the order the styles were picked.
  const ids = (raw ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  // "+ History" export: each style also carries its prior rounds, condensed
  // (Tess, 2026-08-28: "export sample + history ... to show open questions /
  // recurring issues on the style"). Default is the latest round only.
  const historyOn = historyRaw === "1";

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
      // Prior rounds for the history strip: everything before the current one
      // (sortSamples is cycle-ascending, so the current round is the last),
      // newest-first. Only assembled for the +history export.
      const priorRounds = historyOn
        ? rounds.slice(0, -1).reverse().map((r) => ({
            roundLabel: SAMPLE_ROUND_LABELS[r.round as SampleRound] ?? r.round,
            fittingDate: r.fitting_date ? shortDate(r.fitting_date) : null,
            rating: r.rating,
            fitNotes: docToText(r.fit_notes),
            factoryComments: docToText(r.comments),
          }))
        : undefined;
      // The sketch lives on the STYLE (styles.photos), not the round — the front
      // technical sketch, or the front croquis when there is no flat drawing
      // (Tess, 2026-08-28: "a small sketch should be included under the header").
      const stPhotos = normalizePhotos(st.photos);
      return {
        styleNo: st.style_no,
        name: st.name,
        garment: st.garment,
        season: st.season,
        brand: st.brand,
        roundLabel: round ? SAMPLE_ROUND_LABELS[round.round as SampleRound] ?? round.round : null,
        factory: round?.factory ?? st.factory,
        fittingDate: round?.fitting_date ? shortDate(round.fitting_date) : null,
        images: modelImages(round),
        // The style's intended fit — how it should sit, above the fit notes on
        // the deck (Tess, 2026-08-28: "the description of the fit to live above
        // the fit notes when exporting the fitting deck").
        intendedFit: st.intended_fit,
        // A note may now be a TipTap doc — flatten to its bulleted text so the
        // deck reads it, never raw JSON (Tess, 2026-08-24: "go with TipTap").
        fitNotes: docToText(round?.fit_notes),
        factoryComments: docToText(round?.comments),
        materialType: round?.material_type,
        materialContents: round?.material_contents,
        materialSupplier: round?.material_supplier,
        // Fall back to the style's free-text material when the round has none
        // (Tess, 2026-08-28: "exports are missing the materials listed").
        materialText: st.material,
        // The style's colourway line and tech-pack link (Tess, 2026-08-27:
        // "include material, colors and link to techpack").
        colors: st.colors,
        techPack: st.tech_pack_url,
        sketch: stPhotos.sketch ?? stPhotos.croquis ?? null,
        sketchBack: stPhotos.sketch_back ?? stPhotos.croquis_back ?? null,
        history: priorRounds,
      };
    });

  const generatedOn = studioToday();
  const deck = buildFittingDeck(slideInputs, { generatedOn });

  // The brand mark on the deck. SOUS SOUS ships a black-on-transparent wordmark
  // that reads on the white sheet (Tess, 2026-08-27: "use this logo on the deck"),
  // self-hosted at /brand so it never depends on an external host. Any other brand
  // falls back to its name set in Instrument Serif — the uploaded app logo is the
  // light version and would print invisibly here.
  const brandSlug = await activeBrand();
  const brands = await loadBrands();
  const brandLabel = brandName(brandSlug, brands);
  const deckLogo = brandSlug === "sous-sous" ? "/brand/sous-sous-deck.png" : null;

  return (
    <div className="page deck-page">
      <div className="page-head no-print">
        <Link href="/development" className="count">
          ← Style Development
        </Link>
      </div>

      <div className="deck-toolbar no-print">
        {/* Export scope: latest round only, or the latest plus each style's prior
            rounds condensed (Tess, 2026-08-28: "a toggle that says export most
            recent sample or export sample + history"). Two links, so the choice
            is a plain URL the print then captures. */}
        {ids.length > 0 && (
          <div className="deck-mode" role="group" aria-label="Export scope">
            <Link
              href={`/fitting-deck?ids=${ids.join(",")}`}
              className={`deck-mode-opt${historyOn ? "" : " is-active"}`}
            >
              Latest round
            </Link>
            <Link
              href={`/fitting-deck?ids=${ids.join(",")}&history=1`}
              className={`deck-mode-opt${historyOn ? " is-active" : ""}`}
            >
              + History
            </Link>
          </div>
        )}
        <DeckActions fileTitle={`SS_Fitting_${generatedOn}`} />
      </div>

      {deck.slides.length === 0 ? (
        <p className="export-note no-print">
          No styles selected. Go back to Development, choose <strong>Select</strong>, tick the styles
          you want, then <strong>Fitting deck</strong>.
        </p>
      ) : (
        <article id="fitting-deck" className="deck">
          <section className="deck-slide deck-cover">
            {/* The brand mark: SOUS SOUS's black wordmark image, else the name in
                type (Tess, 2026-08-27: "use this logo on the deck"). */}
            {deckLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="deck-cover-logo" src={deckLogo} alt={brandLabel} />
            ) : (
              <div className="deck-cover-wordmark">{brandLabel}</div>
            )}
            <div className="deck-cover-head">
              {/* The brand is the wordmark above; the kicker carries the season
                  (multi-brand: brand is a slug now, and the masthead already
                  names it). */}
              {deck.season && <p className="deck-cover-kicker">{deck.season}</p>}
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
              {/* The title and all the notes stacked in a left column; the shots
                  to the right, starting at the top of the page (Tess, 2026-08-27:
                  "all notes are on left under the titles / etc -- then images are
                  to the right and can start higher on the page"). */}
              <div className="deck-slide-body">
                <div className="deck-slide-left">
                  <header className="deck-slide-head">
                    <h2>{slide.name}</h2>
                    {slide.subtitle && <p className="deck-sub">{slide.subtitle}</p>}
                    {slide.fitDate && <p className="deck-fitdate">Fitted {slide.fitDate}</p>}
                  </header>

                  {/* A small sketch of the style, front and back, under the header
                      and before the notes (Tess, 2026-08-28: "a small sketch
                      should be included ..." + "show back of sketch as well").
                      Shown whenever the style has either, even with no fitting
                      recorded yet; the two sit side by side when both exist. */}
                  {(slide.sketch || slide.sketchBack) && (
                    <div className="deck-sketches">
                      {slide.sketch && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className="deck-sketch" src={slide.sketch} alt="" />
                      )}
                      {slide.sketchBack && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className="deck-sketch" src={slide.sketchBack} alt="" />
                      )}
                    </div>
                  )}

                  {slide.empty ? (
                    <p className="deck-empty">No fitting recorded for this style yet.</p>
                  ) : (
                    <div className="deck-detail">
                      {/* How the garment should fit — the design target, above the
                          fit notes (Tess, 2026-08-28: "the description of the fit
                          to live above the fit notes when exporting the fitting
                          deck"). */}
                      {slide.intendedFit && (
                        <div className="deck-note">
                          <h3>Intended fit</h3>
                          <NoteBody text={slide.intendedFit} />
                        </div>
                      )}
                      {slide.fitNotes && (
                        <div className="deck-note">
                          <h3>Fit notes</h3>
                          <NoteBody text={slide.fitNotes} />
                        </div>
                      )}
                      {slide.factoryComments && (
                        <div className="deck-note">
                          <h3>Factory comments</h3>
                          <NoteBody text={slide.factoryComments} />
                        </div>
                      )}
                      {slide.material && (
                        <div className="deck-note">
                          <h3>Material</h3>
                          <p>{slide.material}</p>
                        </div>
                      )}
                      {/* Colours left off the deck for now (Tess, 2026-08-28:
                          "let's leave colours off the decks for now"). The field
                          is still carried on the slide, so putting the block back
                          is these six lines — the data has not moved. */}
                      {slide.techPack && (
                        <div className="deck-note">
                          <h3>Tech pack</h3>
                          {/* The link stays clickable in the saved PDF. */}
                          <p>
                            <a className="deck-link" href={slide.techPack} target="_blank" rel="noreferrer">
                              Open tech pack ↗
                            </a>
                          </p>
                        </div>
                      )}
                      {/* The prior rounds, condensed, in the +history export —
                          each round's verdict and words under the current one so a
                          recurring or unresolved issue reads down the column
                          (Tess, 2026-08-28: "show open questions / recurring
                          issues on the style"). */}
                      {slide.history.length > 0 && (
                        <div className="deck-history">
                          <h3>History</h3>
                          {slide.history.map((h, hi) => (
                            <div className="deck-history-round" key={hi}>
                              <div className="deck-history-head">
                                <span className="deck-history-label">{h.roundLabel ?? "Round"}</span>
                                {h.fitDate && <span className="deck-history-date">{h.fitDate}</span>}
                                {h.rating && (
                                  <span
                                    className={`sib-dot ${h.rating}`}
                                    title={sampleRatingLabel(h.rating)}
                                    aria-hidden="true"
                                  />
                                )}
                              </div>
                              {h.fitNotes && <NoteBody text={h.fitNotes} />}
                              {h.factoryComments && (
                                <p className="deck-history-fc">
                                  <span className="deck-history-fc-label">Factory:</span> {h.factoryComments}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {!slide.empty && slide.images.length > 0 && (
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
                          {im.note && <span className="deck-shot-note">{im.note}</span>}
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                )}
              </div>
              {/* The brand mark, small in the bottom-left of every slide, set as
                  the brand NAME in type — the uploaded logo is the light app
                  version and prints invisibly (Tess, 2026-08-24 / 2026-08-27:
                  "Logo needs to be sous sous"). Print-only, absolutely positioned
                  so it never disturbs the space-between that drops the notes. */}
              <div className="deck-slide-foot" aria-hidden="true">
                {deckLogo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={deckLogo} alt="" />
                ) : (
                  <span>{brandLabel}</span>
                )}
              </div>
            </section>
          ))}
        </article>
      )}
    </div>
  );
}

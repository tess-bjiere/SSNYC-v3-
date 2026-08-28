import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireTeam } from "@/lib/access";
import { activeBrand } from "@/lib/activeBrand";
import { loadBrands } from "@/lib/brandsServer";
import { brandName } from "@/lib/brands";
import {
  SAMPLE_ROUNDS,
  SAMPLE_ROUND_LABELS,
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
  await requireTeam(); // product side, team only
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
        fittingDate: round?.fitting_date ? shortDate(round.fitting_date) : null,
        images: modelImages(round),
        // A note may now be a TipTap doc — flatten to its bulleted text so the
        // deck reads it, never raw JSON (Tess, 2026-08-24: "go with TipTap").
        fitNotes: docToText(round?.fit_notes),
        factoryComments: docToText(round?.comments),
        materialType: round?.material_type,
        materialContents: round?.material_contents,
        materialSupplier: round?.material_supplier,
        // The style's colourway line and tech-pack link (Tess, 2026-08-27:
        // "include material, colors and link to techpack").
        colors: st.colors,
        techPack: st.tech_pack_url,
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

      <DeckActions fileTitle={`SS_Fitting_${generatedOn}`} />

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

                  {slide.empty ? (
                    <p className="deck-empty">No fitting recorded for this style yet.</p>
                  ) : (
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
                          <h3>Material</h3>
                          <p>{slide.material}</p>
                        </div>
                      )}
                      {slide.colors && (
                        <div className="deck-note">
                          <h3>Colours</h3>
                          <p>{slide.colors}</p>
                        </div>
                      )}
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

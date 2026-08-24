import { PHOTO_SLOTS, photoProgressLabel, type PhotoMap } from "@/lib/photoSlots";
import type { ImageNote } from "@/lib/imageNotes";
import SlotCards from "./SlotCards";

// Photography that hangs off the style rather than off a round.
//
// Tess, 2026-08-05: "photography should not be it's own section, it needs to
// live within the specific sample round."
//
// This file used to BE that section — the five slots, on the style, with a
// "3 of 5 shot" heading. The slots have moved to the round card in
// SampleRounds.tsx, where a photograph sits with the garment it is a
// photograph of. What is left here does two jobs, and which one it is doing
// depends entirely on whether the style has been sampled yet.
//
// BEFORE THE FIRST ROUND — mode "live". A style with no rounds has no round
// card, and moving photography onto the rounds without this would have taken
// photography off the profile completely until somebody logged a proto. That is
// exactly what happened the first time this shipped, and it is the wrong answer:
// an inspo style, a carry-over, a garment that already exists and is being
// re-developed can all be photographed before they are ever sampled. So the
// full five-slot standard is on the page, open, editable, in the same place it
// always was. The moment a round exists, the round card takes over as the place
// to shoot and this block steps back.
//
// AFTER THE FIRST ROUND — mode "filed". Every shot already taken and already
// stored on styles.photos. Nothing was migrated and nothing was deleted: moving
// those rows would have meant guessing which round each old photograph belonged
// to, and a guess written into the database is indistinguishable afterwards
// from a fact. So they stay exactly where they were put, and this block shows
// them — named, full size, still replaceable, still removable — folded away
// under the rounds, labelled as what they are.
//
// In "filed" mode only the slots that actually hold something are drawn. Five
// empty cards there would be a second, older place to file a photograph,
// competing with the round for the same picture. When the last one is removed
// or re-shot onto a round, the block stops rendering on its own.
//
// The style's map is also still read for the profile picture — see
// withRoundPhotos in lib/styleCover.ts, which lays the newest round over it —
// so an old lay flat goes on being a style's face until a round supplies a
// newer one.
//
// Server component: no state, and the slot list is computed once where `photos`
// already lives.
export default function PhotoSlots({
  styleId,
  photos,
  notes,
  meta,
  /** True once the style has at least one sample round. */
  hasRounds = true,
}: {
  styleId: string;
  photos: PhotoMap;
  /** Marks and captions written on these pictures, keyed by image URL. */
  notes?: Record<string, ImageNote>;
  /** Style context for the full-screen viewer (Tess, 2026-08-24). */
  meta?: { name?: string | null; styleNo?: string | null; factory?: string | null; fitDate?: string | null };
  hasRounds?: boolean;
}) {
  if (!hasRounds) {
    return (
      <div className="sr-shoot" id="photography">
        <div className="sr-legend">
          Sample images <span className="ph-progress">{photoProgressLabel(photos)}</span>
        </div>
        <p className="sr-filed-note">
          Shot against the style for now. Log a sample round and photography moves onto it, so each
          proto keeps its own pictures — these stay exactly where they are.
        </p>
        <SlotCards styleId={styleId} photos={photos} slots={PHOTO_SLOTS} notes={notes} meta={meta} />
      </div>
    );
  }

  const filled = PHOTO_SLOTS.filter((slot) => photos[slot.id]);
  if (filled.length === 0) return null;

  return (
    <details className="sr-filed">
      <summary>
        Sample images filed on the style{" "}
        <span className="ph-progress">
          {filled.length} image{filled.length === 1 ? "" : "s"}
        </span>
      </summary>
      <p className="sr-filed-note">
        Shot before photography moved onto the sample rounds. Still here, still yours — replace or
        remove any of them, or re-upload it onto the round it belongs to and this list gets shorter.
      </p>
      <SlotCards styleId={styleId} photos={photos} slots={filled} notes={notes} meta={meta} />
    </details>
  );
}

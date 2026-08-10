// What a new sample round starts out knowing (P3 #46).
//
// Tess, 2026-08-06: "all details should auto populate when you add a new round
// other than notes, location, how it came out, fit status, sample requested
// date, sample received date".
//
// Adding a round used to mean retyping the factory, the contact and the three
// fabric fields every single time, because the form opened empty. They are the
// fields that almost never change between a 1st proto and a 2nd — a style is
// made at one factory, out of one cloth, by one person on the other end of the
// email — so the form was asking the same six questions over and over and
// getting the same six answers, and the cost of that is not the typing. It is
// that a round logged in a hurry ends up with the factory blank, and a round
// with the factory blank drops out of the factory view.
//
// Everything carried is a fact about the STYLE that happens to be recorded per
// round. Everything excluded is a fact about THIS round:
//
//   carried    factory, contact name, contact email, material type,
//              contents, supplier
//   excluded   the dates, the fitting status, the rating, the location, and
//              all three notes fields
//
// ETA is excluded too, though it was not named. It is a date like the two that
// were, and a stale one is worse than a blank one: an ETA copied off the last
// round is in the past the moment it lands, so a brand-new round would open
// already reading "12 days overdue" in red at the top of the page. A blank ETA
// says "nobody has said yet", which is true.
//
// Nothing here writes anything. These are defaults on an empty form, so every
// one of them can be typed over before the round is saved, and a round whose
// fabric really did change is one field of work rather than six.

/** The parts of the previous round this reads. Structural, so this file imports nothing. */
export type RoundDefaultsSource = {
  factory?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  material_type?: string | null;
  material_contents?: string | null;
  material_supplier?: string | null;
};

/** The defaults a new round's form opens with. Every field is a string, never null. */
export type RoundDefaults = {
  factory: string;
  contact_name: string;
  contact_email: string;
  material_type: string;
  material_contents: string;
  material_supplier: string;
};

const EMPTY: RoundDefaults = {
  factory: "",
  contact_name: "",
  contact_email: "",
  material_type: "",
  material_contents: "",
  material_supplier: "",
};

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * What the "Add sample round" form should open holding.
 *
 * `prev` is the round the style is currently on — the one being answered, not
 * the first one ever logged, because the factory that matters is the one the
 * sample is with now. `styleFactory` is the fallback for the very first round
 * of a style, where there is no previous round to copy and the style's own
 * factory is the only thing known.
 */
export function nextRoundDefaults(
  prev: RoundDefaultsSource | null | undefined,
  styleFactory?: string | null
): RoundDefaults {
  if (!prev) return { ...EMPTY, factory: text(styleFactory) };
  return {
    // The round's own factory wins, then the style's. A style whose SMS moved
    // to a second factory should offer that second factory for the round after
    // it, not silently walk back to the one on the style record.
    factory: text(prev.factory) || text(styleFactory),
    contact_name: text(prev.contact_name),
    contact_email: text(prev.contact_email),
    material_type: text(prev.material_type),
    material_contents: text(prev.material_contents),
    material_supplier: text(prev.material_supplier),
  };
}

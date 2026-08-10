import Link from "next/link";
import type { StyleSibling } from "@/lib/styleSiblings";
import { SAMPLE_ROUND_LABELS, sampleRatingLabel, type SampleRound } from "@/lib/types";

// "Also in development with …" — the link between two profiles of the same
// garment.
//
// Tess, 2026-08-05: "if a style is developed by multiple factories, they should
// have their own profile for each but provide hyperlinks to the other duplicate
// styles."
//
// Which rows count as the same garment is decided in lib/styleSiblings.ts and
// tested there. This file is only how it reads on the page, and the decisions
// here are all about not lying:
//
//   The factory is the link text, because the factory is the only reason to
//   click it. "Anorak Jacket" would be the name of the page you are already on.
//
//   The round rides along, small. The whole point of two profiles is that the
//   two developments are at different places, so "which one is further on" is
//   the first question anybody has, and it should be answerable without
//   clicking.
//
//   That pill used to carry the style's status, and it was answering nothing
//   (Tess, 2026-08-05: "for the also in development with -- put the sample round
//   (eg 2nd proto) instead of development next to name"). Both profiles of a
//   garment being developed say "development" — the word was identical on every
//   link ever drawn. "2nd Proto" is the fact somebody came for. Where a factory
//   has logged no rounds at all the pill falls back to the status, because
//   "Inspo" or "Archived" is still worth knowing and an empty pill is not.
//
//   And a dot for how that round came out (Tess, 2026-08-06: "this should have
//   color dot on what the last round received was"). The round name says how
//   far along the other development is; it says nothing about whether what
//   arrived was any good, and those are two different questions. A factory on
//   its 3rd proto because the first two were poor and a factory on its 3rd
//   proto because the studio kept adding colourways read identically without
//   it. The colours are the ones the round cards already use — green, amber,
//   red — so the dot needs no key: it is the same mark, smaller.
//
//   An unrated round gets no dot. Not a grey one: any mark on a link is read as
//   a judgement, and "nobody has looked yet" is not one. The title attribute
//   carries the word, because a colour alone is not readable to everyone.
//
//   Nothing here can be actioned. No merge, no unlink, no "make primary". The
//   relationship is derived from the style number and the season — change those
//   on the profile and the link changes with them. There is nothing stored that
//   could go stale or need cleaning up.

export default function SiblingStrip({ siblings }: { siblings: StyleSibling[] }) {
  if (siblings.length === 0) return null;

  return (
    /* Its own section, under the status (Tess, 2026-08-05: "move also in
       development with into its own section under status"). It was a loose
       line of prose floating between the badges and Details, which read as a
       stray caption on whatever happened to be above it. As a titled section
       it is a fact about the style with a name on it, like Details and
       Versions, and the rule underneath the title says where it ends.

       The wording is still hers: "also made at should be 'also in development
       with'". "Made at" reads as a finished fact about where the garment is
       produced; these two profiles are both still being sampled, and which
       factory ends up making it is exactly what has not been decided. */
    <section className="section siblings-section">
      <h3>Also in development with</h3>
      <div className="siblings">
        {siblings.map((s) => (
          <Link className="sibling" href={`/styles/${s.id}`} key={s.id}>
            <span className="f">{s.factory}</span>
            {(() => {
              // A round typed by hand that is not in the standard list reads
              // back verbatim rather than disappearing — same rule as every
              // other list in this app.
              const round = s.round
                ? SAMPLE_ROUND_LABELS[s.round as SampleRound] ?? s.round
                : "";
              const label = round || s.status;
              // The dot only ever describes a round. When the pill has fallen
              // back to the style status there is no round for it to be about,
              // so it is not drawn — a rating hanging off the word "Archived"
              // would be describing nothing.
              const rating = round ? sampleRatingLabel(s.rating) : "";
              return (
                <>
                  {rating ? (
                    <span
                      className={"sib-dot " + s.rating}
                      title={`${round} came back ${rating.toLowerCase()}`}
                      aria-label={`${round} rated ${rating.toLowerCase()}`}
                    />
                  ) : null}
                  {label ? <span className="st">{label}</span> : null}
                </>
              );
            })()}
          </Link>
        ))}
      </div>
    </section>
  );
}

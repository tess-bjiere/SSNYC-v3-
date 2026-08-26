import Select from "@/app/components/Select";
import GarmentField from "@/app/components/GarmentField";
import RichNotesField from "@/app/components/RichNotesField";
import FredCategoryType from "./FredCategoryType";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  STYLE_STATUSES,
  STYLE_STATUS_LABELS,
  STYLE_CATEGORIES,
  SAMPLE_ROUNDS,
  SAMPLE_ROUND_LABELS,
  styleStatusLabel,
  refThumb,
  type SampleRound,
  type Style,
  type StyleVersion,
  type StyleSample,
  type StyleComment,
  type Reference,
} from "@/lib/types";
import {
  updateStyle,
  repurposeStyle,
  duplicateStyle,
  deleteStyle,
  restoreStyle,
} from "@/app/actions/styles";
import { unlinkReferenceForm } from "@/app/actions/styleRefs";
import { normalizePhotos, DESIGN_SLOTS, PHOTO_SLOTS } from "@/lib/photoSlots";
import { styleFaces, withRoundPhotos } from "@/lib/styleCover";
import { readImages, COLORWAYS_KEY, GALLERY_KEY, SHOTS_KEY } from "@/lib/imageList";
import { readNotes } from "@/lib/imageNotes";
import { photoNoteEntries, type PhotoNoteEntry, type PhotoRef } from "@/lib/photoNotes";
import { buildThreads, countComments, scopeCounts } from "@/lib/commentTree";
import { isCommentVisibleTo } from "@/lib/commentEdit";
import { sortSamples, latestSample } from "@/lib/sampleCycle";
import { summarizeStyle, type SummaryRound } from "@/lib/styleSummary";
import { compareStanding, type StandingSide } from "@/lib/styleStanding";
import { isImageGenConfigured } from "@/lib/imagegen";
import { getSessionUser, requireTeam } from "@/lib/access";
import {
  siblingsOf,
  withLatestRounds,
  type SiblingSampleLike,
  type SiblingStyleLike,
  type StyleSibling,
} from "@/lib/styleSiblings";
import CoverFace from "./CoverFace";
import RepurposeButton from "./RepurposeButton";
import DeleteStyleButton from "./DeleteStyleButton";
import SlotCards from "./SlotCards";
import ImageStrip from "./ImageStrip";
import CommentsDrawer, { type RoundOption } from "./CommentsDrawer";
import ReviewLatestButton from "./ReviewLatestButton";
import StatusControl from "./StatusControl";
import SampleRounds, { type FullThread } from "./SampleRounds";
import VersionStrip from "./VersionStrip";
import SiblingStrip from "./SiblingStrip";
import type { VariationSource } from "./Variations";
import LinkReference from "./LinkReference";
import ModalButton from "./ModalButton";
import { ModalCloseOnSave } from "@/app/components/CloseOnSave";
import Linked from "@/app/components/Linked";
import RichNote from "@/app/components/RichNote";
import { MOCK, mockStyleBundle } from "@/lib/mock";
import { APP } from "@/lib/appConfig";
import { activeBrand } from "@/lib/activeBrand";
import type { LinkedMaterial } from "@/lib/sampleMaterials";
import { normalizeMaterialIds } from "@/lib/sampleMaterials";
import StyleMaterials from "./StyleMaterials";

// Today as a plain calendar day in the studio's timezone, decided once on the
// server. The sample-cycle arithmetic is pure and takes this as an argument, so
// "late" means late in New York rather than late in UTC — which would tip over
// five hours early every evening.
function studioToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

// The columns the "Reference(s)" strip needs. Narrow on purpose — this page
// only ever reads a linked reference, never writes one.
type LinkedRef = Pick<
  Reference,
  "id" | "designer" | "year" | "season" | "garment" | "image_url" | "image" | "thumb_url" | "thumb" | "deleted_at"
>;

export const dynamic = "force-dynamic";

export default async function StyleProfile({ params }: { params: Promise<{ id: string }> }) {
  await requireTeam(); // product side, team only
  const { id } = await params;

  // Who is reading. Only used to decide whose comments offer an Edit button —
  // the server action checks authorship again for itself, because a button that
  // was never rendered stops nobody from posting to the endpoint.
  const viewer = await getSessionUser();

  let st: Style;
  let vs: StyleVersion[];
  let sm: StyleSample[];
  let cm: StyleComment[];
  let refs: LinkedRef[] = [];
  // The fabric & trim library the round form's picker offers. Empty on SSYNC,
  // which has no materials table — see the FRED-only load below.
  let library: LinkedMaterial[] = [];
  // Every other style, narrowly. Two things are read off it: which other
  // profiles are the same garment at another factory (lib/styleSiblings.ts),
  // and the factory names already in use, so the duplicate box can offer them
  // rather than make somebody spell one again. One small query, no join.
  let all: SiblingStyleLike[] = [];
  // The rounds those sibling profiles are on, for the pill beside the factory
  // name. Empty in mock mode and empty when there are no siblings, and the
  // links read perfectly well without it.
  let sibSamples: SiblingSampleLike[] = [];

  if (MOCK) {
    const b = mockStyleBundle(id);
    st = b.style;
    vs = b.versions;
    sm = b.samples;
    cm = b.comments;
  } else {
    const supabase = await createClient();
    const { data: style } = await supabase.from("styles").select("*").eq("id", id).maybeSingle();
    if (!style) notFound();
    st = style as Style;

    const [{ data: versions }, { data: samples }, { data: comments }] = await Promise.all([
      supabase
        .from("style_versions")
        .select("*")
        // A version taken off the list is still in the table — see the
        // style_versions_deleted_at migration. This is the only place the
        // filter matters, because this is the only place versions are listed.
        .eq("style_id", id)
        .is("deleted_at", null)
        .order("version_no", { ascending: false }),
      supabase.from("style_samples").select("*").eq("style_id", id).order("created_at", { ascending: true }),
      // Oldest first: the drawer reads as a conversation, and a reply under the
      // thread it answers only makes sense in the order it was said.
      supabase.from("style_comments").select("*").eq("style_id", id).order("created_at", { ascending: true }),
    ]);

    vs = (versions ?? []) as StyleVersion[];
    sm = (samples ?? []) as StyleSample[];

    // The fabric & trim library, for the round form's picker. FRED only: the
    // materials table has never been applied to the Loyalist project and the
    // library is hidden on the SSYNC deploy (db/p11-materials.sql), so on
    // SOUS SOUS and Renggli there is nothing to offer and no query to run.
    // Soft-deleted rows are fetched too — a round made in a since-retired
    // fabric should still be able to name it — and flagged so the chip can say
    // so rather than silently presenting it as current stock.
    if (APP.id === "fred") {
      const brand = await activeBrand();
      const { data: mats } = await supabase
        .from("materials")
        .select("id, name, kind, supplier, composition, color, color_hex, deleted_at")
        .eq("brand", brand)
        .order("name", { ascending: true });
      library = (mats ?? []).map((m) => ({
        id: m.id as string,
        name: (m.name as string) ?? "",
        kind: (m.kind as string) ?? "fabric",
        supplier: (m.supplier as string | null) ?? null,
        composition: (m.composition as string | null) ?? null,
        color: (m.color as string | null) ?? null,
        color_hex: (m.color_hex as string | null) ?? null,
        deleted: Boolean(m.deleted_at),
      }));
    }
    // A withdrawn comment stops being read here, for everybody including the
    // person who wrote it (Tess, 2026-08-06: "once i delete i shouldnt still
    // have to see my own cooment"). The row is still in the table with its
    // author and its words — see db/p3-comment-delete.sql — and Undo in the
    // drawer restores it; it just is not in the column any more. Filtered here
    // rather than in the drawer so the counts and the cards are computed from
    // the same list and can never disagree about how many comments there are.
    cm = ((comments ?? []) as StyleComment[]).filter((c) => isCommentVisibleTo(c));

    // The references this style is being developed from. Two queries rather than
    // a PostgREST embed so the join table needs no relationship metadata and a
    // reference that has since been trashed still comes back — it is shown with
    // a note instead of vanishing, so the provenance is never silently lost.
    const { data: links } = await supabase
      .from("style_references")
      .select("reference_id,created_at")
      .eq("style_id", id)
      .order("created_at", { ascending: true });

    const refIds = (links ?? []).map((l) => l.reference_id as string).filter(Boolean);
    if (refIds.length) {
      const { data: refRows } = await supabase
        .from("references")
        .select("id,designer,year,season,garment,image_url,image,thumb_url,thumb,deleted_at")
        .in("id", refIds);
      const byId = new Map((refRows ?? []).map((r) => [r.id as string, r as LinkedRef]));
      refs = refIds.map((rid) => byId.get(rid)).filter(Boolean) as LinkedRef[];
    }

    // deleted_at is read again as of 2026-08-05, when styles became
    // soft-deletable. siblingsOf skips deleted rows itself, so a style in the
    // Trash stops being offered as "also made at" without anything else
    // changing — a link into something the studio has stopped reading is a
    // trap, and that was true before the column existed.
    const { data: allRows, error: allErr } = await supabase
      .from("styles")
      .select("id,name,style_no,season,factory,status,deleted_at");
    if (allErr) console.error("sibling candidates:", allErr.message);
    all = (allRows ?? []) as SiblingStyleLike[];

    // How far on the other factory is (Tess, 2026-08-05: "for the also in
    // development with -- put the sample round (eg 2nd proto) instead of
    // development next to name").
    //
    // Deliberately a narrow second read: only the rounds of the one or two
    // styles that turned out to be siblings, three columns wide. Loading every
    // sample row in the studio to label two pills would make an uncommon case
    // paid for on every profile in the library. siblingsOf is pure and cheap,
    // so working the ids out twice costs nothing and keeps the fetch beside the
    // client that can run it.
    //
    // A failure here costs the pill, not the link — the factory name is the
    // reason to click, and it is already known.
    const sibIds = siblingsOf(style as SiblingStyleLike, all).map((x) => x.id);
    if (sibIds.length) {
      const { data: sibRows, error: sibErr } = await supabase
        .from("style_samples")
        .select("style_id,round,created_at,rating")
        .in("style_id", sibIds);
      if (sibErr) console.error("sibling rounds:", sibErr.message);
      sibSamples = (sibRows ?? []) as SiblingSampleLike[];
    }
  }

  // Feedback, threaded one level deep. lib/commentTree.ts does the work and is
  // unit-tested; orphans float to the top rather than disappearing, so a reply
  // whose parent was removed is still readable.
  const threads = buildThreads(cm);
  const commentTotal = countComments(threads);

  // Comment scope (Tess, 2026-08-04: "comments should be linked to specific
  // sample or general profile of style"). Counted here, once, from the threads
  // rather than the raw rows — a reply belongs to whatever its thread root is
  // about, so counting rows would file half a conversation in the wrong place.
  //
  // The round list is in cycle order and includes rounds nobody has commented
  // on: an empty chip is how you find out a round can be talked about on its own.
  const sortedRounds = sortSamples(sm, SAMPLE_ROUNDS);
  const roundOptions: RoundOption[] = sortedRounds.map((s) => ({
    id: s.id,
    label: SAMPLE_ROUND_LABELS[s.round as SampleRound] ?? s.round,
  }));
  const counts = scopeCounts(threads);
  const roundCommentCounts: Record<string, number> = {};
  for (const [sid, n] of counts.bySample) roundCommentCounts[sid] = n;

  // Everything beyond the five fixed photography slots.
  const gallery = readImages(st.photos, GALLERY_KEY);

  // The colourways, with a picture each (Tess, 2026-08-07: "add a way to add
  // multiple colors to a style profile"). Same jsonb map as the gallery and the
  // photography slots, a different key — see COLORWAYS_KEY in lib/imageList.ts.
  const colorways = readImages(st.photos, COLORWAYS_KEY);

  // How the latest JUDGED round came out (Tess, 2026-08-07: "put the latest
  // sample color dot rating next to the product title on style profile").
  //
  // Walked backwards through the cycle rather than taken off the current round,
  // because the current round is usually the one still out and unjudged — and a
  // dot that disappears the moment a new round is logged is a dot that is blank
  // exactly when somebody is asking how the last one went.
  const latestRating = (() => {
    const ordered = sortSamples(sm, SAMPLE_ROUNDS);
    for (let i = ordered.length - 1; i >= 0; i--) {
      const r = (ordered[i]?.rating ?? "").trim().toLowerCase();
      if (r) return r;
    }
    return "";
  })();

  // The round the style is actually on — the furthest through the cycle, not
  // the most recently typed (Tess, 2026-08-05: "the latest sample round should
  // ben showing"). Resolved here as well as inside SampleRounds because the
  // profile picture depends on it.
  const currentRound = latestSample(sm, SAMPLE_ROUNDS);

  // Where the style stands, and how long its rounds have been taking (Tess,
  // 2026-08-05: "Add an ai summary to the top that says the current status of
  // the product and approximate timing between samples").
  //
  // Computed, not generated. lib/styleSummary.ts explains at length why: every
  // number in it is a subtraction between two dates that are printed on a card
  // further down this same page, so it can be checked by eye and is covered by
  // tests. A model call here would be slower, would say something slightly
  // different to the next person who opened the page, and would now and then
  // invent a date. The heading says "Read from the rounds below" rather than
  // "AI" because that is what it is, and a summary that overclaims is one
  // nobody trusts the second time.
  //
  // The labels and the cycle order are handed in from here, so the summary
  // module can stay dependency-free and testable on its own.
  const summaryRounds: SummaryRound[] = sortedRounds.map((s) => ({
    label: SAMPLE_ROUND_LABELS[s.round as SampleRound] ?? s.round,
    order: SAMPLE_ROUNDS.indexOf(s.round as SampleRound),
    status: s.status,
    requested: s.submitted_date,
    received: s.received_date,
    eta: s.eta_date,
  }));
  const summary = summarizeStyle({
    styleStatus: st.status,
    rounds: summaryRounds,
    today: studioToday(),
  });

  // The style's own face, front and back. Resolved once here and used for the
  // header, and handed to the AI generator as its source image so a variation
  // is drawn from the style rather than from the reference it was inspired by.
  //
  // Photography lives on the rounds now, so the newest photograph of a garment
  // is on the newest round rather than on the style. withRoundPhotos lays that
  // round's map over the style's before the precedence order is walked: the
  // sketch still outranks a photograph, and every shoot filed on the style
  // before the move is still read — the round only decides *which* lay flat,
  // never whether a lay flat beats a drawing. See lib/styleCover.ts.
  const faces = styleFaces(withRoundPhotos(st, currentRound?.photos));
  const coverUrl = faces.front?.url ?? faces.back?.url ?? null;

  // The comment threads filed against each round, keyed by sample id, for the
  // round's full-screen viewer to read, add to and reply to (Tess, 2026-08-24:
  // "the ability to add or respond to comments"). The same threads the drawer
  // shows — a thread belongs to a round when its root comment carries that
  // round's sample_id — mapped to the viewer's plain shape.
  const roundComments: Record<string, FullThread[]> = {};
  for (const t of threads) {
    const sid = t.comment.sample_id;
    if (!sid) continue;
    (roundComments[sid] ??= []).push({
      comment: {
        id: t.comment.id,
        author: t.comment.author ?? null,
        body: t.comment.body ?? null,
        created_at: t.comment.created_at ?? null,
      },
      replies: t.replies.map((r) => ({
        id: r.id,
        author: r.author ?? null,
        body: r.body ?? null,
        created_at: r.created_at ?? null,
      })),
    });
  }

  // Everything written on the style's own pictures — the sketch, the flats, the
  // gallery below them — keyed by image URL. Read once here rather than in each
  // component, because all of it comes out of the one styles.photos object.
  // A round's pictures carry their own notes, out of that round's map.
  const styleNotes = readNotes(st.photos);

  // Everything written ON the photographs, gathered for the comments drawer
  // (Tess, 2026-08-05: "notes on the specific sample photos should show up in
  // the comments drawer under their sample round"). Derived, never stored —
  // lib/photoNotes.ts. The order of each list is the order the pictures are in
  // on the page: the named slots in standard order, then the strip under them.
  //
  // The style's own pictures come first and file as "Style", which is where the
  // sketch and anything shot before photography moved onto the rounds lives.
  const photoNotes: PhotoNoteEntry[] = [];
  const stylePhotos = normalizePhotos(st.photos);
  const styleOrder: PhotoRef[] = [
    ...DESIGN_SLOTS.map((sl) => ({ url: stylePhotos[sl.id] ?? "", label: sl.label })),
    ...PHOTO_SLOTS.map((sl) => ({ url: stylePhotos[sl.id] ?? "", label: sl.label })),
    ...gallery.map((im, i) => ({ url: im.url, label: im.caption || `Image ${i + 1}` })),
  ];
  photoNotes.push(...photoNoteEntries(styleOrder, styleNotes, null));

  for (const smp of sortedRounds) {
    const slots = normalizePhotos(smp.photos);
    const shots = readImages(smp.photos, SHOTS_KEY);
    const order: PhotoRef[] = [
      ...PHOTO_SLOTS.map((sl) => ({ url: slots[sl.id] ?? "", label: sl.label })),
      ...shots.map((im, i) => ({ url: im.url, label: im.caption || `Image ${i + 1}` })),
    ];
    photoNotes.push(...photoNoteEntries(order, readNotes(smp.photos), smp.id));
  }

  // What the closed Sketch section has to be able to say about itself.
  const designPhotos = normalizePhotos(st.photos);
  const drawn = DESIGN_SLOTS.filter((s) => designPhotos[s.id]).length;

  // The other profiles of this same garment. Derived on every read rather than
  // stored, so correcting a style number on either profile fixes the link on
  // both — there is no join row to go stale. See lib/styleSiblings.ts.
  const siblings: StyleSibling[] = withLatestRounds(
    siblingsOf(st as SiblingStyleLike, all),
    sibSamples,
    SAMPLE_ROUNDS
  );

  // How this one compares to the same garment at the other factories (Tess,
  // 2026-08-06: "in the ai summary, give rational of how this compares to the
  // duplicate style with other factories -- best, same, worst, etc").
  //
  // Arithmetic again, for the same reasons the rest of the summary is — the
  // ratings and the rounds being compared are printed on the sibling links two
  // inches above this and on the cards below it, so every word of the verdict
  // can be checked by eye. lib/styleStanding.ts holds the rule, including why
  // quality decides it and progress only breaks a tie, and why an unrated
  // factory is left out of the judgement rather than scored as bad.
  //
  // Null whenever there is nothing honest to say — no duplicates, or nothing
  // recorded on either side — and the page then prints nothing at all.
  const standing = compareStanding(
    {
      factory: (st.factory ?? "").trim(),
      roundLabel: currentRound
        ? SAMPLE_ROUND_LABELS[currentRound.round as SampleRound] ?? currentRound.round
        : "",
      rank: currentRound ? SAMPLE_ROUNDS.indexOf(currentRound.round as SampleRound) : -1,
      rating: (currentRound?.rating ?? "") as string,
    },
    siblings.map(
      (sb): StandingSide => ({
        factory: sb.factory,
        roundLabel: SAMPLE_ROUND_LABELS[sb.round as SampleRound] ?? sb.round,
        rank: sb.round ? SAMPLE_ROUNDS.indexOf(sb.round as SampleRound) : -1,
        rating: sb.rating,
      })
    )
  );

  // Factory names already in the studio's own data, for the duplicate box.
  const factories = Array.from(
    new Set(all.map((r) => (r.factory ?? "").trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));

  // Every picture of this garment, for the AI box to work from (Tess,
  // 2026-08-05: "allow the user to edit the existing sketch or model images").
  // Same order as the page reads: the drawing first, then the style's own
  // photography, then the strip, then each round's shots newest last. The
  // resolved face is put in front of all of it so the default the picker shows
  // is the same picture the profile already leads with.
  const sourceSeen = new Set<string>();
  const sources: VariationSource[] = [];
  function offer(url: string, label: string) {
    const u = (url ?? "").trim();
    if (!u || sourceSeen.has(u)) return;
    sourceSeen.add(u);
    sources.push({ url: u, label });
  }
  if (coverUrl) offer(coverUrl, faces.front?.label ?? "Profile picture");
  for (const ref of styleOrder) offer(ref.url, ref.label);
  for (const smp of sortedRounds) {
    const slots = normalizePhotos(smp.photos);
    const round = SAMPLE_ROUND_LABELS[smp.round as SampleRound] ?? smp.round;
    for (const sl of PHOTO_SLOTS) offer(slots[sl.id] ?? "", `${round} — ${sl.label}`);
    readImages(smp.photos, SHOTS_KEY).forEach((im, i) =>
      offer(im.url, im.caption || `${round} — image ${i + 1}`)
    );
  }

  // The materials linked to the style itself (not to a round). The column is
  // FRED-only and jsonb; normalize tolerates the old rows that predate it.
  const styleMaterialIds = normalizeMaterialIds(
    (st as { material_ids?: unknown }).material_ids,
  );

  // FRED styles drop Season, Blank style and WIP from the profile, and read the
  // weight row as fabric GSM instead of a shipping weight (Tess, 2026-08-20).
  // SOUS SOUS and Renggli are untouched.
  const isFred = APP.id === "fred";

  // What the full-screen image viewer shows as context (Tess, 2026-08-24: "Add
  // more details to full screen view — show title, style number, factory fit date
  // etc"). Style-level images carry the style's own factory; round images carry
  // the round's factory and fit date, threaded in SampleRounds.
  const styleMeta = { name: st.name, styleNo: st.style_no, factory: st.factory };

  return (
    <div className="page">
      {/* A style in the Trash still has a working profile — every link anybody
          has kept still lands on it, and the rounds, photographs and comments
          are all still here to read. What it must not do is pretend to be live,
          because somebody would go on working on a style that has fallen off
          Development and wonder why nobody could see it. So it says where it
          is, and offers the one thing worth doing about it. */}
      {st.deleted_at && (
        <div className="trash-banner">
          <span>
            <strong>This style is in the Trash.</strong> Nothing has been lost — everything below is
            exactly as it was. It has only stopped appearing in Development, Sample Images and
            Factories.
          </span>
          <form action={restoreStyle.bind(null, st.id)}>
            <button className="btn sm" type="submit">
              Restore
            </button>
          </form>
        </div>
      )}

      <div className="page-head">
        <Link href="/development" className="count">
          ← Style Development
        </Link>
        <div className="spacer" />
        {/* Opens the round the style is on in the full-screen review — the same
            viewer the round card offers, reached from the top of the profile
            (Tess, 2026-08-24: "replace with 'review latest round' … open the
            full screen view of the most recent sample"). Only when there is a
            round to review; on a style with none it would open onto nothing.
            Hidden on a phone, like the round card's own Full screen — the
            full-screen round view is a desk action there (Tess, 2026-08-11:
            "remove full screen view from sample view on mobile"). */}
        {sortedRounds.length > 0 && (
          <span className="hide-mobile">
            <ReviewLatestButton />
          </span>
        )}
        {/* The whole history on one page, black on white, ready to paste into a
            Google Doc or print. See lib/styleExport.ts. */}
        {/* The one control on this page that makes something new, at the top
            with the other page-level action rather than at the bottom of the
            identity column. */}
        {/* Repurpose, Export CSV and Delete are hidden on a phone (Tess,
            2026-08-11: "remove repurpose from mobile", "remove delete and export
            csv from mobile") — they are desk actions. Export history stays. */}
        <span className="hide-mobile">
          <RepurposeButton action={repurposeStyle.bind(null, st.id)} styleName={st.name} />
        </span>
        {/* Export history now rides on the title line, to the right of the name
            (Tess, 2026-08-11: "move export history to the same line but on the
            right of title") — see the .profile-titlerow below. */}
        {/* The details as a spreadsheet row (Tess, 2026-08-07: "have an option
            to export csv of the above info from a style profile").

            Beside Export history rather than inside it, because they answer
            different questions: the history is the story of the style for a
            person to read, and this is its specification for another piece of
            software to import. The header row uses the receiving form's words
            — Product Name, Hs code — so it drops straight in. A plain link,
            not a button, because it is a GET that writes nothing: safe to open
            twice, safe to bookmark, safe to send to somebody. */}
        <span className="hide-mobile">
          <a href={`/styles/${id}/csv`} className="btn link" download>
            Export CSV
          </a>
        </span>
        {/* Last in the row and quietest in it, on purpose. Not offered at all
            on a style that is already in the Trash — the banner above has the
            only control that makes sense there. */}
        {!st.deleted_at && (
          <span className="hide-mobile">
            <DeleteStyleButton action={deleteStyle.bind(null, st.id)} />
          </span>
        )}
      </div>

      <div className="profile">
        {/* The identity column: what this style is, where it stands, and every
            version it has been. The working column is on the right. */}
        <div className="profile-side">
          {/* The face of the style — the sketch if there is one, then the lay
              flat, then the model shot, and only then the cover image that was
              inherited from the library reference (Tess, 2026-08-05: "the
              sketch or flat should be the profile picture of the style").
              lib/styleCover.ts holds the order and the reasoning.

              Front and back share one frame, reached by the arrow in the
              caption rather than shown side by side (Tess, 2026-08-05:
              "profile image should have an arrow to view back as opposed to
              having it as 2 stacked images") — a garment has one face, and
              halving it the moment somebody draws the back is backwards. They
              always come from the same family: a drawn front beside a
              photographed back reads as two different garments. The caption
              says which slot won, so a profile picture is never a mystery, and
              when there is no back it offers the way to make one. */}
          <CoverFace
            name={st.name}
            front={faces.front}
            back={faces.back}
            addHref={
              faces.source === "family" ? (faces.family === "sketch" ? "#sketch" : "#samples") : null
            }
          />

          {/* The sketch, under the picture it is (Tess, 2026-08-05: "remove
              sketch section -- that can be simplified to just live in the
              profile image area").

              It had a section of its own halfway down the column, which by
              this point was a second copy of the same two drawings: the front
              is already the profile picture above, and the back is one click
              away in the caption. What the section was still needed for was
              narrow — putting a drawing IN, and swapping one out — so that is
              all that is left, folded into the frame it feeds.

              It keeps id="sketch", which is what the "Add a sketch" and "Add
              back" links on the picture point at, so those still open exactly
              the two cards that answer them — they just no longer send you
              down the page to do it. */}
          {/* Hidden on a phone (Tess, 2026-08-11: "we dont need ... sketch
              option on phone") — editing the sketch and colourways is a desk
              task; the small cover above still shows the drawing. */}
          <span className="hide-mobile">
          <ModalButton
            label="Sketch"
            title="Sketch — front and back"
            openOnHash="sketch"
          >
            <SlotCards styleId={st.id} photos={designPhotos} slots={DESIGN_SLOTS} notes={styleNotes} comments={false} meta={styleMeta} whiteFit />

            {/* Colourways live in the sketch box (Tess, 2026-08-07: "maybe it's
                an option in the sketch profile section to upload other
                colors?"). Her instinct is right and worth saying why: this box
                is already the place where what the garment LOOKS like is
                decided — front, back, and now the colours it comes in. Putting
                them anywhere else would mean two boxes about appearance and a
                choice to make every time.

                The colour name is the picture's caption, editable in place, so
                naming a colourway is the same gesture as captioning any other
                image in the tool. Nothing new to learn.

                styles.colors, the free-text line in Details, is untouched. That
                stays the one-line answer somebody quotes in an email — "black /
                bone / olive" — and this is the same fact with a picture on it,
                which is a different job: one is for reading, one is for showing
                a factory which bone. */}
            <ImageStrip
              styleId={st.id}
              list="colorways"
              images={colorways}
              title="Colorways"
              hint="The caption is the color name."
              addLabel="Add colorways"
              meta={styleMeta}
            />
          </ModalButton>
          </span>

          {/* Quick status control — the same dropdown as everywhere else, and
              evergreen beside it rather than buried in a form.

              The tech pack link used to hang off the bottom of this box. It has
              moved into Details (Tess, 2026-08-05: "techpack link should be
              viewable in the initial details section") — it is a fact about the
              style, like the factory and the fabric, not a thing about its
              status, and one copy of it is enough. */}
          <div className="section">
            <h3>Status</h3>
            <StatusControl
              styleId={st.id}
              status={st.status}
              evergreen={!!st.evergreen}
              libraryAt={st.library_at ?? null}
            />
          </div>

          {/* The same garment, at another factory — its own section, directly
              under Status, in the identity column beside the sketch (Tess,
              2026-08-05: "move also in development with into its own section
              under status in column with sketch").

              This is the right column for it. The left column is what this
              style IS — its face, its drawing, where it stands, every version
              it has been — and "the same garment is also being developed with
              somebody else" is a fact of the same kind. It sits under Status
              because the first thing anybody wants after reading this one's
              status is the other one's, which each pill carries beside the
              factory name. Renders nothing at all when there is no sibling. */}
          <SiblingStrip siblings={siblings} />

          {/* Versions — its own section, directly under Status (Tess,
              2026-08-05: "i think versions should be it's own section below the
              status section").

              It was sitting after Design in the main column, on the reasoning
              that a version is a design decision. In front of the real page
              that put a changelog in the middle of the working area, between
              the drawing and the sample rounds — you had to scroll past the
              history to get to the work. Here it reads as what it is: the
              identity column. What this style is, where it stands, and every
              version it has been. The work happens on the right.

              The narrow column is deliberate too. A version list is scanned,
              not worked in — see .profile-side in globals.css, which drops the
              tiles to two across and stacks the two forms. */}
          {/* Versions are hidden on a phone (Tess, 2026-08-11: "we dont need
              versions ... on phone") — duplicating and AI-versioning are desk
              actions. */}
          <span className="hide-mobile">
          <VersionStrip
            styleId={st.id}
            versions={vs}
            aiConnected={isImageGenConfigured()}
            duplicate={duplicateStyle.bind(null, st.id)}
            factories={factories}
            sources={sources}
            style={{
              name: st.name,
              style_no: st.style_no,
              category: st.category,
              garment: st.garment,
              designer: st.designer,
              brand: st.brand,
              season: st.season,
              notes: st.notes,
              fit_notes: st.fit_notes,
              // The resolved face, not the raw column: a variation should be
              // drawn from this style's sketch, not from the library reference
              // it was inspired by.
              cover_image: coverUrl,
            }}
          />
          </span>
        </div>

        <div className="profile-main">
          {/* The verdict on the last judged round, beside the name (Tess,
              2026-08-07). The same dot and the same three colours as the
              development cards, the factory list and the sibling pills — one
              mark meaning one thing everywhere it appears, so it needs no key.

              Nothing is drawn when nothing has been judged. Not a grey dot: any
              mark next to a title is read as a verdict, and "nobody has looked
              yet" is not one. The title attribute carries the word, because a
              colour on its own is not readable to everyone. */}
          <div className="profile-titlerow">
            <h1 className="page-title display" style={{ marginBottom: 6 }}>
              {latestRating && (
                <span
                  className={"sib-dot title " + latestRating}
                  title={`Last judged round came back ${latestRating}`}
                  aria-label={`Last judged round rated ${latestRating}`}
                />
              )}
              {st.name}
            </h1>
            <Link href={`/styles/${id}/export`} className="btn link profile-exporthistory">
              Export history
            </Link>
          </div>
          <div className="profile-badges">
            <span className={"badge " + (st.status === "development" ? "dev" : st.status === "production" ? "prod" : st.status)}>
              {styleStatusLabel(st.status)}
            </span>
            {st.evergreen && <span className="badge ever">Evergreen</span>}
          </div>

          {/* The two sentences somebody wants before they read anything else:
              what is happening to this garment, and how long its samples take.
              Under the name rather than above the whole page (Tess, 2026-08-05:
              "ai summary should be smaller, and go below product title") — it
              is a fact about this garment, so it belongs with the garment's
              other facts, not in a band across the top competing with the page
              head. Smaller too: it is a summary of what is below it, and it was
              set larger than the things it summarises.

              Flagged only when something is late, unanswered or has stopped
              moving — a banner that is always lit is wallpaper.

              The line reading "Read from the rounds below — dates, not a guess"
              is gone at her request. It was a caveat about arithmetic printed
              next to the arithmetic; the numbers are checkable against the
              cards below either way, and the note about where they come from
              lives in lib/styleSummary.ts where it belongs. */}
          <section
            className={`sumbar${summary.attention || standing?.attention ? " warn" : ""}`}
            aria-label="AI summary"
          >
            <div className="sum-main">
              {/* Titled as asked (Tess, 2026-08-05: "ai summary should be
                  titled ai summary"), in the caption face the rest of the page
                  uses for titles. */}
              <span className="sum-kicker">AI summary</span>
              <p className="sum-head">{summary.headline}</p>
              <p className="sum-time">{summary.timing}</p>
              {/* The third sentence only exists when this garment is being made
                  somewhere else too. It is set apart from the two above it
                  because it is about a different subject: those describe this
                  development, this one weighs it against another. */}
              {standing && (
                <p className={`sum-vs${standing.verdict === "worst" ? " warn" : ""}`}>
                  {standing.sentence}
                  {standing.progress ? ` ${standing.progress}` : ""}
                </p>
              )}
            </div>
            {(summary.facts.length > 0 || standing) && (
              <ul className="sum-facts">
                {summary.facts.map((f) => (
                  <li key={f}>{f}</li>
                ))}
                {standing && <li className="vs">{standing.fact}</li>}
              </ul>
            )}
          </section>

          {/* Details */}
          <div className="section profile-details">
            {/* On a phone, Edit rides on the Details header as a small link on
                the right (Tess, 2026-08-11: "put edit details as a small edit
                link on the same line but on the right of 'detail' header"). It
                opens the same modal via #editdetails; the boxed button below is
                hidden on the phone. Desktop keeps the button below Details. */}
            <div className="profile-details-head">
              <h3>Details</h3>
              <a href="#editdetails" className="btn link profile-details-edit">Edit</a>
            </div>
            {/* Two columns on a desktop, one on a phone — the rows are short
                facts and a single file of them pushed Reference(s) and the
                sample rounds off the screen (Tess, 2026-08-05: "Make details 2
                columns on desktop to save space"). On a phone it collapses
                back to one column and the same rows read straight down. */}
            <div className="kv-grid">
            {/* Reading order, 2026-08-05. The grid fills left-to-right, so the
                pairs below are what somebody actually reads as a row, and each
                row is one question:

                  which style is this      Style no. | Season
                  what garment is it       Category  | Garment
                  what is it made of       Fabric    | Color(s)
                  who is making it         Designer  | Factory
                  where is the paperwork   Tech pack

                Before this the rows ran down the old single-column order, which
                the two-column grid then folded in half — so Style no. sat beside
                Category and Season beside Factory, and the two halves of every
                question landed in different rows. */}
            <div className="kv"><span className="k">Style no.</span><span>{st.style_no || "—"}</span></div>
            {/* Season is dropped on FRED (Tess, 2026-08-20). */}
            {!isFred && <div className="kv"><span className="k">Season</span><span>{st.season || "—"}</span></div>}
            <div className="kv"><span className="k">Category</span><span>{st.category || "—"}</span></div>
            <div className="kv"><span className="k">Garment</span><span>{st.garment || "—"}</span></div>
            {/* Fabric sits with the garment, not with the factory: the two of
                them together are what the style IS. (Tess, 2026-08-05: "add
                fabric under details as well".) */}
            {/* One fabric field, called Fabric type (Tess, 2026-08-07: "fabric
                is a duplicate of fabric type -- keep fabric type").

                I added Fabric type beside Fabric yesterday, on the argument
                that jersey and 100% cotton are different questions. In practice
                one gets filled and the other does not, which is what a
                duplicate is. The name she kept is on the left; the value is
                still styles.fabric, where every style in the project already
                has its data — renaming a label costs nothing and moving a
                column of live values risks something. */}
            <div className="kv"><span className="k">Fabric type</span><span>{st.fabric || "—"}</span></div>
            {/* And what it is made OF (Tess, 2026-08-07: "add material into the
                detials and csv export"). Directly under Fabric type because the
                pair is one question asked twice — jersey, in 100% cotton — and
                separated they read as two unrelated facts. */}
            <div className="kv"><span className="k">Material</span><span>{st.material || "—"}</span></div>
            {/* The blank this is built on, where there is one. Sits with the
                fabric because it is the same kind of fact — what the garment is
                made of before anybody cuts it. */}
            {/* Blank style dropped from the profile entirely (Tess, 2026-08-24:
                "remove blank style from style profile"). The blank_style column
                stays and existing values are untouched — only the row is gone. */}
            {/* Colourways, next to the fabric for the same reason fabric sits
                next to the garment (Tess, 2026-08-05: "Include color(s) as
                field option(s) in details"). One line, however many colours —
                a style is quoted as "black / bone / olive" in every email, and
                making somebody add three rows to say that is work the screen
                would only join back together. */}
            <div className="kv"><span className="k">Color(s)</span><span>{st.colors || "—"}</span></div>
            <div className="kv"><span className="k">Designer</span><span>{st.designer || "—"}</span></div>
            <div className="kv"><span className="k">Factory</span><span>{st.factory || "—"}</span></div>
            {/* Customs, in a row of their own under the factory that ships it.
                These three travel with a shipment rather than with a design,
                and they are the fields nobody can remember and everybody has to
                stop and ask for on the day the goods move. Weight prints to
                three places to match the form it is copied into, and an
                unrecorded weight shows an em dash rather than 0.000 — a zero is
                a claim, a blank is an absence, and only one of those gets
                questioned before a shipment is costed. */}
            <div className="kv"><span className="k">HS code</span><span>{st.hs_code || "—"}</span></div>
            <div className="kv"><span className="k">Country of origin</span><span>{st.country_of_origin || "—"}</span></div>
            {/* On FRED this row is the fabric's GSM, not a shipping weight, so it
                is labelled Fabric GSM and shown as a plain number rather than the
                three-decimal lbs figure (Tess, 2026-08-20: "edit weight to be
                fabric gsm"). Same weight_lbs column behind both — a label/format
                change, no migration. */}
            <div className="kv">
              <span className="k">{isFred ? "Fabric GSM" : "Weight (lbs)"}</span>
              <span>
                {st.weight_lbs === null || st.weight_lbs === undefined
                  ? "—"
                  : isFred
                    ? String(Number(st.weight_lbs))
                    : Number(st.weight_lbs).toFixed(3)}
              </span>
            </div>
            {/* The tech pack, in the details rather than under the status
                control (Tess, 2026-08-05: "techpack link should be viewable in
                the initial details section").

                It is a row like the others, and it shows an em dash when there
                isn't one. A button that appears only when the link exists means
                a style with no tech pack looks exactly like a style whose tech
                pack you have not scrolled to — and "where is the tech pack" is
                the single most asked question about a style in development. */}
            {/* Full width, so the last pair above is not left with an empty
                cell beside it, and so a long URL has room. */}
            <div className="kv">
              <span className="k">Tech pack</span>
              {st.tech_pack_url ? (
                <a href={st.tech_pack_url} target="_blank" rel="noreferrer" className="kv-link">
                  Open tech pack ↗
                </a>
              ) : (
                <span>—</span>
              )}
            </div>
            {/* The WIP folder, in the cell beside the tech pack (Tess,
                2026-08-06: "add WIP under factory / next to techpack -- that
                should be a link like tech pack -- Open WIP").

                Two links, one row, because they are the two halves of one
                question — what was specified, and what is actually happening
                — and they are asked for by different people on the same day.
                Built exactly like the tech pack down to the em dash when it is
                empty, for the same reason: a row that disappears when there is
                no link makes a style with no WIP folder look identical to a
                style whose WIP folder you have not scrolled to. Pairing them
                also puts the last row of the grid back to two cells, which is
                what Tech pack was spanning the full width to avoid. */}
            {/* WIP is dropped on FRED (Tess, 2026-08-20). Off FRED, Tech pack and
                WIP still pair up as before. */}
            {!isFred && (
              <div className="kv">
                <span className="k">WIP</span>
                {st.wip_url ? (
                  <a href={st.wip_url} target="_blank" rel="noreferrer" className="kv-link">
                    Open WIP ↗
                  </a>
                ) : (
                  <span>—</span>
                )}
              </div>
            )}
            {/* Linked: a note is as often a tech-pack URL as a sentence, and
                until now every one of them landed as dead text. */}
            {/* Notes runs the full width — it is prose, not a fact, and half
                a column of it wraps into a ribbon. */}
            {st.notes && (
              <div className="kv kv-wide">
                <span className="k">Notes</span>
                <RichNote value={st.notes} />
              </div>
            )}
            {/* The running fit story — the part that carries across rounds:
                the block, the pattern, the thing we keep getting wrong.
                Per-round fit lives on each sample round and always did.

                Tess, 2026-08-05: "Fit shout be above edit details and be
                structured like the notes above, not it's own section." It had
                a heading and a box of its own, below the edit form, which gave
                one paragraph the same weight on the page as the entire sample
                history — and put it after the form that writes it. It is a
                fact about the style, like the fabric and the tech pack, so it
                is a row in the same grid, on the same rhythm as Notes, and it
                reads before the button that edits it. */}
            {st.fit_notes && (
              <div className="kv kv-wide">
                <span className="k">Fit</span>
                <RichNote value={st.fit_notes} />
              </div>
            )}
            </div>
            {/* Materials & trims, inside Details rather than a section at the
                bottom of the page (Tess, 2026-08-20: "can that be moved into the
                details of the profile? ... it shouldnt be at the bottom"). It is
                a fact about the style — what it is made in — so it belongs with
                the fabric and the factory. FRED-only, like the library. */}
            {APP.id === "fred" && (
              <div className="profile-details-mats">
                <div className="stmat-subhead">
                  Materials &amp; trims
                  <span className="ph-progress">
                    {styleMaterialIds.length === 0
                      ? "none linked"
                      : `${styleMaterialIds.length} linked`}
                  </span>
                </div>
                <StyleMaterials styleId={st.id} library={library} linked={styleMaterialIds} />
              </div>
            )}
          </div>

          {/* Pull from WIP stood here and has been taken off the page (Tess,
              2026-08-07: "remove pull from the wip rn", after "im going to
              revisit connecting the WIP later. I'd like to focus on other edits
              rn").

              Taken off, not taken apart. WipPull.tsx, app/actions/wip.ts and
              the four lib modules behind them — the source binding, the sheet
              reader, the zip and the xlsx — are all still here, still compiled
              and still under test. Putting the panel back is these six lines
              and nothing else, which is the whole reason to remove it this way
              rather than by deleting the feature.

              <WipPull styleId={st.id} sheetName={...} /> */}

          {/* Edit details, directly under the read-only Details it edits
              (Tess, 2026-08-05: "move edit details right below details
              section").

              It was at the bottom of the column, after Sketch and Repurpose,
              which meant reading a field and changing it were two different
              journeys down the page. They are the same box now: what the
              style is, and one click to correct it. Still collapsed, because
              the page is for looking at a style far more often than for
              editing one. */}
          {/* Editing a style is a box now, not a panel (Tess, 2026-08-05:
              "Edit details should be a small button that then opens up the
              options in a modal").

              Opening it in place pushed the whole page down a screen — the
              sample rounds, which is what anyone is here for, left the view
              the moment you went to correct a season. And a form with three
              fields to a row was being asked to live in a 320px column. The
              box is wide, the page underneath does not move, and the fields
              are still in the same order as the Details rows above so nobody
              has to hunt for the one they came to change. */}
          <div className="profile-editdetails">
          <ModalButton label="Edit details" title="Edit details" wide openOnHash="editdetails">
            <form action={updateStyle.bind(null, st.id)} style={{ marginTop: 16 }}>
              <div className="field"><label>Name</label><input className="input" name="name" defaultValue={st.name} /></div>
              {/* Same order as the Details rows above it, three to a line
                  instead of two. A form that asks for things in a different
                  order than the page shows them makes you hunt for the field
                  you came to change. */}
              <div className="row3">
                <div className="field"><label>Style no.</label><input className="input" name="style_no" defaultValue={st.style_no ?? ""} /></div>
                {/* On FRED, Category + Type are the taxonomy pair (Type refines the
                    style number's code) and Season is not used; elsewhere Season
                    then the free Category picklist. A stored value that predates a
                    list still shows on the control, so nothing is silently dropped
                    (Tess, 2026-08-09 / 2026-08-20). */}
                {isFred ? (
                  <FredCategoryType category={st.category ?? ""} type={st.garment ?? ""} />
                ) : (
                  <>
                    <div className="field"><label>Season</label><input className="input" name="season" defaultValue={st.season ?? ""} /></div>
                    <div className="field"><label>Category</label>
                      <Select
                        className="select"
                        name="category"
                        aria-label="Category"
                        defaultValue={st.category ?? ""}
                        options={[{ value: "", label: "—" }, ...STYLE_CATEGORIES.map((c) => ({ value: c, label: c }))]}
                      />
                    </div>
                  </>
                )}
              </div>
              {/* What it is: the garment/type, and the two halves of what it is
                  made from. Fabric type and Material sit side by side because they
                  are one question asked twice — jersey, in 100% cotton — and a
                  row apart they read as two unrelated facts. */}
              <div className="row3">
                {/* Garment is the free picklist off FRED; on FRED the Type field
                    up top (in FredCategoryType) is the equivalent. */}
                {!isFred && (
                  <div className="field"><label>Garment</label>
                    <GarmentField defaultValue={st.garment ?? ""} />
                  </div>
                )}
                <div className="field"><label>Fabric type</label><input className="input" name="fabric" defaultValue={st.fabric ?? ""} placeholder="e.g. jersey" /></div>
                <div className="field"><label>Material</label><input className="input" name="material" defaultValue={st.material ?? ""} placeholder="e.g. 100% cotton" /></div>
              </div>
              <div className="row3">
                <div className="field"><label>Color(s)</label><input className="input" name="colors" defaultValue={st.colors ?? ""} placeholder="e.g. black / bone / olive" /></div>
                {/* Blank style input removed for every brand (Tess, 2026-08-24:
                    "remove blank style from style profile"). updateStyle only
                    writes blank_style when the form carries it, so a value an
                    existing style holds is left exactly as it was. */}
                {/* On FRED the fabric's GSM stays on the main form — it is a fabric
                    spec, not a shipping fact (Tess, 2026-08-24). Off FRED the weight
                    is a customs figure and moves into the Customs section below. */}
                {isFred && (
                  <div className="field">
                    <label>Fabric GSM</label>
                    <input className="input" name="weight_lbs" type="number" step="1" min="0" defaultValue={st.weight_lbs ?? ""} placeholder="e.g. 220" />
                  </div>
                )}
              </div>
              {/* Customs — HS code, country of origin and (off FRED) the shipping
                  weight. In a Customs section because they travel with a shipment
                  (Tess, 2026-08-24 field audit: "tuck HS code / Country / Weight
                  into a Customs sub-section"), but OPEN by default now — collapsed,
                  Country of origin read as "not available" because the summary hid
                  it (Tess, 2026-08-24). It still collapses; it just starts shown.
                  step="0.001" keeps the browser's validation in step with the three
                  decimals the column stores. */}
              <details open className="edit-customs">
                <summary>Customs</summary>
                <div className="row3">
                  <div className="field"><label>HS code</label><input className="input" name="hs_code" defaultValue={st.hs_code ?? ""} /></div>
                  <div className="field"><label>Country of origin</label><input className="input" name="country_of_origin" defaultValue={st.country_of_origin ?? ""} /></div>
                  {!isFred && (
                    <div className="field">
                      <label>Weight (lbs)</label>
                      <input className="input" name="weight_lbs" type="number" step="0.001" min="0" defaultValue={st.weight_lbs ?? ""} placeholder="0.000" />
                    </div>
                  )}
                </div>
              </details>
              <div className="row3">
                <div className="field"><label>Designer</label><input className="input" name="designer" defaultValue={st.designer ?? ""} /></div>
                <div className="field"><label>Factory</label><input className="input" name="factory" defaultValue={st.factory ?? ""} /></div>
              </div>
              {/* Cover image URL is gone from this form (Tess, 2026-08-05:
                  "remove 'cover image url' from details"). It stopped being the
                  profile picture when the sketch took over, and a field that
                  edits something you cannot see on the page is a field that
                  gets filled in by mistake.

                  The column is untouched and the data is untouched — every
                  cover_image ever pasted or inherited is still stored, still
                  the last fallback in lib/styleCover.ts, and still what a style
                  with no drawing and no shoot wears. The app stopped reading it
                  into a form; it did not stop keeping it. updateStyle only
                  writes cover_image when a form actually carries the field, so
                  saving this one leaves it exactly as it was. */}
              <div className="row">
                <div className="field"><label>Tech pack link</label><input className="input" name="tech_pack_url" defaultValue={st.tech_pack_url ?? ""} /></div>
                {/* WIP is not edited on FRED — input omitted, column left alone on
                    save (Tess, 2026-08-20). */}
                {!isFred && (
                  <div className="field"><label>WIP link</label><input className="input" name="wip_url" defaultValue={st.wip_url ?? ""} placeholder="https://… the live working folder" /></div>
                )}
              </div>
              <div className="field"><label>Notes</label><RichNotesField name="notes" defaultValue={st.notes} /></div>
              <div className="field">
                <label>Fit notes — the running story across rounds</label>
                <RichNotesField name="fit_notes" defaultValue={st.fit_notes} />
              </div>
              <div className="row">
                <div className="field">
                  <label>Status</label>
                  <Select
                    className="select"
                    name="status"
                    aria-label="Status"
                    defaultValue={st.status}
                    options={STYLE_STATUSES.map((s) => ({
                      value: s,
                      label: STYLE_STATUS_LABELS[s],
                    }))}
                  />
                </div>
                {/* The same hard-cornered box as the quick control, but a real
                    checkbox underneath — this form saves every field at once,
                    so leaving it out would blank the flag on every save. */}
                {/* The box and nothing else (Tess, 2026-08-05: "remove
                    'carried season to season' under evergreen"). The field is
                    already labelled Evergreen directly above it, and the second
                    line was a definition of a word this studio uses every day —
                    it made the tick harder to find, not easier to understand. */}
                <div className="field">
                  <label>Evergreen</label>
                  <label className="everbox check">
                    <input type="checkbox" name="evergreen" defaultChecked={st.evergreen} />
                    <span className="box" aria-hidden />
                  </label>
                </div>
              </div>
              <button className="btn" type="submit">Save changes</button>
              {/* Shuts the box once the save has actually come back, not when
                  the button is pressed — see app/components/CloseOnSave.tsx. */}
              <ModalCloseOnSave />
            </form>
          </ModalButton>
          </div>



          {/* Repurpose used to be a collapsed section here (P3 #43). It is a
              small button in the page head now, opening a modal — see
              RepurposeButton.tsx (Tess, 2026-08-05: "put repurpose to a new
              season as a small button toward top of the profile -- should open
              modal box with options"). Same server action, same fields, same
              two-step; it just is not at the bottom of the column any more. */}

          {/* Sample rounds — material leg then factory leg, per round, and now
              the photography with them.

              Tess, 2026-08-05: "photography should not be it's own section, it
              needs to live within the specific sample round. when someone opens
              the profile the latest sample round should ben showing. all other
              rounds would be viewable on clicking into previous samples."

              The five shoot slots used to be a section of their own, right here,
              holding one set of photographs for the whole style — which meant a
              PPS photograph either overwrote the 1st proto's or was never taken.
              They are drawn inside each round card now, so a photograph sits
              with the garment it is a photograph of.

              filedOnStyle is everything already shot before that move. Nothing
              was migrated and nothing was deleted: those rows are still on
              styles.photos and still shown, folded away under the rounds, still
              replaceable and removable. Deciding which round each old photograph
              belonged to would have been a guess, and a guess written into the
              database is indistinguishable afterwards from a fact. */}
          <SampleRounds
            styleId={st.id}
            styleName={st.name}
            styleNo={st.style_no}
            samples={sm}
            defaultFactory={st.factory ?? ""}
            today={studioToday()}
            commentCounts={roundCommentCounts}
            roundComments={roundComments}
            filedOnStyle={normalizePhotos(st.photos)}
            styleNotes={styleNotes}
            materialLibrary={library}
            styleMaterialIds={styleMaterialIds}
          />

          {/* Everything else that is a picture of this style but is not a
              drawing and is not one of the round's photography slots: swatches,
              a phone photo of the rail, a screenshot from the factory.

              This used to live inside the Sketch section. When that section
              folded up into the profile picture (Tess, 2026-08-05: "remove
              sketch section -- that can be simplified to just live in the
              profile image area") these had to go somewhere, and they are not
              sketches — so they get the plain heading they always deserved.
              Nothing moved in the database: they are the same GALLERY_KEY list
              on the same style, read by the same code. Only the box around
              them changed, and every image filed there is still filed there.

              Collapsed, and saying how many it holds when shut, for the same
              reason the sketch is: the page is worked in the sample rounds.

              Called "Misc images for reference" and sitting under the rounds
              (Tess, 2026-08-05: "Images should be called misc images for
              reference -- that can live below sample rounds"). "Images" was the
              broadest word on a page that is almost entirely images, so it read
              as though it were the photography — and being above the rounds it
              was the first thing offered when the rounds are the work. The id
              stays #images so any link anyone has kept still lands here. */}
          <details className="section" id="images">
            <summary className="section-toggle">
              Misc images for reference{" "}
              <span className="ph-progress">
                {gallery.length === 0
                  ? "none yet"
                  : `${gallery.length} image${gallery.length === 1 ? "" : "s"}`}
              </span>
            </summary>
            <ImageStrip
              styleId={st.id}
              images={gallery}
              addLabel="Add images"
              notes={styleNotes}
              meta={styleMeta}
            />
          </details>

          {/* Materials — the fabrics / trims / packaging this style is made in,
              linked from the library (Tess, 2026-08-19: "add fabric and trims
              from library to a style in development or production"). FRED-only,
              because the materials library is; collapsed like Reference(s), with
              the count on the summary. This is the style-level list — a sample
              round keeps its own, for what that specific sample was sewn in. */}
          {/* Reference(s) — the library references behind this style.
              Renamed from "Developed from" (Tess, 2026-08-05). Collapsed by
              default now (Tess, 2026-08-11: "have reference section collapsed") —
              the summary line still says how many are linked, and it opens on a
              tap; it no longer auto-expands and pushes the page down. */}
          <details className="section">
            <summary className="section-toggle">
              Reference(s){" "}
              <span className="ph-progress">
                {refs.length === 0 ? "none linked" : `${refs.length} linked`}
              </span>
            </summary>
            {refs.length === 0 ? (
              <div style={{ color: "var(--muted)", fontSize: 13 }}>
                Nothing linked yet. Search the library below, or open a reference in the Library or
                on a moodboard and choose <strong>Develop this</strong>.
              </div>
            ) : (
              <div className="devfrom">
                {refs.map((r) => {
                  const src = refThumb(r);
                  const sub = [r.year && r.year !== "Unknown" ? r.year : null, r.garment]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <div className="devfrom-card" key={r.id}>
                      {/* The library, not the public share page (Tess,
                          2026-08-05: "These should link to editable view of
                          product from library"). /r/[id] is the read-only view
                          made for sending outside the studio — landing there
                          from your own style profile meant you could look at
                          the reference but not correct it. /library?ref=<id>
                          opens the same card the Library opens, editable. */}
                      <Link href={`/library?ref=${r.id}`} className="devfrom-img">
                        {src ? <img src={src} alt={r.designer || ""} /> : null}
                      </Link>
                      <div className="devfrom-meta">
                        <div className="d">{r.designer || "Untitled"}</div>
                        {sub && <div className="s">{sub}</div>}
                        {r.deleted_at && <div className="s warn">In Trash</div>}
                      </div>
                      {/* Removes the link only — the reference stays in the Library. */}
                      <form action={unlinkReferenceForm.bind(null, st.id, r.id)}>
                        <button className="btn link" type="submit" title="Unlink this reference">
                          Unlink
                        </button>
                      </form>
                    </div>
                  );
                })}
              </div>
            )}

            {/* The other direction. Linking has only ever been possible from the
                reference side, which made the field look like it held exactly
                one thing — it has always held as many as you like. */}
            <LinkReference styleId={st.id} linkedIds={refs.map((r) => r.id)} />
          </details>
        </div>
      </div>

      {/* Comments & feedback used to be a section down here, under everything.
          It is now a drawer on the right — the same one as the moodboard notes —
          so feedback sits beside the work it is about instead of after it. */}
      <CommentsDrawer
        styleId={st.id}
        threads={threads}
        total={commentTotal}
        rounds={roundOptions}
        photoNotes={photoNotes}
        viewerEmail={viewer?.email ?? null}
      />
    </div>
  );
}

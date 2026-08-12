import { notFound } from "next/navigation";
import { requireTeam, DEV_BYPASS } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { activeBrand } from "@/lib/activeBrand";
import { loadBrands, checkSuperAdmin } from "@/lib/brandsServer";
import { brandName } from "@/lib/brands";
import { normalizeNotes } from "@/lib/notes";
import { MOCK, mockLinesheet, mockStyles, mockSamples } from "@/lib/mock";
import {
  SAMPLE_ROUNDS,
  SAMPLE_ROUND_LABELS,
  isApprovedStatus,
  type SampleRound,
  type Style,
  type StyleSample,
} from "@/lib/types";
import { sortSamples, latestSample } from "@/lib/sampleCycle";
import { styleCoverUrl, styleFaces } from "@/lib/styleCover";
import { readImages, COLORWAYS_KEY } from "@/lib/imageList";
import { siblingsOf, type SiblingStyleLike } from "@/lib/styleSiblings";
import { latestRating } from "@/lib/factories";
import {
  normalizeItems,
  normalizeKind,
  buildLinesheet,
  pickApprovedStyleId,
  type LinesheetEntryInput,
  type LinesheetStanding,
  type LinesheetVersion,
} from "@/lib/linesheet";
import Linesheet from "./Linesheet";
import LinesheetNotes from "./LinesheetNotes";

export const dynamic = "force-dynamic";

// One linesheet: its styles resolved for display and handed to the client
// component. The read mirrors the fitting deck — the row, then its styles and all
// their sample rounds in two parallel queries, mapped in `items` order — with the
// picture and colorway resolution (styleCoverUrl / readImages) added here where
// the impure concerns live.

type Row = {
  id: string;
  name: string;
  kind: string;
  subtitle?: string | null;
  season?: string | null; // legacy — read as a fallback for the subtitle
  items: unknown;
  notes?: unknown;
};

export default async function LinesheetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireTeam();
  const me = user?.name || user?.email || "";
  // God mode edits/deletes any note (same rule as the moodboard); preview counts.
  const godMode = DEV_BYPASS || checkSuperAdmin(user?.email);
  const { id } = await params;

  // The row, plus every live style + its rounds. The picker needs the full style
  // list too, so both come from one load.
  let row: Row | null = null;
  let allStyles: Style[] = [];
  let allSamples: StyleSample[] = [];

  if (MOCK) {
    row = mockLinesheet(id) as unknown as Row | null;
    allStyles = mockStyles;
    allSamples = mockSamples();
  } else {
    const supabase = await createClient();
    const brand = await activeBrand();
    const { data } = await supabase.from("linesheets").select("*").eq("id", id).maybeSingle();
    row = (data as Row) ?? null;
    if (row) {
      const [{ data: styleRows }, { data: sampleRows }] = await Promise.all([
        supabase.from("styles").select("*").eq("brand", brand).is("deleted_at", null),
        supabase.from("style_samples").select("*"),
      ]);
      allStyles = (styleRows ?? []) as Style[];
      allSamples = (sampleRows ?? []) as StyleSample[];
    }
  }

  if (!row) notFound();

  const items = normalizeItems(row.items);
  const byId = new Map(allStyles.map((s) => [s.id, s]));
  const roundsByStyle = new Map<string, StyleSample[]>();
  for (const s of allSamples) {
    const list = roundsByStyle.get(s.style_id) ?? [];
    list.push(s);
    roundsByStyle.set(s.style_id, list);
  }

  // Entries in the linesheet's own order; a style since deleted simply drops.
  const inputs: LinesheetEntryInput[] = items
    .map((item): LinesheetEntryInput | null => {
      const st = byId.get(item.style_id);
      if (!st) return null;
      const rounds = sortSamples(roundsByStyle.get(st.id) ?? [], SAMPLE_ROUNDS);
      const round = latestSample(rounds, SAMPLE_ROUNDS);
      const faces = styleFaces(st);
      const colorways = readImages(st.photos, COLORWAYS_KEY).map((c) => ({
        url: c.url,
        name: c.caption,
      }));
      return {
        styleId: st.id,
        name: st.name,
        styleNo: st.style_no,
        garment: st.garment,
        season: st.season,
        price: item.price ?? null,
        note: item.note ?? null,
        fabric: st.fabric,
        colors: st.colors,
        colorOverride: item.colors ?? null,
        colorways,
        sketchUrl: faces.front?.url ?? faces.back?.url ?? st.cover_image ?? null,
        backUrl: faces.front && faces.back ? faces.back.url : null,
        roundLabel: round ? SAMPLE_ROUND_LABELS[round.round as SampleRound] ?? round.round : null,
        factory: round?.factory ?? st.factory,
        rating: round?.rating ?? "",
      };
    })
    .filter((x): x is LinesheetEntryInput => x !== null);

  const sheet = buildLinesheet(
    { name: row.name, kind: normalizeKind(row.kind), subtitle: row.subtitle ?? row.season },
    inputs
  );

  // The click-through standing: for each style on the sheet, every factory
  // working on the same garment (itself + siblings — the same garment at other
  // factories), with the latest round's rating and whether it is approved (Tess,
  // 2026-08-12: "a modal that shows the various factories working on the same
  // style with the rating next to it"). Computed from data already loaded — no
  // extra query — with siblingsOf (pure) and the samples buckets above.
  function standingRow(styleId: string, factory: string | null, isSelf: boolean): LinesheetVersion {
    const rounds = sortSamples(roundsByStyle.get(styleId) ?? [], SAMPLE_ROUNDS);
    const latest = latestSample(rounds, SAMPLE_ROUNDS);
    return {
      styleId,
      factory,
      roundLabel: latest ? SAMPLE_ROUND_LABELS[latest.round as SampleRound] ?? latest.round : null,
      rating: latestRating(rounds),
      approved: latest ? isApprovedStatus(latest.status) : false,
      isSelf,
    };
  }

  const standings: Record<string, LinesheetStanding> = {};
  for (const item of items) {
    const st = byId.get(item.style_id);
    if (!st) continue;
    const versions: LinesheetVersion[] = [standingRow(st.id, st.factory, true)];
    for (const sib of siblingsOf(st as SiblingStyleLike, allStyles as SiblingStyleLike[])) {
      versions.push(standingRow(sib.id, sib.factory, false));
    }
    standings[st.id] = { versions, approvedStyleId: pickApprovedStyleId(versions) };
  }

  // The PDF cover is a deck presented to a buyer (Tess, 2026-08-12): the active
  // brand's logo (or its name as a wordmark), and a date. Same masthead the
  // fitting deck uses. brandName tolerates an empty brands list, so mock and a
  // session-less read both fall back to the slug rather than erroring.
  const brandSlug = await activeBrand();
  const brands = await loadBrands();
  const brandLogo = brands.find((b) => b.slug === brandSlug)?.logo_url || null;
  const brandLabel = brandName(brandSlug, brands);
  const generatedOn = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  }).format(new Date());

  // Compact list for the add-styles picker — every style, flagged if already in.
  const inSheet = new Set(items.map((i) => i.style_id));
  const pickable = allStyles.map((s) => ({
    id: s.id,
    name: s.name || "Untitled",
    styleNo: s.style_no,
    garment: s.garment,
    thumb: styleCoverUrl(s),
    inSheet: inSheet.has(s.id),
  }));

  return (
    <>
      <Linesheet
        id={id}
        sheet={sheet}
        pickable={pickable}
        standings={standings}
        cover={{ brandLogo, brandLabel, generatedOn }}
      />
      <LinesheetNotes
        linesheetId={id}
        notes={normalizeNotes(row.notes)}
        me={me}
        canDeleteAll={godMode}
      />
    </>
  );
}

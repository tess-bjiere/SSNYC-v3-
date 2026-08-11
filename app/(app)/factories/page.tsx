import { createClient } from "@/lib/supabase/server";
import { requireTeam } from "@/lib/access";
import { activeBrand } from "@/lib/activeBrand";
import { SAMPLE_ROUNDS, type Style, type StyleSample } from "@/lib/types";
import { sortSamples } from "@/lib/sampleCycle";
import { groupByFactory } from "@/lib/factories";
import { MOCK, mockStyles, mockSamples } from "@/lib/mock";
import Factories from "./Factories";

export const dynamic = "force-dynamic";

// Today as a plain calendar day in the studio's timezone, decided once on the
// server so "late" means late in New York rather than late in UTC — which would
// tip over five hours early every evening. Same helper as the style profile.
function studioToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

export default async function FactoriesPage() {
  await requireTeam(); // product side, team only
  let styles: Style[] = [];
  let samples: StyleSample[] = [];

  if (MOCK) {
    styles = mockStyles;
    samples = mockSamples();
  } else {
    const supabase = await createClient();
    const brand = await activeBrand();
    const [{ data: st }, { data: sm }] = await Promise.all([
      // Nothing in the Trash is at a factory.
      supabase.from("styles").select("*").eq("brand", brand).is("deleted_at", null),
      supabase.from("style_samples").select("*"),
    ]);
    styles = (st ?? []) as Style[];
    samples = (sm ?? []) as StyleSample[];
  }

  // Cycle order first, so each style's rounds read proto1 → proto2 → SMS inside
  // every factory and "the round they're on" is the earliest unfinished one.
  const groups = groupByFactory(styles, sortSamples(samples, SAMPLE_ROUNDS));

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title display">Styles by Factory</h1>
      </div>
      <Factories groups={groups} today={studioToday()} />
    </div>
  );
}

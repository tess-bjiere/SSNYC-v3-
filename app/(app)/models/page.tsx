import PhotographersClient from "../photographers/PhotographersClient";
import { loadDirectory } from "../photographers/loadDirectory";

export const dynamic = "force-dynamic";

// Models — the casting list (Tess, 2026-11-02: "create a space for potential
// models to be added as well and add the ones in the deck above to ssync"). The
// photographer directory's page over rows of type 'model': by city, a card per
// person with their pictures, age, agency and work, starred, grouped (Shortlist,
// Casting reference), and "+ Add" for the next one. See lib/people.ts.
// `?person=<id>` opens that person's profile — where a tag on a picture links
// (people phase 3, 2026-11-02).
export default async function ModelsPage({ searchParams }: { searchParams: Promise<{ person?: string }> }) {
  const [dir, sp] = await Promise.all([loadDirectory("model"), searchParams]);
  return <PhotographersClient kind="model" {...dir} openId={sp.person ?? null} />;
}

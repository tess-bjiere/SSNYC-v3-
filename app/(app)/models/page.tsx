import PhotographersClient from "../photographers/PhotographersClient";
import { loadDirectory } from "../photographers/loadDirectory";

export const dynamic = "force-dynamic";

// Models — the casting list (Tess, 2026-11-02: "create a space for potential
// models to be added as well and add the ones in the deck above to ssync"). The
// photographer directory's page over rows of type 'model': by city, a card per
// person with their pictures, age, agency and work, starred, grouped (Shortlist,
// Casting reference), and "+ Add" for the next one. See lib/people.ts.
export default async function ModelsPage() {
  const dir = await loadDirectory("model");
  return <PhotographersClient kind="model" {...dir} />;
}

import PhotographersClient from "./PhotographersClient";
import { loadDirectory } from "./loadDirectory";

export const dynamic = "force-dynamic";

// The photographer directory (Tess, 2026-08-17). Since people phase 1
// (2026-11-02) it is the `people` records of kind photographer and the pictures
// tagged to them — see lib/peopleRecords.ts. Before, it grouped Campaign and
// roster rows by the name typed on them, with the cards in a settings blob.
//
// It was extras-only from 2026-08-18 (Tess: "hide ... photographer library on the
// sous sous / renggli versions") until 2026-11-02, when she asked for the deck's
// photographers in SSYNC — so it is on for this deploy again, every brand, with
// the at-home tier still behind APP.productExtras.
// `?person=<id>` opens that person's profile — where a tag on a picture links
// (people phase 3, 2026-11-02).
export default async function PhotographersPage({ searchParams }: { searchParams: Promise<{ person?: string }> }) {
  const [dir, sp] = await Promise.all([loadDirectory("photographer"), searchParams]);
  return <PhotographersClient kind="photographer" {...dir} openId={sp.person ?? null} />;
}

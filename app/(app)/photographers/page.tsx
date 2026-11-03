import PhotographersClient from "./PhotographersClient";
import { loadDirectory } from "./loadDirectory";

export const dynamic = "force-dynamic";

// The photographer directory (Tess, 2026-08-17). Built from the campaign images —
// same rows as /editorial, told apart by `type = editorial` — plus the roster and
// a settings blob holding the team-entered side of each person. No photographer
// table.
//
// It was extras-only from 2026-08-18 (Tess: "hide ... photographer library on the
// sous sous / renggli versions") until 2026-11-02, when she asked for the deck's
// photographers in SSYNC — so it is on for this deploy again, every brand, with
// the at-home tier still behind APP.productExtras.
export default async function PhotographersPage() {
  const { refs, metaValue, canEdit } = await loadDirectory("photographer");
  return <PhotographersClient kind="photographer" refs={refs} metaValue={metaValue} canEdit={canEdit} />;
}

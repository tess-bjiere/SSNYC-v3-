import Link from "next/link";
import { requireTeam } from "@/lib/access";
import DevTabs from "./DevTabs";
import { loadStudioStyles } from "./loadStudioStyles";

export const dynamic = "force-dynamic";

// Work in progress. What has already been made lives in the Style Library
// (/style-library) — same rows, same cards, read for a different question.
export default async function DevelopmentPage() {
  await requireTeam(); // product side — a talent is redirected to their ideation home
  const { styles, gridStyles, summaryMap } = await loadStudioStyles();

  return (
    <div className="page lib-page">
      <div className="page-head">
        <h1 className="page-title display">Style Development</h1>
        <div className="spacer" />
        <Link href="/styles/new" className="btn sm lib-add-desk">
          + New Style
        </Link>
      </div>
      {/* The phone's full-width New Style — the desk one in the head hides below
          the drawer breakpoint and this takes over (shared lib-page pattern). */}
      <Link href="/styles/new" className="btn lib-add-mobile">
        + New Style
      </Link>
      <DevTabs styles={gridStyles} summaries={summaryMap} />
    </div>
  );
}

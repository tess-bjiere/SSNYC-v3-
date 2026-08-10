import Link from "next/link";
import DevTabs from "./DevTabs";
import { loadStudioStyles } from "./loadStudioStyles";

export const dynamic = "force-dynamic";

// Work in progress. What has already been made lives in the Style Library
// (/style-library) — same rows, same cards, read for a different question.
export default async function DevelopmentPage() {
  const { styles, gridStyles, summaryMap } = await loadStudioStyles();

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title display">Development</h1>
        <div className="spacer" />
        <Link href="/styles/new" className="btn sm">
          + New Style
        </Link>
      </div>
      <DevTabs styles={gridStyles} summaries={summaryMap} />
    </div>
  );
}

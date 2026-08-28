import Link from "next/link";
import { getSessionUser } from "@/lib/access";
import { activeBrand } from "@/lib/activeBrand";
import { actorName } from "@/lib/notify";
import { loadActivityFeed } from "./data";
import MarkSeen from "./MarkSeen";

export const dynamic = "force-dynamic";

// The in-app activity feed (Tess, 2026-08-26: notifications without email/DNS).
// Recent comments on the styles you watch — the ones you created or have commented
// on — newest first, the unread ones marked, each a link to the style. Opening the
// page clears the nav badge (MarkSeen).

function when(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  }).format(new Date(t));
}

export default async function ActivityPage() {
  const user = await getSessionUser();
  const brand = await activeBrand();
  const { items } = await loadActivityFeed(user?.email ?? null, brand);

  return (
    <div className="page">
      <MarkSeen />
      <div className="page-head">
        <h1 className="page-title display">Activity</h1>
        <Link href="/notifications" className="btn link sm">
          Email settings
        </Link>
      </div>
      <p className="act-intro">
        New comments on styles you created or have commented on. Also emailed to you
        if email notifications are switched on.
      </p>

      {items.length === 0 ? (
        <div className="empty">Nothing new. Comments on the styles you follow will show up here.</div>
      ) : (
        <ul className="act-list">
          {items.map((it) => (
            <li key={it.commentId} className={"act-item" + (it.unread ? " act-unread" : "")}>
              <Link href={`/styles/${it.styleId}`} className="act-link">
                <span className="act-dot" aria-hidden="true" />
                <span className="act-main">
                  <span className="act-head">
                    <span className="act-style">{it.styleName}</span>
                    <span className="act-meta">
                      {actorName(it.author)} · {when(it.createdAt)}
                    </span>
                  </span>
                  <span className="act-excerpt">{it.excerpt}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

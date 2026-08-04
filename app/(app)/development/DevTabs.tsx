"use client";

import { useState } from "react";
import Link from "next/link";
import type { Style } from "@/lib/types";

// The Development tabs.
//
// Four of them are the status pipeline — a style is in exactly one. The fifth,
// Evergreen, cuts across it: an evergreen style is a block the studio keeps
// remaking, and it can be sitting in production, archived, or anywhere else at
// the same time. So the tab filters on the flag, not the status, and the status
// badge stays on the card to say where each one currently is (P3 #43).
type TabKey = Style["status"] | "evergreen";

const TABS: { key: TabKey; label: string }[] = [
  { key: "inspo", label: "Inspo" },
  { key: "development", label: "Development" },
  { key: "production", label: "Production" },
  { key: "archived", label: "Archived" },
  { key: "evergreen", label: "Evergreen" },
];

function inTab(s: Style, tab: TabKey): boolean {
  return tab === "evergreen" ? s.evergreen : s.status === tab;
}

function StatusBadge({ s }: { s: Style["status"] }) {
  const cls = s === "development" ? "dev" : s === "production" ? "prod" : s;
  return <span className={"badge " + cls}>{s === "development" ? "In development" : s}</span>;
}

export default function DevTabs({ styles }: { styles: Style[] }) {
  const [tab, setTab] = useState<TabKey>("development");
  const counts = Object.fromEntries(
    TABS.map((t) => [t.key, styles.filter((s) => inTab(s, t.key)).length])
  ) as Record<TabKey, number>;
  const shown = styles.filter((s) => inTab(s, tab));

  return (
    <>
      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={"tab" + (tab === t.key ? " active" : "")}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            <span className="n">{counts[t.key] ?? 0}</span>
          </button>
        ))}
      </div>

      {tab === "evergreen" && shown.length > 0 && (
        <div className="tab-note">
          Blocks the studio remakes. Open one and choose <strong>Repurpose</strong> to copy it into
          a new season — the fit history comes with it, the sample rounds start clean.
        </div>
      )}

      {shown.length === 0 ? (
        <div className="empty">
          {tab === "evergreen" ? (
            <>
              No evergreen styles yet. Tick <strong>Evergreen</strong> on a style you expect to
              remake and it will collect here.
            </>
          ) : (
            <>No styles in {TABS.find((t) => t.key === tab)?.label}. Create one with “+ New Style”.</>
          )}
        </div>
      ) : (
        <div className="grid">
          {shown.map((s) => (
            <Link className="card" key={s.id} href={`/styles/${s.id}`}>
              <div className="imgwrap">
                {s.cover_image ? <img src={s.cover_image} alt={s.name} loading="lazy" /> : null}
              </div>
              <div className="meta">
                <div className="d">{s.name}</div>
                <div className="s">
                  {[s.style_no, s.garment, s.factory].filter(Boolean).join(" · ") || "—"}
                </div>
                <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <StatusBadge s={s.status} />
                  {s.evergreen && <span className="badge ever">Evergreen</span>}
                  {tab === "evergreen" && s.season && <span className="badge">{s.season}</span>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

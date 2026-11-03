"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { runSeed, type SeedId, type SeedStatus } from "@/app/actions/seeds";

// The three imports from 2 November 2026 (see app/actions/seeds.ts). Each row
// says what it brings in, how much of it is still missing, and adds just that.
// Safe to press again: nothing already there — or deleted since — is re-added.
const ABOUT: Record<SeedId, { title: string; detail: string; href: string; unit: string }> = {
  archival: {
    title: "Archival images",
    detail:
      "The 45 cropped Mood images and the SOUS SOUS Image Library from Dropbox (218 images), credited from their file names.",
    href: "/archival",
    unit: "image",
  },
  photographers: {
    title: "Photographers from the creative collaborators deck",
    detail:
      "The 39 creatives on the deck's roster, filed under its five sections, with each slide's look, selected work and research notes. Pictures from the photographer library where it has them.",
    href: "/photographers",
    unit: "row",
  },
  models: {
    title: "Models from the creative collaborators deck",
    detail:
      "The 14 on the deck's model shortlist, plus its two casting references, with age, base, agency and work.",
    href: "/models",
    unit: "row",
  },
};

export default function SeedImports({ statuses }: { statuses: SeedStatus[] }) {
  return (
    <div>
      {statuses.map((s) => (
        <SeedRow key={s.id} status={s} />
      ))}
    </div>
  );
}

function SeedRow({ status }: { status: SeedStatus }) {
  const about = ABOUT[status.id];
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const plural = (n: number) => `${n} ${about.unit}${n === 1 ? "" : "s"}`;

  function run() {
    setMsg(null);
    start(async () => {
      const res = await runSeed(status.id);
      setMsg(res.ok ? `Added ${plural(res.added)}.` : `Stopped: ${res.error}. Pressing again picks up where it left off.`);
      router.refresh();
    });
  }

  return (
    <div className="seed-row">
      <div className="seed-main">
        <div className="seed-title">
          <Link href={about.href}>{about.title}</Link>
        </div>
        <div className="seed-detail">{about.detail}</div>
        <div className="seed-state">
          {status.missing > 0
            ? `${plural(status.missing)} to add`
            : "Everything is in"}
          {status.lastRun && (
            <> · last run {new Date(status.lastRun.at).toLocaleDateString()} by {status.lastRun.by}</>
          )}
        </div>
        {msg && <div className="seed-msg">{msg}</div>}
      </div>
      <button
        type="button"
        className={status.missing > 0 ? "btn sm" : "btn ghost sm"}
        disabled={pending || status.missing === 0}
        onClick={run}
      >
        {pending ? "Adding…" : status.missing > 0 ? `Add ${status.missing}` : "Up to date"}
      </button>
    </div>
  );
}

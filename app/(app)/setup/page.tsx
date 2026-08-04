import Link from "next/link";
import { DEV_BYPASS, DEV_BYPASS_REFUSED, requireUser } from "@/lib/access";
import { PUBLIC_READ_ELEVATED } from "@/lib/supabase/public";
import { anonCanReadPrivateTable } from "@/lib/supabase/probe";
import { readiness, summarize, type Check } from "@/lib/readiness";

export const dynamic = "force-dynamic";

const DOT: Record<Check["state"], { mark: string; color: string; label: string }> = {
  ready: { mark: "●", color: "#8fbf9f", label: "Done" },
  blocked: { mark: "●", color: "var(--danger)", label: "Not yet" },
  manual: { mark: "○", color: "#c8a06a", label: "Check by hand" },
  unknown: { mark: "○", color: "var(--muted)", label: "Could not check" },
};

export default async function SetupPage() {
  await requireUser();

  const checks = readiness({
    devBypassActive: DEV_BYPASS,
    devBypassRefused: DEV_BYPASS_REFUSED,
    hasServiceRoleKey: PUBLIC_READ_ELEVATED,
    anonCanReadPrivateTable: await anonCanReadPrivateTable(),
    hasMailer: Boolean(process.env.RESEND_API_KEY && process.env.NOTIFY_FROM),
    hasImagegen: Boolean(process.env.IMAGE_API_KEY && process.env.IMAGE_API_URL),
  });

  const summary = summarize(checks);
  const gating = checks.filter((c) => c.blocking);
  const optional = checks.filter((c) => !c.blocking);

  return (
    <div style={{ paddingTop: 24, paddingBottom: 80 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 14,
          borderBottom: "1px solid var(--line)",
          paddingBottom: 16,
          marginBottom: 22,
        }}
      >
        <h1 className="serif" style={{ fontSize: 24, margin: 0 }}>
          Setup
        </h1>
        <span className="count">{summary.headline}</span>
      </div>

      <p className="muted-line">
        Everything left before the team gets in is a setting in the Supabase or Vercel dashboard
        rather than a change to this repository. This page checks what it can see and says what it
        cannot — a check the app could not run is never shown as a check that passed.
      </p>

      <div className="section">
        <h3>Before the team gets in</h3>
        {gating.map((c) => (
          <Row key={c.id} check={c} />
        ))}
      </div>

      <div className="section">
        <h3>Complete, waiting on a key</h3>
        <p className="muted-line" style={{ marginBottom: 14 }}>
          Neither of these blocks anything. Both are built, tested and shipped; both fall back to
          something useful rather than failing, and both start working the moment the key exists,
          with no code change.
        </p>
        {optional.map((c) => (
          <Row key={c.id} check={c} />
        ))}
      </div>

      <div className="notice">
        The order matters more than it looks. Preview mode has no Supabase session, so if the
        database policies are closed before real sign-in is working, every page renders empty and it
        looks like the deploy broke. Work down the list in the order it is written.{" "}
        <Link href="/development" style={{ color: "var(--ink)", textDecoration: "underline" }}>
          Back to Development
        </Link>
      </div>
    </div>
  );
}

function Row({ check }: { check: Check }) {
  const dot = DOT[check.state];
  // Same state, different meaning depending on what it is gating. "Check by
  // hand" is right for a blocking step nobody can see from here; on something
  // optional it would imply a chore that is not actually owed.
  const label = !check.blocking && check.state === "manual" ? "Not set up" : dot.label;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "18px 1fr",
        gap: 12,
        padding: "14px 0",
        borderBottom: "1px solid var(--hair)",
        alignItems: "start",
      }}
    >
      <span style={{ color: dot.color, fontSize: 13, lineHeight: "20px" }} title={label}>
        {dot.mark}
      </span>
      <div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14 }}>{check.title}</span>
          <span
            className="badge"
            style={{ color: dot.color, borderColor: dot.color }}
          >
            {label}
          </span>
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6, marginTop: 5, maxWidth: 720 }}>
          {check.detail}
        </div>
        {check.action && (
          <div style={{ fontSize: 12, color: "var(--ink)", lineHeight: 1.6, marginTop: 6, maxWidth: 720 }}>
            {check.action}
          </div>
        )}
        {check.where && (
          <div
            style={{
              fontSize: 10,
              color: "var(--muted)",
              textTransform: "uppercase",
              letterSpacing: ".1em",
              marginTop: 7,
            }}
          >
            {check.where}
          </div>
        )}
      </div>
    </div>
  );
}

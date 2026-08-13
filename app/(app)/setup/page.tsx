import Link from "next/link";
import { DEV_BYPASS, DEV_BYPASS_REFUSED, getSessionUser, requireTeam } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { PUBLIC_READ_ELEVATED } from "@/lib/supabase/public";
import { anonCanReadPrivateTable } from "@/lib/supabase/probe";
import { readiness, type Check } from "@/lib/readiness";
import { loadBrands, checkSuperAdmin } from "@/lib/brandsServer";
import TalentsAdmin, { type Member } from "./TalentsAdmin";
import BrandsAdmin from "./BrandsAdmin";

export const dynamic = "force-dynamic";

const DOT: Record<Check["state"], { mark: string; color: string; label: string }> = {
  ready: { mark: "●", color: "#8fbf9f", label: "Done" },
  blocked: { mark: "●", color: "var(--danger)", label: "Not yet" },
  manual: { mark: "○", color: "#c8a06a", label: "Check by hand" },
  unknown: { mark: "○", color: "var(--muted)", label: "Could not check" },
};

export default async function SetupPage() {
  await requireTeam(); // the go-live checklist is not a talent's concern

  const checks = readiness({
    devBypassActive: DEV_BYPASS,
    devBypassRefused: DEV_BYPASS_REFUSED,
    hasServiceRoleKey: PUBLIC_READ_ELEVATED,
    anonCanReadPrivateTable: await anonCanReadPrivateTable(),
    hasMailer: Boolean(process.env.RESEND_API_KEY && process.env.NOTIFY_FROM),
    hasImagegen: Boolean(process.env.IMAGE_API_KEY && process.env.IMAGE_API_URL),
    // Read individually rather than as a pair, so the page can tell "neither"
    // apart from "one of the two", which is the state that actually confuses
    // people: the dashboard shows a Google variable and the app says there is
    // none.
    hasWipEmail: Boolean((process.env.GOOGLE_SA_EMAIL ?? "").trim()),
    hasWipKey: Boolean((process.env.GOOGLE_SA_PRIVATE_KEY ?? "").trim()),
    // The app cannot see the billing tier, so backups are attested rather than
    // observed. This repo's project is on Supabase Pro with daily backups, so it
    // defaults to confirmed (Tess, 2026-08-11: "default it to confirmed in code
    // for this repo"); set SUPABASE_BACKUPS_CONFIRMED=false to flip it back.
    backupsConfirmed: process.env.SUPABASE_BACKUPS_CONFIRMED !== "false",
  });

  // The "Before the team gets in" go-live checklist has been retired — every
  // gating step (sign-in, bypass off, service-role key, closed RLS, backups) is
  // done and the team is in (Tess, 2026-08-12: "everything on the before the team
  // gets in checklist can be removed since they are completed"). readiness() and
  // its gating checks still exist in lib/readiness.ts if the section is ever
  // wanted back; the page now shows only the optional, key-gated integrations.
  const optional = checks.filter((c) => !c.blocking);

  // The people who are not on the org domain — talents and outside guests.
  const supabase = await createClient();
  const { data: memberRows } = await supabase
    .from("app_allowlist")
    .select("email,role,brand")
    .order("created_at", { ascending: true });
  const members = (memberRows ?? []) as Member[];

  // God mode: only a named super-admin sees the Brands admin (Tess, 2026-08-11).
  const user = await getSessionUser();
  const superAdmin = checkSuperAdmin(user?.email);
  // Loaded for everyone — the talents admin needs it to pin a talent to a brand;
  // only the Brands admin below is super-admin-gated.
  const brands = await loadBrands();

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
        <h1 className="page-title" style={{ margin: 0 }}>
          Setup
        </h1>
        <span className="count">Team &amp; integrations</span>
      </div>

      <p className="muted-line">
        The go-live checklist is done and the team is in. What&rsquo;s left here are the
        integrations that switch on the moment their key is added, and managing who has access.
      </p>

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

      <div className="section">
        <h3>Team &amp; talents</h3>
        <p className="muted-line" style={{ marginBottom: 14 }}>
          Anyone at <strong>@theloyalist.com</strong> is team and sees every brand. Add a brand&rsquo;s
          talent here to give them the ideation side of their one brand — References, Moodboard and
          Campaign — and nothing else. They sign in with the same Google login.
        </p>
        <TalentsAdmin members={members} brands={brands} />
      </div>

      {superAdmin && (
        <div className="section">
          <h3>Brands</h3>
          <p className="muted-line" style={{ marginBottom: 14 }}>
            God mode. Add a brand and it appears in the switcher straight away,
            empty &mdash; no references, styles or moodboards until the team makes
            them. Add its talents in <strong>Team &amp; talents</strong> above.
            The slug (in the URL and on every row) is permanent; only the name can
            be renamed.
          </p>
          <BrandsAdmin brands={brands} />
        </div>
      )}

      <div className="notice">
        Each of these is built and shipped — it falls back to something useful until its key is set,
        and starts working the moment the key exists, with no code change.{" "}
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
          <span style={{ fontSize: "var(--t-body)", fontWeight: "var(--w-title)" }}>{check.title}</span>
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

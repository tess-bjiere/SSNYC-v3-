/**
 * Go-live readiness.
 *
 * The last four things standing between this build and the team using it are not
 * code — they are settings in the Supabase and Vercel dashboards. That is a bad
 * place for a checklist to live, because every one of them fails *quietly*:
 *
 *   - Leave the preview bypass on and the app looks fine, signed in as nobody.
 *   - Close the database policies before signing in for real and every page
 *     renders empty, which looks exactly like a broken deploy.
 *   - Forget the service-role key and the share links 404 the moment the
 *     policies close — but only for the factory, never for you.
 *
 * So the app checks itself and says which ones are done. This module is the
 * judgement half: pure, no imports, no network. The page hands it what it
 * observed and gets back a list a person can read and act on. Keeping the
 * decisions here rather than in the page is what makes them testable, and
 * these are exactly the decisions worth testing.
 */

export type CheckState =
  /** Observed to be in the state it needs to be in. */
  | "ready"
  /** Observed to be in the wrong state. Blocking checks here mean: not yet. */
  | "blocked"
  /** Cannot be observed from inside the app. A human confirms this one. */
  | "manual"
  /** Should have been observable and wasn't — treat as not-confirmed. */
  | "unknown";

export interface Check {
  id: string;
  title: string;
  state: CheckState;
  /** What is true right now. */
  detail: string;
  /** What to do about it, when there is something to do. */
  action?: string;
  /** Where the doing happens, for the ones that are not in this repository. */
  where?: string;
  /** Blocking checks gate the team getting in. The rest are nice to have. */
  blocking: boolean;
}

export interface ReadinessInput {
  /** Whether the login bypass is actually in force for this request. */
  devBypassActive: boolean;
  /** Whether the flag was set to "true" and refused (production deployment). */
  devBypassRefused: boolean;
  /** Whether SUPABASE_SERVICE_ROLE_KEY is present. */
  hasServiceRoleKey: boolean;
  /**
   * Whether a client holding only the public anon key can still read a table
   * no anonymous visitor should ever see. true = policies still open.
   * null = the probe could not be run, which is not the same as "fine".
   */
  anonCanReadPrivateTable: boolean | null;
  /** Whether outbound mail is configured (key and from-address both). */
  hasMailer: boolean;
  /** Whether image generation is configured (key and endpoint both). */
  hasImagegen: boolean;
}

const GATE = "Before the team gets in";

export function readiness(input: ReadinessInput): Check[] {
  const checks: Check[] = [];

  // 1. Sign-in. There is no way to ask Supabase whether the Google provider is
  //    switched on without a service key and an admin call, and guessing would
  //    be worse than saying so. But the bypass tells us something real: while it
  //    is on, nobody has ever actually signed in, so the provider has never been
  //    exercised no matter what the dashboard says.
  checks.push(
    input.devBypassActive
      ? {
          id: "google",
          title: "Google sign-in",
          state: "manual",
          detail:
            "Untested. The login bypass is on, so no one has been through the real sign-in path yet.",
          action:
            "Switch the Google provider on in Supabase, then turn the bypass off and sign in once. If it works you land here; if it does not you land on /not-authorized, which is also useful information.",
          where: "Supabase → Authentication → Providers → Google",
          blocking: true,
        }
      : {
          id: "google",
          title: "Google sign-in",
          state: "ready",
          detail: "In force. This page was reached by a real signed-in session.",
          blocking: true,
        }
  );

  // 2. The bypass itself. Three states, and the middle one is the interesting
  //    one: the flag says "true" on production and the app ignored it. That is
  //    the app doing the right thing, and it is still a setting that lies.
  if (input.devBypassRefused) {
    checks.push({
      id: "bypass",
      title: "Login bypass",
      state: "blocked",
      detail:
        'NEXT_PUBLIC_DEV_BYPASS_AUTH is "true" on a production deployment. The app refused it and real sign-in is in force, so you are not exposed — but the setting disagrees with reality.',
      action: 'Set it to "false" so the next person to read it is not misled.',
      where: "Vercel → Settings → Environment Variables",
      blocking: true,
    });
  } else if (input.devBypassActive) {
    checks.push({
      id: "bypass",
      title: "Login bypass",
      state: "blocked",
      detail:
        'NEXT_PUBLIC_DEV_BYPASS_AUTH is "true". Anyone who opens this deployment is signed in as preview@theloyalist.com without a password.',
      action: 'Set it to "false".',
      where: "Vercel → Settings → Environment Variables",
      blocking: true,
    });
  } else {
    checks.push({
      id: "bypass",
      title: "Login bypass",
      state: "ready",
      detail: "Off. Access requires a real session.",
      blocking: true,
    });
  }

  // 3. The service-role key, which has to be in place BEFORE the policies close
  //    or the share links break. Ordering is the whole point of listing it here
  //    rather than leaving it in a document.
  checks.push(
    input.hasServiceRoleKey
      ? {
          id: "service-key",
          title: "Share-link read path",
          state: "ready",
          detail:
            "SUPABASE_SERVICE_ROLE_KEY is set. /r/[id] and /share/[id] read through it, scoped to the one id in the URL, and will keep working after the policies close.",
          blocking: true,
        }
      : {
          id: "service-key",
          title: "Share-link read path",
          state: "blocked",
          detail:
            "SUPABASE_SERVICE_ROLE_KEY is not set, so the public share pages are reading with the anon key. That works only while the database still trusts anonymous visitors.",
          action:
            "Set it before closing the policies. Do it the other way round and every share link you have sent starts returning Not Found.",
          where: "Supabase → Settings → API (service_role) → paste into Vercel",
          blocking: true,
        }
  );

  // 4. The probe. This is the only check here that asks the database rather than
  //    the environment, and it is the one that matters most.
  if (input.anonCanReadPrivateTable === true) {
    checks.push({
      id: "rls",
      title: "Database policies",
      state: "blocked",
      detail:
        "Open. A client holding nothing but the public key — the one shipped in the browser bundle of every page, and in every share link you have sent — just read the whole reference library from outside any session. The same grant allows writing, and it covers every other table too.",
      action:
        "Read db/p0-rls.sql and run it, after the three above are green. It has the ordering, the before-and-after checks, and a one-paste rollback.",
      where: "Supabase → SQL Editor",
      blocking: true,
    });
  } else if (input.anonCanReadPrivateTable === false) {
    checks.push({
      id: "rls",
      title: "Database policies",
      state: "ready",
      detail:
        "Closed. The public key, used from outside any session, could not read the reference library. Data now requires a signed-in user.",
      action:
        "Worth confirming the six manual checks at the bottom of db/p0-rls.sql, particularly the two share links while signed out.",
      blocking: true,
    });
  } else {
    checks.push({
      id: "rls",
      title: "Database policies",
      state: "unknown",
      detail:
        "The check could not run — the app could not reach Supabase with the public key. That is not the same as being closed.",
      action: "Reload this page from a machine that can reach the database.",
      blocking: true,
    });
  }

  // 5. Backups. Nothing in the app can see the billing tier, and the one asset
  //    here that cannot be rebuilt is the data.
  checks.push({
    id: "backups",
    title: "Daily backups",
    state: "manual",
    detail:
      "Not visible from inside the app. The free tier does not take them, and the references are the one thing here that could not be rebuilt.",
    action: "Move the project to Pro.",
    where: "Supabase → Settings → Billing",
    blocking: true,
  });

  // 6 and 7. Optional. Both are complete builds waiting on a credential, and
  //    both degrade on purpose rather than breaking, so neither gates go-live.
  checks.push(
    input.hasMailer
      ? {
          id: "mail",
          title: "Notification emails",
          state: "ready",
          detail: "Configured. Mail is being sent.",
          blocking: false,
        }
      : {
          id: "mail",
          title: "Notification emails",
          state: "manual",
          detail:
            "Composed and logged instead of sent. Everything works except delivery, so nothing is lost in the meantime.",
          action: "Set RESEND_API_KEY and NOTIFY_FROM to start delivery. No code changes.",
          where: "Vercel → Settings → Environment Variables",
          blocking: false,
        }
  );

  checks.push(
    input.hasImagegen
      ? {
          id: "imagegen",
          title: "AI variation images",
          state: "ready",
          detail: "Configured. The Generate button will call out for a picture.",
          action:
            "Worth one test run — the request body has never been sent to a live endpoint, so it may need adjusting once in lib/imagegen.ts.",
          blocking: false,
        }
      : {
          id: "imagegen",
          title: "AI variation images",
          state: "manual",
          detail:
            "Not configured. Variations still produce the written brief, save to version history and flag as AI — the picture is the part that is missing.",
          action: "Set IMAGE_API_KEY and IMAGE_API_URL. No code changes.",
          where: "Vercel → Settings → Environment Variables",
          blocking: false,
        }
  );

  return checks;
}

export interface ReadinessSummary {
  /** Blocking checks the app observed to be right. */
  ready: number;
  /** Blocking checks total. */
  total: number;
  /** Blocking checks observed to be wrong, or that should have been observable and weren't. */
  outstanding: number;
  /** Blocking checks nothing in the app can see. A person confirms these. */
  toConfirm: number;
  /** True when nothing the app can check is wrong. Not the same as "done". */
  clear: boolean;
  /** One line for the top of the page. */
  headline: string;
}

/**
 * Two counts, not one, because they mean different things.
 *
 * A check that came back wrong is a thing to go and fix. A check the app cannot
 * see — whether the billing tier includes backups — is a thing to go and look
 * at. Folding them into a single number would mean either calling an unseen
 * check green, which makes the whole list decorative, or leaving a permanent
 * red that never clears no matter what you do, which teaches you to ignore it.
 * Both failure modes end the same way: nobody reads the checklist.
 */
export function summarize(checks: Check[]): ReadinessSummary {
  const gating = checks.filter((c) => c.blocking);
  const total = gating.length;
  const ready = gating.filter((c) => c.state === "ready").length;
  const toConfirm = gating.filter((c) => c.state === "manual").length;
  const outstanding = gating.filter((c) => c.state === "blocked" || c.state === "unknown").length;

  let headline: string;
  if (outstanding > 0) {
    headline = `${GATE}: ${ready} of ${total} confirmed, ${outstanding} to go.`;
  } else if (toConfirm > 0) {
    headline = `${GATE}: nothing left that the app can check. ${toConfirm} for you to confirm by hand.`;
  } else {
    headline = `${GATE}: all ${total} confirmed.`;
  }

  return { ready, total, outstanding, toConfirm, clear: outstanding === 0, headline };
}

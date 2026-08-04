import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/access";
import { mailConfigured, readPrefs } from "@/app/actions/notify";
import PrefsForm from "./PrefsForm";

export const dynamic = "force-dynamic";

// Your own notification switches (P4).
//
// Personal settings, not studio settings — so this hangs off the email in the
// nav rather than taking a sixth top-level tab. Everyone is subscribed until
// they say otherwise, which is why this page has to be easy to find: a default
// that can't be turned off is just spam with extra steps.
export default async function NotificationsPage() {
  const user = await getSessionUser();
  if (!user?.email) redirect("/login");

  const [prefs, configured] = await Promise.all([readPrefs(), mailConfigured()]);
  const mine = prefs[user.email.toLowerCase()] ?? {};

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">Notifications</h1>
        <div className="spacer" />
        <span className="count">{user.email}</span>
      </div>

      {!configured && (
        <div className="notice">
          No email provider is connected yet, so nothing is being delivered. Your choices here are
          saved and will apply the moment one is. (Set <code>RESEND_API_KEY</code> and{" "}
          <code>NOTIFY_FROM</code> in the Vercel environment.)
        </div>
      )}

      <p className="muted-line">
        You&rsquo;ll hear about styles you created and styles you&rsquo;ve commented on. You are
        never emailed about your own actions.
      </p>

      <PrefsForm initial={mine} />

      <p className="muted-line">
        Prefer a different mix? <Link href="/development">Back to Development</Link>
      </p>
    </div>
  );
}

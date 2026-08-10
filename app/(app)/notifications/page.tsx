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

      {/* One line, not two paragraphs. Which styles you hear about is worth
          saying once because it is not visible anywhere else; "back to
          Development" is what the nav is for. */}
      <p className="muted-line">
        Styles you created or commented on. Never your own actions.
      </p>

      <PrefsForm initial={mine} />
    </div>
  );
}

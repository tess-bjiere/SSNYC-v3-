import { redirect } from "next/navigation";
import { getSessionUser, DEV_BYPASS, DEV_BYPASS_REFUSED } from "@/lib/access";
import Nav from "./Nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <>
      <Nav email={user.email} />
      {DEV_BYPASS && (
        <div className="wrap" style={{ paddingTop: 12 }}>
          <div className="notice">
            Preview mode (NEXT_PUBLIC_DEV_BYPASS_AUTH=true): login is bypassed. Set it to
            &quot;false&quot; and configure Google sign-in for real access control.
          </div>
        </div>
      )}
      {/* The flag was left on in production and refused. Saying so is the
          point — a security setting that quietly does the opposite of what the
          dashboard says it does is worse than one that is simply wrong. */}
      {DEV_BYPASS_REFUSED && (
        <div className="wrap" style={{ paddingTop: 12 }}>
          <div className="notice">
            NEXT_PUBLIC_DEV_BYPASS_AUTH is set to &quot;true&quot; on a production deployment and has
            been ignored. Real sign-in is in force. Set it to &quot;false&quot; to clear this notice.
          </div>
        </div>
      )}
      <main className="wrap">{children}</main>
    </>
  );
}

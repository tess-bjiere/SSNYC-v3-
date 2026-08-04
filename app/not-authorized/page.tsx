export default function NotAuthorized() {
  return (
    <div className="login-wrap">
      <div className="login-brand">SSYNC</div>
      <div className="login-sub">
        That account isn&apos;t authorized yet. Access is limited to theloyalist.com accounts and
        approved guests. Ask an admin to add your email to the allowlist, then sign in again.
      </div>
      <a className="btn ghost" href="/login">
        Back to sign in
      </a>
    </div>
  );
}

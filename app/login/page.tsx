"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function signIn() {
    setBusy(true);
    setErr(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { access_type: "offline", prompt: "select_account" },
      },
    });
    if (error) {
      setErr(error.message);
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-brand">SSYNC</div>
      <div className="login-sub">
        SOUS SOUS reference library &amp; style development tool. Sign in with your
        theloyalist.com Google account, or a guest account that&apos;s been added to the allowlist.
      </div>
      <button className="btn" onClick={signIn} disabled={busy}>
        {busy ? "Redirecting…" : "Sign in with Google"}
      </button>
      {err && <div style={{ color: "var(--danger)", fontSize: 12 }}>{err}</div>}
    </div>
  );
}

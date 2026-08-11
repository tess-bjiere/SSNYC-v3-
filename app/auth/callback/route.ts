import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser, isEmailAllowed } from "@/lib/access";

// OAuth redirect target: exchanges the code for a session, then enforces the allowlist.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (await isEmailAllowed(user?.email)) {
        // A talent opens on References, their home; team opens on Development
        // (Tess, 2026-08-11).
        const me = await getSessionUser();
        const home = me?.role === "talent" ? "/library" : "/development";
        return NextResponse.redirect(`${origin}${home}`);
      }
      // Signed in with Google but not on the allowlist — sign back out.
      await supabase.auth.signOut();
      return NextResponse.redirect(`${origin}/not-authorized`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}

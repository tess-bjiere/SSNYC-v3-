import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isEmailAllowed } from "@/lib/access";

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
        return NextResponse.redirect(`${origin}/development`);
      }
      // Signed in with Google but not on the allowlist — sign back out.
      await supabase.auth.signOut();
      return NextResponse.redirect(`${origin}/not-authorized`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}

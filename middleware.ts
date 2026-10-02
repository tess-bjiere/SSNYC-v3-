import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { APP } from "@/lib/appConfig";

// Product and Sourcing route prefixes. On an ideation-only deploy (the Loyalist's
// SOUS SOUS / Renggli accounts — Tess, 2026-10-01: "hide product and sourcing
// functionality") the nav hides these, and anything that still hits one of them
// — a typed URL, a stale bookmark, an old share link — is sent back to the
// References library rather than reaching a page the deploy has turned off.
const PRODUCT_PATHS = [
  "/development",
  "/factories",
  "/style-library",
  "/linesheets",
  "/fitting-deck",
  "/styles",
  "/photography",
  "/materials",
  "/material-orders",
  "/quotes",
  "/color-standards",
];

export async function middleware(request: NextRequest) {
  const response = await updateSession(request);

  if (APP.ideationOnly) {
    const path = request.nextUrl.pathname;
    if (PRODUCT_PATHS.some((prefix) => path === prefix || path.startsWith(prefix + "/"))) {
      const url = request.nextUrl.clone();
      url.pathname = "/library";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    // Run on all paths except static assets and image files.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

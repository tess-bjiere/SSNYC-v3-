import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/access";

export const dynamic = "force-dynamic";

// A talent has no product side, so they open on References — their home
// (Tess, 2026-08-11: "mobile app should open on references in talent view").
// Team opens on Development. A signed-out visitor lands on /development, whose
// layout bounces them to /login.
export default async function Home() {
  const user = await getSessionUser();
  redirect(user?.role === "talent" ? "/library" : "/development");
}

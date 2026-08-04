"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/development", label: "Development" },
  { href: "/factories", label: "Factories" },
  { href: "/photography", label: "Photography" },
  { href: "/moodboard", label: "Moodboard" },
  { href: "/library", label: "Library" },
  { href: "/editorial", label: "Editorial" },
];

export default function Nav({ email }: { email: string }) {
  const pathname = usePathname();
  return (
    <nav className="nav">
      <Link href="/development" className="brand">
        SSYNC
      </Link>
      <div className="nav-links">
        {LINKS.map((l) => {
          const active = pathname === l.href || pathname.startsWith(l.href + "/");
          return (
            <Link key={l.href} href={l.href} className={"nav-link" + (active ? " active" : "")}>
              {l.label}
            </Link>
          );
        })}
      </div>
      <div className="nav-right">
        <Link href="/styles/new" className="btn sm">
          + New Style
        </Link>
        {/* Setup is not a feature, so it does not get a tab — but it needs to be
            reachable without remembering a URL, because the things on it are the
            things standing between this and the team using it. */}
        <Link href="/setup" className="nav-link" title="Go-live checklist">
          Setup
        </Link>
        {/* Personal settings hang off your own name rather than taking a tab. */}
        <Link href="/notifications" className="who" title="Notification settings">
          {email}
        </Link>
        <form action="/auth/signout" method="post">
          <button className="btn ghost sm" type="submit">
            Sign out
          </button>
        </form>
      </div>
    </nav>
  );
}

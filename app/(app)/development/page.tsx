import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Style } from "@/lib/types";
import { MOCK, mockStyles } from "@/lib/mock";
import DevTabs from "./DevTabs";

export const dynamic = "force-dynamic";

export default async function DevelopmentPage() {
  let styles: Style[] = [];
  if (MOCK) {
    styles = mockStyles;
  } else {
    const supabase = await createClient();
    const { data } = await supabase
      .from("styles")
      .select("*")
      .order("updated_at", { ascending: false });
    styles = (data ?? []) as Style[];
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title serif">Development</h1>
        <span className="count">
          {styles.length} {styles.length === 1 ? "style" : "styles"}
        </span>
        <div className="spacer" />
        <Link href="/styles/new" className="btn sm">
          + New Style
        </Link>
      </div>
      <DevTabs styles={styles} />
    </div>
  );
}

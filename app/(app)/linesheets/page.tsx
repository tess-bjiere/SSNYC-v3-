import Link from "next/link";
import { requireTeam } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { activeBrand } from "@/lib/activeBrand";
import { MOCK, mockLinesheets } from "@/lib/mock";
import { normalizeItems, normalizeKind, LINESHEET_KINDS, type LinesheetKind } from "@/lib/linesheet";
import { createLinesheet } from "@/app/actions/linesheets";

export const dynamic = "force-dynamic";

// The linesheets index (Tess, 2026-08-12: "add a linesheet functionality to the
// product side ... for the season or evergreen"). Two groups, Seasonal and
// Evergreen, and a one-line create form. Team only, like the rest of the product
// side.
//
// The select("*") tolerates the linesheets table not existing yet (before
// db/p10-linesheets.sql is run) — data comes back null, the list is empty, and
// nothing errors, the same graceful path the colour palette takes.

type Row = {
  id: string;
  name: string;
  kind: string;
  subtitle?: string | null;
  season?: string | null; // legacy — read as a fallback for the subtitle
  items: unknown;
  updated_at?: string | null;
};

export default async function LinesheetsPage() {
  await requireTeam();
  const brand = await activeBrand();

  let rows: Row[] = [];
  if (MOCK) {
    rows = mockLinesheets as unknown as Row[];
  } else {
    const supabase = await createClient();
    const { data } = await supabase
      .from("linesheets")
      .select("*")
      .eq("brand", brand)
      .is("deleted_at", null)
      .eq("archived", false)
      .order("updated_at", { ascending: false });
    rows = (data ?? []) as Row[];
  }

  const byKind = (k: LinesheetKind) => rows.filter((r) => normalizeKind(r.kind) === k);

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title display">Linesheets</h1>
      </div>

      {LINESHEET_KINDS.map((k) => {
        const list = byKind(k.key);
        return (
          <section className="ls-group" key={k.key}>
            <h2>{k.label}</h2>
            {list.length > 0 && (
              <div className="ls-list">
                {list.map((r) => {
                  const count = normalizeItems(r.items).length;
                  const meta = [r.subtitle ?? r.season, `${count} ${count === 1 ? "style" : "styles"}`]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <Link key={r.id} href={`/linesheets/${r.id}`} className="ls-card">
                      <span className="ls-card-name">{r.name}</span>
                      <span className="ls-card-meta">{meta}</span>
                    </Link>
                  );
                })}
              </div>
            )}
            {/* Create into this section — the kind is implied by which section you
                create from, so there is no kind dropdown (Tess, 2026-08-12). The
                optional subhead field rides on both kinds now. */}
            <form action={createLinesheet} className="ls-new">
              <input type="hidden" name="kind" value={k.key} />
              <input
                className="input sm ls-new-name"
                name="name"
                placeholder={`New ${k.label.toLowerCase()} linesheet…`}
                autoComplete="off"
                required
              />
              <input
                className="input sm ls-new-subtitle"
                name="subtitle"
                placeholder="Small subhead text"
                autoComplete="off"
              />
              <button className="btn sm" type="submit">
                + New
              </button>
            </form>
          </section>
        );
      })}
    </div>
  );
}

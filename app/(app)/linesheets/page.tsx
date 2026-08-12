import Link from "next/link";
import { requireTeam } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { activeBrand } from "@/lib/activeBrand";
import { MOCK, mockLinesheets } from "@/lib/mock";
import { normalizeItems, normalizeKind, LINESHEET_KINDS, type LinesheetKind } from "@/lib/linesheet";
import { createLinesheet } from "@/app/actions/linesheets";
import Select from "@/app/components/Select";

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
  season: string | null;
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

      <form action={createLinesheet} className="ls-new">
        <input
          className="input sm ls-new-name"
          name="name"
          placeholder="New linesheet name…"
          autoComplete="off"
          required
        />
        <Select
          name="kind"
          defaultValue="seasonal"
          className="select sm"
          options={LINESHEET_KINDS.map((k) => ({ value: k.key, label: k.label }))}
          aria-label="Linesheet kind"
        />
        <input
          className="input sm ls-new-season"
          name="season"
          placeholder="Season (optional)"
          autoComplete="off"
        />
        <button className="btn sm" type="submit">
          + New linesheet
        </button>
      </form>

      {LINESHEET_KINDS.map((k) => {
        const list = byKind(k.key);
        return (
          <section className="ls-group" key={k.key}>
            <h2>{k.label}</h2>
            {list.length === 0 ? (
              <p className="ls-empty">No {k.label.toLowerCase()} linesheets yet.</p>
            ) : (
              <div className="ls-list">
                {list.map((r) => {
                  const count = normalizeItems(r.items).length;
                  const meta = [r.season, `${count} ${count === 1 ? "style" : "styles"}`]
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
          </section>
        );
      })}
    </div>
  );
}

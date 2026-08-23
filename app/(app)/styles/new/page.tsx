import Select from "@/app/components/Select";
import Link from "next/link";
import { requireTeam } from "@/lib/access";
import { createStyle } from "@/app/actions/styles";
import GarmentField from "@/app/components/GarmentField";
import { STYLE_STATUSES, STYLE_STATUS_LABELS, STYLE_CATEGORIES } from "@/lib/types";
import { APP } from "@/lib/appConfig";
import { createClient } from "@/lib/supabase/server";
import { activeBrand } from "@/lib/activeBrand";
import FredStyleNumberFields from "./FredStyleNumberFields";

export const dynamic = "force-dynamic";

export default async function NewStylePage() {
  await requireTeam(); // product side, team only
  // FRED doesn't use Season or WIP on a style (Tess, 2026-08-20), so the new-style
  // form omits them there; SOUS SOUS and Renggli keep them.
  const isFred = APP.id === "fred";

  // FRED auto-generates the style number, so the form previews the next one live.
  // Load every number already in use (retired styles included — FRED numbers are
  // never reused) to read the next in each code.
  let fredNumbers: string[] = [];
  if (isFred) {
    const supabase = await createClient();
    const brand = await activeBrand();
    const { data } = await supabase
      .from("styles")
      .select("style_no")
      .eq("brand", brand)
      .not("style_no", "is", null);
    fredNumbers = (data ?? []).map((r) => (r as { style_no: string | null }).style_no ?? "");
  }
  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title display">New Style</h1>
        <div className="spacer" />
        <Link href="/development" className="btn link">
          Cancel
        </Link>
      </div>

      <form action={createStyle} style={{ maxWidth: 720 }}>
        <div className="field">
          <label>Style name *</label>
          <input className="input" name="name" required placeholder="e.g. Cropped Rib Tank" />
        </div>

        {/* On FRED the style number is auto-generated from the category, so the
            two fields travel together and preview live (Tess, 2026-08-20).
            Elsewhere the number is a plain field the user types. */}
        {isFred ? (
          <>
            <FredStyleNumberFields existing={fredNumbers} />
            <div className="row">
              <div className="field">
                <label>Status</label>
                <Select
                  className="select"
                  name="status"
                  aria-label="Status"
                  defaultValue="development"
                  options={STYLE_STATUSES.map((s) => ({ value: s, label: STYLE_STATUS_LABELS[s] }))}
                />
              </div>
              <div className="field" />
            </div>
          </>
        ) : (
          <div className="row">
            <div className="field">
              <label>Style number</label>
              <input className="input" name="style_no" placeholder="SS-1042" />
            </div>
            <div className="field">
              <label>Status</label>
              {/* The label, not the key. The status values are lowercase in
                  the database and stay that way; this was the last dropdown
                  still showing them raw. */}
              <Select
                className="select"
                name="status"
                aria-label="Status"
                defaultValue="development"
                options={STYLE_STATUSES.map((s) => ({ value: s, label: STYLE_STATUS_LABELS[s] }))}
              />
            </div>
          </div>
        )}

        <div className="row3">
          {/* On FRED, Category and Type live up in the style-number row (all three
              generate the number together), so only fabric/material sit here.
              Elsewhere Category and Garment are the usual free picklists. */}
          {!isFred && (
            <>
              <div className="field">
                <label>Category</label>
                {/* Category is a fixed set of broad buckets now, not free text, so a
                    jacket is filed under Outerwear rather than under a category of
                    its own (Tess, 2026-08-09). Optional — the leading "—" leaves it
                    unset. */}
                <Select
                  className="select"
                  name="category"
                  aria-label="Category"
                  defaultValue=""
                  options={[{ value: "", label: "—" }, ...STYLE_CATEGORIES.map((c) => ({ value: c, label: c }))]}
                />
              </div>
              <div className="field">
                <label>Garment</label>
                {/* The specific type under the category (Tess, 2026-08-09: "garment
                    should be a picklist too"), with an Other escape for the long
                    tail. Optional. */}
                <GarmentField />
              </div>
            </>
          )}
          <div className="field">
            <label>Fabric type</label>
            <input className="input" name="fabric" placeholder="e.g. jersey" />
          </div>
          <div className="field">
            <label>Material</label>
            <input className="input" name="material" placeholder="e.g. 100% cotton" />
          </div>
        </div>

        <div className="row3">
          {/* Season is not used on FRED (Tess, 2026-08-20). */}
          {!isFred && (
            <div className="field">
              <label>Season</label>
              <input className="input" name="season" placeholder="SS27" />
            </div>
          )}
          <div className="field">
            <label>Designer</label>
            <input className="input" name="designer" />
          </div>
          <div className="field">
            <label>Factory</label>
            <input className="input" name="factory" />
          </div>
        </div>

        <div className="field">
          <label>Cover image URL</label>
          <input className="input" name="cover_image" placeholder="https://…" />
        </div>

        <div className="row">
          <div className="field">
            <label>Tech pack link</label>
            <input className="input" name="tech_pack_url" placeholder="https://… (Drive, Dropbox, etc.)" />
          </div>
          {/* The live working folder, beside the specification it works from.
              Not used on FRED (Tess, 2026-08-20). */}
          {!isFred && (
            <div className="field">
              <label>WIP link</label>
              <input className="input" name="wip_url" placeholder="https://… the live working folder" />
            </div>
          )}
        </div>

        <div className="field">
          <label>Notes</label>
          <textarea className="textarea" name="notes" />
        </div>

        <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 20 }}>
          <input type="checkbox" name="evergreen" /> <span>Evergreen style</span>
        </label>

        <button className="btn" type="submit">
          Create style
        </button>
      </form>
    </div>
  );
}

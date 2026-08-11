import Select from "@/app/components/Select";
import Link from "next/link";
import { requireTeam } from "@/lib/access";
import { createStyle } from "@/app/actions/styles";
import GarmentField from "@/app/components/GarmentField";
import { STYLE_STATUSES, STYLE_STATUS_LABELS, STYLE_CATEGORIES } from "@/lib/types";

export default async function NewStylePage() {
  await requireTeam(); // product side, team only
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

        <div className="row3">
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
          <div className="field">
            <label>Season</label>
            <input className="input" name="season" placeholder="SS27" />
          </div>
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
          {/* The live working folder, beside the specification it works from. */}
          <div className="field">
            <label>WIP link</label>
            <input className="input" name="wip_url" placeholder="https://… the live working folder" />
          </div>
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

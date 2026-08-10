import Select from "@/app/components/Select";
import Link from "next/link";
import { createStyle } from "@/app/actions/styles";
import { STYLE_STATUSES, STYLE_STATUS_LABELS } from "@/lib/types";

export default function NewStylePage() {
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
            <input className="input" name="category" />
          </div>
          <div className="field">
            <label>Garment</label>
            <input className="input" name="garment" />
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

"use client";

import { useState, useTransition } from "react";
import { addBrand, renameBrand, setBrandLogo } from "@/app/actions/brands";
import { toBrandSlug, type Brand } from "@/lib/brands";

// God-mode brand management (Tess, 2026-08-11). Shown only to a super-admin.
// Add a brand — it starts empty, with no references, styles or moodboards — and
// rename one. No delete: a brand with data must not vanish. The slug is derived
// from the name and, once set, is permanent (rows carry it); only the display
// name changes.
export default function BrandsAdmin({ brands }: { brands: Brand[] }) {
  const [name, setName] = useState("");
  const slug = toBrandSlug(name);

  return (
    <div>
      <table className="talents-table">
        <tbody>
          {brands.map((b) => (
            <BrandRow key={b.slug} brand={b} />
          ))}
        </tbody>
      </table>

      <form action={addBrand} className="talents-add">
        <input
          className="input sm"
          name="name"
          placeholder="New brand name"
          aria-label="Brand name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        {/* Show the slug the name will become, since it is permanent. */}
        <span className="brands-slug">{slug ? `/${slug}` : "—"}</span>
        <button className="btn sm" type="submit">
          Add brand
        </button>
      </form>
    </div>
  );
}

function BrandRow({ brand }: { brand: Brand }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(brand.name);
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      await renameBrand(brand.slug, name);
      setEditing(false);
    });
  }

  return (
    <tr>
      <td className="talents-email">
        {editing ? (
          <input
            className="input sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Brand name"
          />
        ) : (
          brand.name
        )}
      </td>
      <td className="talents-brand">/{brand.slug}</td>
      {/* The logo rides onto deck / PDF export covers (Tess, 2026-08-11).
          Choosing a file uploads it straight away. */}
      <td className="brands-logo">
        <form action={setBrandLogo.bind(null, brand.slug)}>
          <label className="brand-logo-pick">
            {brand.logo_url ? (
              <img src={brand.logo_url} alt="" className="brand-logo-thumb" />
            ) : (
              <span className="brand-logo-empty">No logo</span>
            )}
            <span className="brand-logo-action">{brand.logo_url ? "Replace" : "Upload logo"}</span>
            <input
              type="file"
              name="logo"
              accept="image/*"
              hidden
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
            />
          </label>
        </form>
      </td>
      <td className="talents-remove">
        {editing ? (
          <>
            <button className="btn link sm" onClick={save} disabled={pending}>
              Save
            </button>
            <button
              className="btn link sm"
              onClick={() => {
                setName(brand.name);
                setEditing(false);
              }}
            >
              Cancel
            </button>
          </>
        ) : (
          <button className="btn link sm" onClick={() => setEditing(true)}>
            Rename
          </button>
        )}
      </td>
    </tr>
  );
}

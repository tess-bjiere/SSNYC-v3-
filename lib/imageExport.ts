// Naming for the "Download images" export (Tess, 2026-09-28: "how do i export a
// folder of all the images in the reference library?"). The fetching, zipping
// and download all happen in the browser (see LibraryClient + lib/zip.writeZip);
// only the naming decisions live here, where they can be tested — a folder of
// UUIDs is useless, a folder of `free-city_2020s_tank.jpg` is browsable.

/** A filesystem-safe slug: accents stripped, lowercased, runs of junk → one -. */
export function slugify(s: string | null | undefined): string {
  return (s || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['"’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** The image extension from a stored URL (".../full.png" → "png"); jpg default.
 *  Only real image extensions are trusted — a query string or odd path falls
 *  back to jpg rather than inventing an extension. */
export function extFromUrl(url: string | null | undefined): string {
  const m = /\.([a-z0-9]{2,5})(?:\?|#|$)/i.exec(url || "");
  const e = m ? m[1].toLowerCase() : "";
  if (e === "jpeg") return "jpg";
  return /^(jpg|png|webp|gif|avif)$/.test(e) ? e : "jpg";
}

/** A unique, readable filename for one reference's image inside the zip. Built
 *  from the tags that identify it; `taken` carries the names already used so two
 *  "Free City" references don't collide (the second becomes ...-2). */
export function refImageName(
  parts: {
    designer?: string | null;
    year?: string | null;
    garment?: string | null;
    color?: string | null;
  },
  ext: string,
  taken: Set<string>
): string {
  const base =
    [parts.designer, parts.year, parts.garment, parts.color]
      .map((p) => slugify(p))
      .filter(Boolean)
      .join("_") || "reference";
  let name = `${base}.${ext}`;
  let i = 2;
  while (taken.has(name)) name = `${base}-${i++}.${ext}`;
  taken.add(name);
  return name;
}

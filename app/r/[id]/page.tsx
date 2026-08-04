import { notFound } from "next/navigation";
import { createPublicReadClient } from "@/lib/supabase/public";
import { refImage, extraImageUrls, type Reference } from "@/lib/types";

export const dynamic = "force-dynamic";

// Public, read-only view of a single reference card — no login required.
export default async function SharedReference({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Scoped to the one id in the URL, and read-only. See lib/supabase/public.ts.
  const supabase = await createPublicReadClient();

  const { data } = await supabase
    .from("references")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) notFound();
  const r = data as Reference;

  const images = [refImage(r), ...extraImageUrls(r)].filter(Boolean);

  const rows: [string, string | null][] = [
    ["Year", r.year],
    ["Season", r.season],
    ["Category", r.category],
    ["Garment", r.garment],
    ["Fabric", r.fabric],
    ["Price point", r.price],
    ["Photographer", [r.photographer, r.photographer_ig].filter(Boolean).join(" · ") || null],
    ["Model", r.model],
    ["Location", r.location],
    ["Notes", r.notes],
  ];

  return (
    <div className="wrap" style={{ paddingTop: 24, paddingBottom: 80 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, borderBottom: "1px solid var(--line)", paddingBottom: 16, marginBottom: 24 }}>
        <span className="brand">SSYNC</span>
        <span className="count">Shared reference · view only</span>
      </div>

      <div className="detail-grid" style={{ border: "1px solid var(--line)" }}>
        <div className="detail-imgs">
          <div className="detail-main">{images[0] ? <img src={images[0]} alt={r.designer || ""} /> : null}</div>
          {images.length > 1 && (
            <div className="detail-thumbs">
              {images.slice(1).map((im, i) => (
                <span className="detail-thumb" key={i}>
                  <img src={im} alt="" />
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="detail-info">
          <div className="detail-head">
            <h2 className="serif">{r.designer || "Reference"}</h2>
            {r.year && <div className="yr">{r.year}</div>}
          </div>

          <div className="detail-rows">
            {rows.map(([k, v]) =>
              v ? (
                <div className="detail-row" key={k}>
                  <span className="k">{k}</span>
                  <span className="v">{v}</span>
                </div>
              ) : null
            )}
            {r.color && (
              <div className="detail-row">
                <span className="k">Color</span>
                <span className="v" style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
                  {r.color_hex && (
                    <span style={{ width: 16, height: 16, background: r.color_hex, border: "1px solid var(--line)", display: "inline-block" }} />
                  )}
                  {r.color}
                </span>
              </div>
            )}
          </div>

          {r.link && (
            <div className="view-product">
              <a href={r.link} target="_blank" rel="noreferrer">View product ↗</a>
            </div>
          )}

          {r.created_by && <div className="detail-savedby">Saved by {r.created_by}</div>}
        </div>
      </div>
    </div>
  );
}

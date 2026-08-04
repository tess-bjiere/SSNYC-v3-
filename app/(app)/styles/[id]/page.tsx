import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  STYLE_STATUSES,
  refThumb,
  type Style,
  type StyleVersion,
  type StyleSample,
  type StyleComment,
  type Reference,
} from "@/lib/types";
import {
  updateStyle,
  setStatus,
  addVersion,
  addComment,
  markCommentReceived,
  repurposeStyle,
} from "@/app/actions/styles";
import { unlinkReferenceForm } from "@/app/actions/styleRefs";
import { normalizePhotos } from "@/lib/photoSlots";
import { isImageGenConfigured } from "@/lib/imagegen";
import PhotoSlots from "./PhotoSlots";
import SampleRounds from "./SampleRounds";
import Variations from "./Variations";
import { MOCK, mockStyleBundle } from "@/lib/mock";

// Today as a plain calendar day in the studio's timezone, decided once on the
// server. The sample-cycle arithmetic is pure and takes this as an argument, so
// "late" means late in New York rather than late in UTC — which would tip over
// five hours early every evening.
function studioToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

// The columns the "Developed from" strip needs. Narrow on purpose — this page
// only ever reads a linked reference, never writes one.
type LinkedRef = Pick<
  Reference,
  "id" | "designer" | "year" | "season" | "garment" | "image_url" | "image" | "thumb_url" | "thumb" | "deleted_at"
>;

export const dynamic = "force-dynamic";

export default async function StyleProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let st: Style;
  let vs: StyleVersion[];
  let sm: StyleSample[];
  let cm: StyleComment[];
  let refs: LinkedRef[] = [];

  if (MOCK) {
    const b = mockStyleBundle(id);
    st = b.style;
    vs = b.versions;
    sm = b.samples;
    cm = b.comments;
  } else {
    const supabase = await createClient();
    const { data: style } = await supabase.from("styles").select("*").eq("id", id).maybeSingle();
    if (!style) notFound();
    st = style as Style;

    const [{ data: versions }, { data: samples }, { data: comments }] = await Promise.all([
      supabase.from("style_versions").select("*").eq("style_id", id).order("version_no", { ascending: false }),
      supabase.from("style_samples").select("*").eq("style_id", id).order("created_at", { ascending: true }),
      supabase.from("style_comments").select("*").eq("style_id", id).order("created_at", { ascending: false }),
    ]);

    vs = (versions ?? []) as StyleVersion[];
    sm = (samples ?? []) as StyleSample[];
    cm = (comments ?? []) as StyleComment[];

    // The references this style is being developed from. Two queries rather than
    // a PostgREST embed so the join table needs no relationship metadata and a
    // reference that has since been trashed still comes back — it is shown with
    // a note instead of vanishing, so the provenance is never silently lost.
    const { data: links } = await supabase
      .from("style_references")
      .select("reference_id,created_at")
      .eq("style_id", id)
      .order("created_at", { ascending: true });

    const refIds = (links ?? []).map((l) => l.reference_id as string).filter(Boolean);
    if (refIds.length) {
      const { data: refRows } = await supabase
        .from("references")
        .select("id,designer,year,season,garment,image_url,image,thumb_url,thumb,deleted_at")
        .in("id", refIds);
      const byId = new Map((refRows ?? []).map((r) => [r.id as string, r as LinkedRef]));
      refs = refIds.map((rid) => byId.get(rid)).filter(Boolean) as LinkedRef[];
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <Link href="/development" className="count">
          ← Development
        </Link>
        <div className="spacer" />
        {/* The whole history on one page, black on white, ready to paste into a
            Google Doc or print. See lib/styleExport.ts. */}
        <Link href={`/styles/${id}/export`} className="btn ghost sm">
          Export history
        </Link>
      </div>

      <div className="profile">
        <div>
          <div className="cover">
            {st.cover_image ? <img src={st.cover_image} alt={st.name} /> : null}
          </div>

          {/* Quick status control */}
          <div className="section" style={{ marginTop: 18 }}>
            <h3>Status</h3>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {STYLE_STATUSES.map((s) => (
                <form key={s} action={setStatus.bind(null, st.id, s)}>
                  <button
                    className={"btn sm " + (st.status === s ? "" : "ghost")}
                    type="submit"
                  >
                    {s}
                  </button>
                </form>
              ))}
            </div>
            {st.tech_pack_url && (
              <a
                className="btn ghost sm"
                href={st.tech_pack_url}
                target="_blank"
                rel="noreferrer"
                style={{ marginTop: 12 }}
              >
                Open tech pack ↗
              </a>
            )}
          </div>
        </div>

        <div>
          <h1 className="page-title serif" style={{ marginBottom: 6 }}>
            {st.name}
          </h1>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 22 }}>
            <span className={"badge " + (st.status === "development" ? "dev" : st.status === "production" ? "prod" : st.status)}>
              {st.status}
            </span>
            {st.evergreen && <span className="badge ever">Evergreen</span>}
          </div>

          {/* Details */}
          <div className="section">
            <h3>Details</h3>
            <div className="kv"><span className="k">Style no.</span><span>{st.style_no || "—"}</span></div>
            <div className="kv"><span className="k">Category</span><span>{st.category || "—"}</span></div>
            <div className="kv"><span className="k">Garment</span><span>{st.garment || "—"}</span></div>
            <div className="kv"><span className="k">Designer</span><span>{st.designer || "—"}</span></div>
            <div className="kv"><span className="k">Season</span><span>{st.season || "—"}</span></div>
            <div className="kv"><span className="k">Factory</span><span>{st.factory || "—"}</span></div>
            {st.notes && <div className="kv"><span className="k">Notes</span><span>{st.notes}</span></div>}
          </div>

          {/* The running fit story. Per-round fit lives on each sample round; this
              is the part that carries across them — the block, the pattern, the
              thing we keep getting wrong. */}
          {st.fit_notes && (
            <div className="section">
              <h3>Fit</h3>
              <div className="fitnote">{st.fit_notes}</div>
            </div>
          )}

          {/* Developed from — the library references behind this style */}
          <div className="section">
            <h3>Developed from</h3>
            {refs.length === 0 ? (
              <div style={{ color: "var(--muted)", fontSize: 13 }}>
                No references linked yet. Open a reference in the Library or on a moodboard and
                choose <strong>Develop this</strong> to link it here.
              </div>
            ) : (
              <div className="devfrom">
                {refs.map((r) => {
                  const src = refThumb(r);
                  const sub = [r.year && r.year !== "Unknown" ? r.year : null, r.garment]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <div className="devfrom-card" key={r.id}>
                      <Link href={`/r/${r.id}`} className="devfrom-img">
                        {src ? <img src={src} alt={r.designer || ""} /> : null}
                      </Link>
                      <div className="devfrom-meta">
                        <div className="d">{r.designer || "Untitled"}</div>
                        {sub && <div className="s">{sub}</div>}
                        {r.deleted_at && <div className="s warn">In Trash</div>}
                      </div>
                      {/* Removes the link only — the reference stays in the Library. */}
                      <form action={unlinkReferenceForm.bind(null, st.id, r.id)}>
                        <button className="btn ghost sm" type="submit" title="Unlink this reference">
                          Unlink
                        </button>
                      </form>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Repurpose — copy this style forward into a new season (P3 #43).
              Collapsed by default: it creates a row, so it should take a
              deliberate click rather than sit next to Save. */}
          <details className="section repurpose">
            <summary style={{ cursor: "pointer", color: "var(--muted)", fontSize: 12, textTransform: "uppercase", letterSpacing: ".12em" }}>
              Repurpose into a new season
            </summary>
            <p className="repurpose-note">
              Makes a new style from this one. Category, garment, factory, tech pack, cover image
              and the <strong>fit notes</strong> come with it. Sample rounds, photography and
              comments start empty, and <strong>this style is not changed</strong> — last season
              stays readable exactly as it is.
            </p>
            <form action={repurposeStyle.bind(null, st.id)} style={{ marginTop: 14 }}>
              <div className="row3">
                <div className="field">
                  <label>New season</label>
                  <input className="input" name="season" placeholder="SS28" />
                </div>
                <div className="field">
                  <label>Name (optional)</label>
                  <input className="input" name="name" placeholder={`${st.name} — SS28`} />
                </div>
                <div className="field">
                  <label>Style no. (optional)</label>
                  <input className="input" name="style_no" placeholder="blank unless you have one" />
                </div>
              </div>
              <button className="btn ghost sm" type="submit">
                Repurpose
              </button>
            </form>
          </details>

          {/* Edit details (collapsible) */}
          <details className="section">
            <summary style={{ cursor: "pointer", color: "var(--muted)", fontSize: 12, textTransform: "uppercase", letterSpacing: ".12em" }}>
              Edit details
            </summary>
            <form action={updateStyle.bind(null, st.id)} style={{ marginTop: 16 }}>
              <div className="field"><label>Name</label><input className="input" name="name" defaultValue={st.name} /></div>
              <div className="row3">
                <div className="field"><label>Style no.</label><input className="input" name="style_no" defaultValue={st.style_no ?? ""} /></div>
                <div className="field"><label>Category</label><input className="input" name="category" defaultValue={st.category ?? ""} /></div>
                <div className="field"><label>Garment</label><input className="input" name="garment" defaultValue={st.garment ?? ""} /></div>
              </div>
              <div className="row3">
                <div className="field"><label>Designer</label><input className="input" name="designer" defaultValue={st.designer ?? ""} /></div>
                <div className="field"><label>Season</label><input className="input" name="season" defaultValue={st.season ?? ""} /></div>
                <div className="field"><label>Factory</label><input className="input" name="factory" defaultValue={st.factory ?? ""} /></div>
              </div>
              <div className="field"><label>Cover image URL</label><input className="input" name="cover_image" defaultValue={st.cover_image ?? ""} /></div>
              <div className="field"><label>Tech pack link</label><input className="input" name="tech_pack_url" defaultValue={st.tech_pack_url ?? ""} /></div>
              <div className="field"><label>Notes</label><textarea className="textarea" name="notes" defaultValue={st.notes ?? ""} /></div>
              <div className="field">
                <label>Fit notes — the running story across rounds</label>
                <textarea className="textarea" name="fit_notes" defaultValue={st.fit_notes ?? ""} />
              </div>
              <div className="row">
                <div className="field">
                  <label>Status</label>
                  <select className="select" name="status" defaultValue={st.status}>
                    {STYLE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 26 }}>
                  <input type="checkbox" name="evergreen" defaultChecked={st.evergreen} /> <span>Evergreen</span>
                </label>
              </div>
              <button className="btn" type="submit">Save changes</button>
            </form>
          </details>

          {/* Sample cycle — material leg then factory leg, per round */}
          <SampleRounds
            styleId={st.id}
            samples={sm}
            defaultFactory={st.factory ?? ""}
            today={studioToday()}
          />

          {/* Photography — the shot list, always all five slots */}
          <PhotoSlots styleId={st.id} photos={normalizePhotos(st.photos)} />

          {/* AI variations — one change at a time on the garment we already
              have. Saves into Versions below, flagged AI. See lib/variations.ts;
              the model itself is a shell (lib/imagegen.ts) until a key exists. */}
          <Variations
            styleId={st.id}
            connected={isImageGenConfigured()}
            style={{
              name: st.name,
              style_no: st.style_no,
              category: st.category,
              garment: st.garment,
              designer: st.designer,
              brand: st.brand,
              season: st.season,
              notes: st.notes,
              fit_notes: st.fit_notes,
              cover_image: st.cover_image,
            }}
          />

          {/* Versions */}
          <div className="section">
            <h3>Versions</h3>
            {vs.length === 0 ? (
              <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 12 }}>No versions yet.</div>
            ) : (
              vs.map((v) => (
                <div className="list-item" key={v.id}>
                  <strong>v{v.version_no}</strong>{v.season ? ` · ${v.season}` : ""}
                  {v.is_ai_generated && <span className="badge ever" style={{ marginLeft: 8 }}>AI</span>}
                  <div style={{ fontSize: 13, marginTop: 4 }}>{v.changes || v.notes || "—"}</div>
                  <div className="when">{v.created_at?.slice(0, 10)}</div>
                </div>
              ))
            )}
            <form action={addVersion.bind(null, st.id)} style={{ marginTop: 14 }}>
              <div className="row">
                <div className="field"><label>What changed</label><input className="input" name="changes" placeholder="e.g. new colorway — sage" /></div>
                <div className="field"><label>Season</label><input className="input" name="season" placeholder="SS27" /></div>
              </div>
              <button className="btn ghost sm" type="submit">Add version</button>
            </form>
          </div>

          {/* Comments */}
          <div className="section">
            <h3>Comments &amp; feedback</h3>
            {cm.length === 0 ? (
              <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 12 }}>No comments yet.</div>
            ) : (
              cm.map((c) => (
                <div className="list-item" key={c.id}>
                  <div style={{ fontSize: 14 }}>{c.body}</div>
                  <div className="when" style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 4 }}>
                    <span>{c.author || "—"} · {c.created_at?.slice(0, 10)}</span>
                    <span className="badge">{c.status || "open"}</span>
                    {c.status !== "received" && (
                      <form action={markCommentReceived.bind(null, st.id, c.id)}>
                        <button className="btn ghost sm" type="submit">Mark received</button>
                      </form>
                    )}
                  </div>
                </div>
              ))
            )}
            <form action={addComment.bind(null, st.id)} style={{ marginTop: 14 }}>
              <div className="field"><label>Add a comment</label><textarea className="textarea" name="body" required /></div>
              <button className="btn ghost sm" type="submit">Post comment</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

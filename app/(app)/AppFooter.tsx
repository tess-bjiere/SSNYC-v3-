// A quiet footer on every signed-in page (Tess, 2026-08-11: "add link in footer
// to google doc where people can leave notes for feedback / functionality
// changes / simplifications"). One muted line, out of the way.
//
// The doc URL is read from NEXT_PUBLIC_FEEDBACK_URL so it can be set (or changed)
// in Vercel without a deploy; until it is set, the line still shows but the link
// is inert rather than pointing somewhere wrong.
export default function AppFooter() {
  const url = process.env.NEXT_PUBLIC_FEEDBACK_URL || "";
  return (
    <footer className="app-footer">
      <a
        href={url || "#"}
        target={url ? "_blank" : undefined}
        rel={url ? "noreferrer" : undefined}
        aria-disabled={url ? undefined : true}
      >
        Leave a note — feedback, ideas, things to simplify ↗
      </a>
    </footer>
  );
}

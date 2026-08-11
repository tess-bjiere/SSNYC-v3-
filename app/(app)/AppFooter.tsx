// A quiet footer on every signed-in page (Tess, 2026-08-11: "add link in footer
// to google doc where people can leave notes for feedback / functionality
// changes / simplifications"). One muted line, out of the way.
//
// Tess's feedback doc (2026-08-11). NEXT_PUBLIC_FEEDBACK_URL still overrides it,
// so the link can be repointed in Vercel without a deploy.
const FEEDBACK_DOC =
  "https://docs.google.com/document/d/1VWdxG98xel5kJa0YqPj4ff3R9R9nLNvgeeWlTJ6KG-c/edit?usp=sharing";

export default function AppFooter() {
  const url = process.env.NEXT_PUBLIC_FEEDBACK_URL || FEEDBACK_DOC;
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

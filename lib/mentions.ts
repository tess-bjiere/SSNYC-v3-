// @mentions in a comment (Tess, 2026-08-28: "yes build @mentions" — "how do i
// comment at someone and make sure they see the note").
//
// A mention is stored as plain text in the comment body — "@kara can you check
// the rib" — and this module reads it back out. Keeping the mention in the body
// rather than a column means no schema change and no watchers table: the notify
// step and the activity feed both parse the body the same way, exactly the
// derived-watcher shape lib/notify already uses.
//
// Dependency-free like the rest of lib, so node can test it directly. It is
// handed the team's addresses (the allowlist) and resolves each "@token" to a
// real teammate, so a stray "@here" or an address in running text resolves to
// nobody.

/** Trim + lowercase — "Kara@Theloyalist.com" and "kara@theloyalist.com" are one
 *  person, the same rule lib/commentEdit and lib/notify normalise emails by. */
function norm(email: string | null | undefined): string {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

/** The part before the "@" — what a person naturally types to tag a teammate. */
export function localPart(email: string): string {
  const at = email.indexOf("@");
  return at >= 0 ? email.slice(0, at) : email;
}

// "@" then either a bare local-part (@kara) or a full address (@kara@x.com).
// The address form is greedy so "@kara@theloyalist.com" is one token, not "@kara".
const MENTION_RE = /@([A-Za-z0-9._%+-]+(?:@[A-Za-z0-9.-]+\.[A-Za-z]{2,})?)/g;

/**
 * The teammates a comment body tags, resolved to their canonical addresses.
 *
 * Each "@token" is matched against the team: a bare token against local-parts
 * (@kara → kara@theloyalist.com), a token that carries a domain against the full
 * address. Only real teammates come back — an unmatched token is just text.
 * Order of first appearance, de-duplicated.
 */
export function parseMentions(body: string | null | undefined, team: readonly string[]): string[] {
  const text = typeof body === "string" ? body : "";
  if (!text.includes("@")) return [];

  const byEmail = new Set<string>();
  const byLocal = new Map<string, string>(); // local-part -> canonical email (first wins)
  for (const raw of team) {
    const email = norm(raw);
    if (!email || !email.includes("@")) continue;
    byEmail.add(email);
    const lp = norm(localPart(email));
    if (lp && !byLocal.has(lp)) byLocal.set(lp, email);
  }

  const out: string[] = [];
  const seen = new Set<string>();
  const re = new RegExp(MENTION_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const token = norm(m[1]);
    const email = token.includes("@")
      ? byEmail.has(token)
        ? token
        : null
      : byLocal.get(token) ?? null;
    if (email && !seen.has(email)) {
      seen.add(email);
      out.push(email);
    }
  }
  return out;
}

# SSYNC — working notes for Claude Code

A fashion development tool for The Loyalist: reference library, moodboards, and
the sample-round pipeline that takes a style from first proto to bulk.

Next.js 15 App Router · TypeScript · React 19 · Supabase Postgres · Vercel.
Live at https://ssync-two.vercel.app · repo `tess-bjiere/SSNYC-v3-` · deploys
from `main`.

---

## Before anything else

**The database is live and it is the only copy.** Every reference, style, sample
round and comment the studio has is in the Supabase project
`axwavdjhzvtluvsixfjq`. There is no staging copy and, until the project moves to
Supabase Pro, no daily backup. Nothing in this repo is worth a lost row.

**`db/p0-rls.sql` must not be run without Tess saying so, in words, that time.**
It closes the row-level-security policies. Run in the wrong order it makes every
page render empty and every share link 404, which looks exactly like a broken
deploy. `/setup` in the app checks the order and explains it.

---

## Rules that are not negotiable

**Nothing is deleted, only stopped being read.** Styles, references, versions and
comments all soft-delete through a `deleted_at` column and come back with
Restore. A retired field keeps its column; a retired list value keeps resolving
to a label. If you are about to write `drop column` or `delete from`, you are
about to be wrong.

**No schema change goes in unannounced.** Additive and nullable is fine and
frequent. Say so in the reply and say why in the migration's own comment — every
migration in this project opens with what was asked for, in the words it was
asked in.

**`styles.photos` and `style_samples.photos` are jsonb maps holding several
things at once**: the fixed photography slots, the `gallery` list, the
`colorways` list, the `shots` list, and the image-note map. Every writer in
`lib/imageList.ts` and `lib/photoSlots.ts` reads the whole map and returns a new
one with the keys it did not come for carried through untouched. A write that
rebuilds the map from scratch deletes a shoot. This is the single most dangerous
thing in the codebase.

**Never paste an API key, token or password into anything.** Tess pastes her own
credentials into Vercel or Supabase. This has come up with the Supabase
`service_role` key and the Google service-account key and the answer is the same
both times.

**Never send mail on her behalf.** Notifications go out through a mailer she
configured; nothing composes and sends to a factory unattended.

**No `confirm()` or `alert()`.** A modal dialog freezes the browser automation
this project is developed through. Destructive actions use the two-click arm
pattern: the button says "Remove", pressing it changes it to "Remove?", and
moving the pointer away disarms it.

---

## How the code is organised

```
app/(app)/…     the signed-in application
app/actions/…   server actions — every write goes through one
lib/…           the decisions, as pure modules
db/…            SQL, applied by hand through the Supabase SQL editor
```

**`lib/*.ts` is where judgement lives, and it is dependency-free on purpose.** A
tested module imports nothing — not React, not Supabase, not node builtins — and
declares its own structural types (`FactoryStyleLike`, `CsvStyleLike`,
`WipStyleLike`). That is what lets `node --experimental-strip-types --test` run
the whole suite in five seconds with no build step and no mocks.

Two deliberate exceptions, both worth understanding before adding a third:

- `lib/wipImport.ts` imports **types only** from `lib/wipSources.ts`.
- `lib/zip.ts` needs inflate, so it **takes the inflate function as a
  parameter**. `lib/googleDrive.ts` passes node's `inflateRawSync` at the edge.
  Injection rather than import is what keeps the zip tests dependency-free.

**Import extensions.** Value imports inside `lib/*.ts` must be extensionless
(`from "./zip"`) or tsc raises TS5097. Only `import type … from "./x.ts"` may
carry the extension. `.mts` test files DO use `./x.ts`, because node needs it.

**`server-only` is not installed.** Do not import it.

## Tests

`npm test` → `node --experimental-strip-types --test lib/*.test.mts`. Currently
~676 tests, all passing, and they should stay that way.

Test the decisions, not the framework. A test earns its place when it pins a
rule somebody could plausibly undo: that a colourway write leaves the photography
slots alone, that an archived style's abandoned round does not drag a factory's
turnaround average, that a CSV cell beginning with `=` is defused before Excel
runs it. Write the reason in the test as a comment.

Also run `npx tsc --noEmit` and `npm run build`. The build catches things tsc
does not.

---

## The design system

Read `app/globals.css` from the top — the tokens are documented there at length
and the reasoning is worth having before changing a number.

**Type scale**: `--t-display` 19px through `--t-micro` 9px. Nothing in the app
sets a raw font size; there are eight sizes and they are the only eight.

**Control scale**: padding, in four steps. `xs` 3/7 for marks you cannot press,
`sm` 5/10 for compact controls, `md` 8/13 for everything by default, `lg` 11/16
for a rare page-level action. Padding is the scale — type still comes from the
type scale by role, so a compact *field* still shows its contents at reading
size.

**Spacing between controls**: `--sp-chip` 12px for a band of chips, `--sp-ctl`
18px for buttons and links.

**Three button tiers**: `.btn` solid for the one act that commits something,
`.btn.ghost` outlined for the everyday act, `.btn.link` text for anything
occasional or reversible.

**One family**: Barlow Semi Condensed, everywhere, including form controls —
`button, input, select, textarea` inherit it from a rule at the top of the file,
because browsers do not do that on their own.

**Ink has three steps**: `--ink` what you came to read, `--muted` the supporting
line, `--faint` navigational furniture. Colour does ranking here, along with
weight, so sizes can stay small.

**The rating dot** — good/workable/poor — means one thing everywhere it appears
and needs no key. Unrated draws nothing at all: a mark is read as a verdict, and
"nobody has looked yet" is not one.

**Pin geometry**: any container that image-note pins are drawn inside must be
exactly the rendered image box. `object-fit: contain` is forbidden there, or the
marks drift off the picture.

---

## How Tess works

Short messages, often with a screenshot, often several in a row. She is
describing what she sees, so read the screenshot before reading the words.

She has asked for building rather than asking. When a request is ambiguous, take
the most defensible reading, build it, say plainly in the reply which reading you
took, and make it trivially reversible. "Whats the status — you keep spinning"
is the note to avoid earning.

**Explain the why, not the what.** She can see what changed. What she cannot see
is the reasoning, and that is what the replies and the code comments are for. The
comments in this codebase are long on purpose: they record the request in her own
words, the decision, and what the alternative would have cost.

**Say what you did not do.** A feature deliberately left out, a field left alone,
an interpretation that could have gone the other way — name it and offer the
other path in a sentence.

## Working conventions

Comments quote the request verbatim and date it:

```ts
// Tess, 2026-08-07: "fabric is a duplicate of fabric type -- keep fabric type".
```

Retired code says why it is retired rather than disappearing — see the removed
"Pull from WIP" block on the style profile, which names the six lines that put it
back.

---

## Where things stand

Built and shipped: the reference library, moodboards, editorial, the style
profile, sample rounds with photography and image annotation, comments, the
by-factory view, the style library, trash and restore, exports, the CSV export,
and a Google Drive WIP reader.

**Pull from WIP** is complete and switched off. `lib/wipSources.ts`,
`lib/wipImport.ts`, `lib/zip.ts`, `lib/xlsx.ts`, `lib/googleDrive.ts` and
`app/actions/wip.ts` are all here and under test; the panel is commented out on
the style profile pending `GOOGLE_SA_EMAIL` and `GOOGLE_SA_PRIVATE_KEY` in
Vercel. It reads a real .xlsx — Kara's SOUS SOUS WIP is an Excel file, not a
Google Sheet, so the app opens the zip and parses the XML itself. A brand only
ever reads from its own sheet; that rule is in `lib/wipSources.ts` and enforced
again by Google's permission model.

Outstanding, roughly in order: push the current work (nothing since the P0
snapshot is committed), rotate the Supabase `service_role` key, move Supabase to
Pro for backups, run `db/p0-rls.sql` deliberately, add the team to
`app_allowlist`, then the custom domain.

`/setup` inside the app is the live version of that list and checks what it can
see.

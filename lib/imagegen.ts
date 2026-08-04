import type { VariationBrief } from "@/lib/variations";

// ---------------------------------------------------------------------------
// The thin shell around lib/variations (P5 — AI variations)
//
// Everything about *what to ask for* is decided in lib/variations, which is
// pure and tested. This file is the only part that would touch a model, and it
// follows the pattern lib/mailer.ts already set for email: the studio has no
// image-model key, so rather than block the feature on a procurement decision,
// an unconfigured generate is a **no-op that reports itself** — not a thrown
// error, and not a silent success.
//
// That is not a placeholder. The brief is the deliverable either way: it copies
// out of the page and pastes into whatever tool is already open, and it is the
// same text a generator would be handed later, so nothing about the request has
// to be re-decided the day a key appears. Two environment variables switch the
// button on:
//
//   IMAGE_API_KEY=sk-...
//   IMAGE_API_URL=https://api.openai.com/v1/images/edits   (or any OpenAI-shaped endpoint)
//   IMAGE_MODEL=gpt-image-1                                (optional; defaults below)
//
// ⚠️ Honest note for whoever turns this on: the request below is written to the
// OpenAI images shape and has never been run against a live key from this
// build. Expect to adjust the body once, in this one function, and nowhere
// else — that is the reason the rest of the feature knows nothing about it.
// ---------------------------------------------------------------------------

export type GenerateResult = {
  configured: boolean;
  /** The generated image, when there is one. */
  url: string | null;
  /** Said plainly, for the page to show. Never an exception thrown at a user. */
  message: string;
};

export function isImageGenConfigured(): boolean {
  return Boolean(process.env.IMAGE_API_KEY && process.env.IMAGE_API_URL);
}

export async function generateVariation(brief: VariationBrief): Promise<GenerateResult> {
  if (!brief.ready) {
    return { configured: isImageGenConfigured(), url: null, message: "The brief isn't complete yet." };
  }

  if (!isImageGenConfigured()) {
    // Loud enough to find in a log, quiet enough not to be an error — this is
    // the expected state until a key exists.
    console.info(`[variations] no image model configured; brief not generated: ${brief.title}`);
    return {
      configured: false,
      url: null,
      message:
        "No image model is connected yet, so nothing was generated. Copy the brief below and run it wherever you like — or set IMAGE_API_KEY and IMAGE_API_URL and this button starts working with no other change.",
    };
  }

  try {
    const res = await fetch(process.env.IMAGE_API_URL as string, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.IMAGE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.IMAGE_MODEL || "gpt-image-1",
        prompt: brief.prompt,
        // The source image is what makes this a *variation* rather than a new
        // garment. Sent by URL; an endpoint that wants bytes is the one edit
        // this function is expected to need.
        image: brief.source ?? undefined,
        n: 1,
        size: "1024x1536",
      }),
    });

    if (!res.ok) {
      console.warn(`[variations] provider returned ${res.status}`);
      return { configured: true, url: null, message: `The image model returned ${res.status}. Nothing was saved.` };
    }

    const json = (await res.json()) as { data?: { url?: string; b64_json?: string }[] };
    const first = json.data?.[0];
    const url = first?.url || (first?.b64_json ? `data:image/png;base64,${first.b64_json}` : null);
    if (!url) return { configured: true, url: null, message: "The image model replied without an image." };
    return { configured: true, url, message: "Generated." };
  } catch (err) {
    // A dead provider must not take the page down with it.
    console.warn("[variations] generate failed", err);
    return { configured: true, url: null, message: "Couldn't reach the image model. Nothing was saved." };
  }
}

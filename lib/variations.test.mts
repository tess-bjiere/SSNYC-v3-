import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ALWAYS_HOLD,
  VARIATION_AXES,
  briefText,
  buildBrief,
  describeGarment,
  findAxis,
  type VariationStyle,
} from "./variations.ts";

function style(over: Partial<VariationStyle> = {}): VariationStyle {
  return {
    name: "Cropped Rib Tank",
    garment: "Tank",
    category: "Tops",
    brand: "The Loyalist",
    season: "SS27",
    cover_image: "https://img/tank.jpg",
    ...over,
  };
}

test("the four axes are the four axes, each with its own hold list", () => {
  assert.deepEqual(VARIATION_AXES.map((a) => a.id), ["recolor", "print", "trim", "detail"]);
  for (const a of VARIATION_AXES) assert.ok(a.keeps.length > 0, `${a.id} holds nothing`);
});

test("an axis that does not exist is null, not a crash", () => {
  assert.equal(findAxis("hologram"), null);
  assert.equal(findAxis(""), null);
});

test("the garment is described from the record, in the same words every time", () => {
  const s = style();
  assert.equal(describeGarment(s), "Cropped Rib Tank — a tank by The Loyalist, SS27.");
  // Same style, same sentence — this is the point of not typing it.
  assert.equal(describeGarment(s), describeGarment({ ...s }));
});

test("category stands in when there is no garment, and neither is fatal", () => {
  assert.match(describeGarment(style({ garment: null })), /a tops/);
  assert.match(describeGarment(style({ garment: null, category: null })), /a garment/);
});

test("brand wins over designer, and both are optional", () => {
  assert.match(describeGarment(style({ designer: "Tess" })), /by The Loyalist/);
  assert.match(describeGarment(style({ brand: null, designer: "Tess" })), /by Tess/);
  const bare = describeGarment(style({ brand: null, designer: null, season: null }));
  assert.equal(bare, "Cropped Rib Tank — a tank.");
});

test("an unnamed style still describes as something", () => {
  assert.match(describeGarment(style({ name: "   " })), /^Untitled style/);
});

test("the prompt states one change and then everything that must not move", () => {
  const b = buildBrief(style(), { axisId: "recolor", value: "bone" });
  assert.ok(b.prompt.includes("Recolour the garment to bone."));
  for (const h of ALWAYS_HOLD) assert.ok(b.prompt.includes(h), `missing hold: ${h}`);
  for (const h of findAxis("recolor")!.keeps) assert.ok(b.prompt.includes(h));
  assert.ok(b.prompt.includes("Change nothing else."));
});

test("each axis contributes its own holds and nobody else's", () => {
  const print = buildBrief(style(), { axisId: "print", value: "botanical" });
  const trimKeep = findAxis("trim")!.keeps[0];
  assert.ok(print.prompt.includes(findAxis("print")!.keeps[0]));
  assert.ok(!print.prompt.includes(trimKeep));
});

test("the always-holds are in every brief, whichever axis", () => {
  for (const a of VARIATION_AXES) {
    const b = buildBrief(style(), { axisId: a.id, value: "x" });
    for (const h of ALWAYS_HOLD) assert.ok(b.prompt.includes(h), `${a.id} dropped a hold`);
  }
});

test("extra notes are carried, and absent notes add no blank line", () => {
  const withExtra = buildBrief(style(), { axisId: "trim", value: "horn buttons", extra: "Keep the hem tape." });
  assert.ok(withExtra.prompt.includes("Keep the hem tape."));
  const without = buildBrief(style(), { axisId: "trim", value: "horn buttons" });
  assert.ok(!without.prompt.includes("undefined"));
  assert.ok(!/\n\n\n/.test(without.prompt));
});

test("a brief with no change asked for is not ready, and says why", () => {
  const b = buildBrief(style(), { axisId: "recolor", value: "  " });
  assert.equal(b.ready, false);
  assert.ok(b.warnings.some((w) => /say what the colour should be/i.test(w)));
});

test("no axis chosen is not ready either", () => {
  const b = buildBrief(style(), { axisId: "", value: "bone" });
  assert.equal(b.ready, false);
  assert.equal(b.axis, null);
  assert.ok(b.warnings.some((w) => /pick what you are changing/i.test(w)));
});

test("a style with no cover image warns that the result will not match the garment", () => {
  const b = buildBrief(style({ cover_image: null }), { axisId: "recolor", value: "bone" });
  assert.equal(b.source, null);
  assert.ok(b.warnings.some((w) => /no cover image/i.test(w)));
  // Still buildable — the warning is a caution, not a refusal.
  assert.equal(b.ready, true);
});

test("a thin record warns that the description is vague", () => {
  const b = buildBrief(style({ garment: null, category: null }), { axisId: "print", value: "botanical" });
  assert.ok(b.warnings.some((w) => /vague/i.test(w)));
});

test("a complete style asking for a real change has nothing to warn about", () => {
  assert.deepEqual(buildBrief(style(), { axisId: "detail", value: "patch pocket" }).warnings, []);
});

test("the title and the version note both name the one change", () => {
  const b = buildBrief(style(), { axisId: "recolor", value: "bone" });
  assert.equal(b.title, "Cropped Rib Tank — Colour: bone");
  assert.equal(b.versionNote, "AI variation — colour: bone");
});

test("nothing generated is passed off as a photograph", () => {
  const b = buildBrief(style(), { axisId: "recolor", value: "bone" });
  assert.ok(/product development image, not an advertisement/i.test(b.prompt));
});

test("the copyable text leads with the source image when there is one", () => {
  const b = buildBrief(style(), { axisId: "recolor", value: "bone" });
  const t = briefText(b);
  assert.ok(t.startsWith("Cropped Rib Tank — Colour: bone"));
  assert.ok(t.includes("Source image: https://img/tank.jpg"));
  assert.ok(t.includes("Recolour the garment to bone."));
});

test("the copyable text of an image-less style mentions no source", () => {
  const t = briefText(buildBrief(style({ cover_image: null }), { axisId: "recolor", value: "bone" }));
  assert.ok(!/Source image/.test(t));
});

test("whitespace around what the designer typed never reaches the prompt", () => {
  const b = buildBrief(style(), { axisId: "  recolor  ".trim(), value: "  washed indigo  " });
  assert.ok(b.prompt.includes("Recolour the garment to washed indigo."));
  assert.ok(!b.prompt.includes("  washed"));
});

test("building a brief does not touch the style it was handed", () => {
  const s = style();
  const copy = JSON.parse(JSON.stringify(s));
  buildBrief(s, { axisId: "recolor", value: "bone" });
  assert.deepEqual(s, copy);
});

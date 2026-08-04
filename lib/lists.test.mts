// The dropdown vocabulary is curation Tess has already done in the original
// tool — dozens of adds, removals and reorders stored as a diff in
// `settings.lists`. If v2 reconstructs it even slightly differently she loses
// that work silently, which is the failure mode this whole rebuild is meant to
// avoid. So the central test here replays the REAL stored value and asserts the
// result is character-for-character what the original's drawer renders (read off
// the live tool on 2026-08-04).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LIST_FIELDS,
  addOption,
  moveOption,
  removeOption,
  reorderOptions,
  resolveDesigners,
  resolveFilterOptions,
  resolveList,
  type ListsSetting,
} from "./lists.ts";

// Verbatim from `select value from settings where key = 'lists'`.
const LIVE: ListsSetting = {
  fabric: {
    added: ["Nylon", "Spandex", "Wool", "Performance"],
    order: ["Performance", "Cotton", "Jersey", "French Terry", "Nylon", "Spandex", "Wool"],
    removed: ["Butter Rib", "Cashmere", "Silk", "Swim"],
  },
  season: {
    added: ["Spring", "Summer", "Fall", "Winter", "Resort / Swim"],
    removed: ["Pre-Fall", "Pre-Spring", "Spring/Summer", "Fall/Winter", "Resort", "Swimwear"],
  },
  garment: {
    added: ["Sports Bras", "Fleece", "Windbreaker", "Bomber", "Moto Jacket", "Puffer Coat", "Bikini", "Wraps", "Trackpants", "Gym Bag", "Tote Bag"],
    order: ["T-Shirt", "Tank", "Sports Bras", "Wraps", "Fleece", "Trackpants", "Bikini", "One Piece", "Sleepwear", "Underwear", "Halter", "Sweatshirt", "Button Down", "Bodysuit", "Jean", "Sweatpant", "Lounge Pant", "Legging", "Pant", "Skirt", "Short", "Sweater", "Cardigan", "Knit Top", "Knit Bottom", "Knit Accessory", "Coat", "Jacket", "Bomber", "Moto Jacket", "Windbreaker", "Puffer Coat", "Vest", "Trench Coat", "Parka", "Bra", "Sock", "Hat", "Scarf", "Track Pant", "Gym Bag", "Tote Bag"],
    removed: ["Blazers", "Knit Bottoms", "Knit Accessories", "Knit Tops", "Midi", "Mini", "Maxi", "Gift Card", "Bras", "Knitwear", "Coats", "Jackets", "Windbreak", "Bikini Bottoms", "Bikini Tops", "Jeans", "Button Downs", "Cardigans", "Skirts", "Halters", "Pants", "Raincoat", "Bikini Top", "Bikini Bottom", "Blazer", "Bucket Bag"],
  },
  category: {
    added: ["Performance", "Bags", "Details", "Footwear"],
    order: ["Tops", "Bottoms", "Outerwear", "Performance", "Swimwear", "Accessories", "Bags", "Intimates", "Details", "Footwear", "Editorial / Ads", "Product Images"],
    removed: ["Womenswear", "Menswear", "Dresses", "Unisex", "Knitwear", "Editorial / Ads", "Product Images"],
  },
};

// Read off the original tool's "Manage list options" drawer, group by group.
const DRAWER = {
  category: ["Tops", "Bottoms", "Outerwear", "Performance", "Swimwear", "Accessories", "Bags", "Intimates", "Details", "Footwear", "Fabric", "Color"],
  garment: ["T-Shirt", "Tank", "Sports Bras", "Wraps", "Fleece", "Trackpants", "Bikini", "One Piece", "Sleepwear", "Underwear", "Halter", "Sweatshirt", "Button Down", "Bodysuit", "Jean", "Sweatpant", "Lounge Pant", "Legging", "Pant", "Skirt", "Short", "Sweater", "Cardigan", "Knit Top", "Knit Bottom", "Knit Accessory", "Coat", "Jacket", "Bomber", "Moto Jacket", "Windbreaker", "Puffer Coat", "Vest", "Trench Coat", "Parka", "Bra", "Sock", "Hat", "Scarf", "Track Pant", "Gym Bag", "Tote Bag"],
  season: ["Spring", "Summer", "Fall", "Winter", "Resort / Swim"],
  fabric: ["Performance", "Cotton", "Jersey", "French Terry", "Nylon", "Spandex", "Wool", "Linan", "Mesh"],
  color: ["Black", "White", "Grey", "Beige", "Brown", "Navy", "Blue", "Green", "Red", "Pink", "Purple", "Orange", "Yellow", "Cream", "Gold", "Silver", "Multi", "Tan"],
};

for (const field of LIST_FIELDS) {
  test(`the live settings.lists reproduces the original drawer exactly — ${field}`, () => {
    assert.deepEqual(resolveList(field, LIVE), DRAWER[field]);
  });
}

test("a field with no stored edits falls back to the base vocabulary", () => {
  // Color has no entry in the live data at all, and still renders 18 options.
  assert.deepEqual(resolveList("color", {}), DRAWER.color);
  assert.deepEqual(resolveList("color", null), DRAWER.color);
  assert.deepEqual(resolveList("color", undefined), DRAWER.color);
});

test("removed beats order — a value in both does not render", () => {
  // "Editorial / Ads" and "Product Images" sit in category.order AND
  // category.removed. The original hides them; so must we.
  const out = resolveList("category", LIVE);
  assert.equal(out.includes("Editorial / Ads"), false);
  assert.equal(out.includes("Product Images"), false);
  assert.equal(LIVE.category?.order?.includes("Editorial / Ads"), true);
});

test("malformed stored data degrades to the base list instead of throwing", () => {
  const junk = { fabric: { added: null, order: "nope", removed: [1, null, "  "] } } as unknown as ListsSetting;
  const out = resolveList("fabric", junk);
  assert.ok(out.includes("Cotton"));
  assert.ok(out.includes("Butter Rib")); // nothing validly removed
});

test("filters keep showing a removed option that references still carry", () => {
  // The drawer's own promise: "Removing an option doesn't change references
  // already tagged with it." Two references are tagged "Knitwear", which Tess
  // removed from the category list. If the filter dropped it she could never
  // find them again.
  const opts = resolveFilterOptions("category", LIVE, ["Knitwear", "Tops"]);
  assert.deepEqual(opts.slice(0, DRAWER.category.length), DRAWER.category);
  assert.deepEqual(opts.slice(DRAWER.category.length), ["Knitwear"]);
});

test("in-use strays are appended alphabetically and never reorder the curated list", () => {
  const opts = resolveFilterOptions("fabric", LIVE, ["Silk", "Butter Rib", "Cotton", ""]);
  assert.deepEqual(opts, [...DRAWER.fabric, "Butter Rib", "Silk"]);
});

test("filter options are case-insensitively deduped against the curated list", () => {
  const opts = resolveFilterOptions("color", {}, ["black", "BLACK", "Chartreuse"]);
  assert.deepEqual(opts, [...DRAWER.color, "Chartreuse"]);
});

test("designers merge the curated settings row with names actually in use", () => {
  const out = resolveDesigners(["Miu Miu", "Alaïa"], ["Mui Mui", "Alaïa", "  "]);
  assert.deepEqual(out, ["Alaïa", "Miu Miu", "Mui Mui"]);
});

test("designers survive an empty or missing settings row", () => {
  assert.deepEqual(resolveDesigners(null, ["Nike", "Adidas"]), ["Adidas", "Nike"]);
  assert.deepEqual(resolveDesigners([], []), []);
});

test("adding an option puts it at the end of the curated order", () => {
  const next = addOption(LIVE, "fabric", "Ponte");
  assert.deepEqual(resolveList("fabric", next), [...DRAWER.fabric, "Ponte"]);
  // and the original stored value is untouched
  assert.deepEqual(resolveList("fabric", LIVE), DRAWER.fabric);
});

test("adding an option back undoes a removal, restoring its old position", () => {
  const gone = removeOption(LIVE, "fabric", "Jersey");
  assert.equal(resolveList("fabric", gone).includes("Jersey"), false);
  const back = addOption(gone, "fabric", "Jersey");
  assert.deepEqual(resolveList("fabric", back), DRAWER.fabric); // back at index 2, not the end
});

test("adding a duplicate is a no-op rather than a second chip", () => {
  const next = addOption(LIVE, "fabric", "  cotton  ");
  assert.deepEqual(resolveList("fabric", next), DRAWER.fabric);
});

test("adding blank text does nothing", () => {
  assert.deepEqual(resolveList("fabric", addOption(LIVE, "fabric", "   ")), DRAWER.fabric);
});

test("removing records the value without erasing its place in order", () => {
  const next = removeOption(LIVE, "garment", "Bikini");
  assert.deepEqual(resolveList("garment", next), DRAWER.garment.filter((g) => g !== "Bikini"));
  assert.equal(next.garment?.order?.includes("Bikini"), true);
  assert.equal(next.garment?.added?.includes("Bikini"), true);
});

test("removing every option leaves an empty list, not the base list", () => {
  let next: ListsSetting = LIVE;
  for (const v of DRAWER.season) next = removeOption(next, "season", v);
  assert.deepEqual(resolveList("season", next), []);
});

test("reordering a partial list keeps the options it left out", () => {
  const next = reorderOptions(LIVE, "season", ["Winter", "Fall"]);
  assert.deepEqual(resolveList("season", next), ["Winter", "Fall", "Spring", "Summer", "Resort / Swim"]);
});

test("reordering never invents, drops or duplicates an option", () => {
  const shuffled = [...DRAWER.garment].reverse();
  const next = reorderOptions(LIVE, "garment", shuffled);
  const out = resolveList("garment", next);
  assert.equal(out.length, DRAWER.garment.length);
  assert.deepEqual([...out].sort(), [...DRAWER.garment].sort());
  assert.deepEqual(out, shuffled);
});

test("moveOption walks an option one step at a time", () => {
  const up = moveOption(LIVE, "season", "Fall", -1);
  assert.deepEqual(resolveList("season", up), ["Spring", "Fall", "Summer", "Winter", "Resort / Swim"]);
  const down = moveOption(LIVE, "season", "Fall", 1);
  assert.deepEqual(resolveList("season", down), ["Spring", "Summer", "Winter", "Fall", "Resort / Swim"]);
});

test("moveOption refuses to walk off either end", () => {
  assert.deepEqual(resolveList("season", moveOption(LIVE, "season", "Spring", -1)), DRAWER.season);
  assert.deepEqual(resolveList("season", moveOption(LIVE, "season", "Resort / Swim", 1)), DRAWER.season);
  assert.deepEqual(resolveList("season", moveOption(LIVE, "season", "Nonexistent", 1)), DRAWER.season);
});

test("an edit to one field leaves every other field untouched", () => {
  const next = removeOption(addOption(LIVE, "color", "Chartreuse"), "garment", "Hat");
  for (const f of LIST_FIELDS) {
    if (f === "color" || f === "garment") continue;
    assert.deepEqual(resolveList(f, next), DRAWER[f]);
  }
  assert.deepEqual(resolveList("color", next), [...DRAWER.color, "Chartreuse"]);
});

test("a full round trip of edits is stable — the stored diff is re-resolvable", () => {
  const once = addOption(LIVE, "fabric", "Ponte");
  const twice = JSON.parse(JSON.stringify(once)) as ListsSetting; // as it survives jsonb
  assert.deepEqual(resolveList("fabric", twice), resolveList("fabric", once));
});

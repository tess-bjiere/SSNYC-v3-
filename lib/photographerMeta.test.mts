import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readPhotographerMeta,
  withPhotographerMeta,
  readAllPhotographerMeta,
  photographerKey,
  EMPTY_META,
} from "./photographerMeta.ts";

test("a photographer with no card reads as empty, and garbage never throws", () => {
  assert.deepEqual(readPhotographerMeta(null, "Ada"), EMPTY_META);
  assert.deepEqual(readPhotographerMeta({}, "Ada"), EMPTY_META);
  assert.deepEqual(readPhotographerMeta("nope", "Ada"), EMPTY_META);
  assert.deepEqual(readPhotographerMeta({ ada: 42 }, "Ada"), EMPTY_META);
});

test("keying is the lower-cased trim, so the metadata joins to the directory", () => {
  const v = withPhotographerMeta({}, "  Ada Lovelace ", { tier: "home" });
  assert.equal(photographerKey("ADA LOVELACE"), "ada lovelace");
  assert.equal(readPhotographerMeta(v, "ada lovelace").tier, "home");
});

test("writing one card leaves everyone else's untouched", () => {
  let v: unknown = withPhotographerMeta({}, "Ada", { tier: "campaign", video: true });
  v = withPhotographerMeta(v, "Bea", { photo: true });
  assert.equal(readPhotographerMeta(v, "Ada").tier, "campaign");
  assert.equal(readPhotographerMeta(v, "Ada").video, true);
  assert.equal(readPhotographerMeta(v, "Bea").photo, true);
  assert.equal(readPhotographerMeta(v, "Bea").tier, null);
});

test("a patch merges onto the existing card, not replaces it", () => {
  let v: unknown = withPhotographerMeta({}, "Ada", { tier: "home", pastWork: "Vogue, Nike" });
  v = withPhotographerMeta(v, "Ada", { video: true });
  const m = readPhotographerMeta(v, "Ada");
  assert.equal(m.tier, "home");
  assert.equal(m.pastWork, "Vogue, Nike");
  assert.equal(m.video, true);
});

test("the old `clients` field is read as past work, after the rename", () => {
  // A card written before the rename still shows its history.
  const m = readPhotographerMeta({ ada: { clients: "Lemaire, SSENSE" } }, "Ada");
  assert.equal(m.pastWork, "Lemaire, SSENSE");
});

test("clearing every field removes the card rather than storing an empty shell", () => {
  let v: unknown = withPhotographerMeta({}, "Ada", { tier: "home" });
  v = withPhotographerMeta(v, "Ada", { tier: null });
  assert.deepEqual(readAllPhotographerMeta(v), {});
});

test("an unknown tier value is refused", () => {
  const v = withPhotographerMeta({}, "Ada", { tier: "vip" as unknown as "home" });
  assert.equal(readPhotographerMeta(v, "Ada").tier, null);
});

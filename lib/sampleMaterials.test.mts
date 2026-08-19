import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeMaterialIds,
  readMaterialIds,
  resolveMaterials,
  splitByKind,
  type LinkedMaterial,
} from "./sampleMaterials.ts";

const mat = (id: string, over: Partial<LinkedMaterial> = {}): LinkedMaterial => ({
  id,
  name: id,
  kind: "fabric",
  supplier: null,
  composition: null,
  color: null,
  color_hex: null,
  deleted: false,
  ...over,
});

test("normalizeMaterialIds takes a plain array", () => {
  assert.deepEqual(normalizeMaterialIds(["a", "b"]), ["a", "b"]);
});

test("normalizeMaterialIds parses a jsonb string that arrived unparsed", () => {
  assert.deepEqual(normalizeMaterialIds('["a","b"]'), ["a", "b"]);
});

test("normalizeMaterialIds treats a row written before the column as empty", () => {
  assert.deepEqual(normalizeMaterialIds(null), []);
  assert.deepEqual(normalizeMaterialIds(undefined), []);
});

test("normalizeMaterialIds survives a malformed cell rather than throwing", () => {
  assert.deepEqual(normalizeMaterialIds("{not json"), []);
  assert.deepEqual(normalizeMaterialIds(42), []);
  assert.deepEqual(normalizeMaterialIds({ a: 1 }), []);
});

test("normalizeMaterialIds drops non-strings, blanks and duplicates, keeping order", () => {
  assert.deepEqual(normalizeMaterialIds(["b", "", "a", "b", null, 7, "  ", "c"]), ["b", "a", "c"]);
});

test("normalizeMaterialIds trims whitespace around an id", () => {
  assert.deepEqual(normalizeMaterialIds(["  a  "]), ["a"]);
});

test("readMaterialIds cleans repeated form fields", () => {
  assert.deepEqual(readMaterialIds(["a", "", "a", "b"]), ["a", "b"]);
});

test("readMaterialIds ignores a File that was posted under the same name", () => {
  assert.deepEqual(readMaterialIds(["a", { name: "x" }, "b"]), ["a", "b"]);
});

test("resolveMaterials keeps the round's order, not the library's", () => {
  const lib = [mat("a"), mat("b"), mat("c")];
  assert.deepEqual(
    resolveMaterials(["c", "a"], lib).map((m) => m.id),
    ["c", "a"],
  );
});

test("resolveMaterials drops an id the library has no row for", () => {
  assert.deepEqual(resolveMaterials(["a", "gone"], [mat("a")]).map((m) => m.id), ["a"]);
});

test("resolveMaterials keeps a soft-deleted material, because the round was made in it", () => {
  const out = resolveMaterials(["a"], [mat("a", { deleted: true })]);
  assert.equal(out.length, 1);
  assert.equal(out[0].deleted, true);
});

test("resolveMaterials on an empty round is empty, not everything", () => {
  assert.deepEqual(resolveMaterials([], [mat("a")]), []);
});

test("splitByKind puts fabric before trim regardless of pick order", () => {
  const out = splitByKind([mat("t1", { kind: "trim" }), mat("f1"), mat("t2", { kind: "trim" })]);
  assert.deepEqual(out.fabrics.map((m) => m.id), ["f1"]);
  assert.deepEqual(out.trims.map((m) => m.id), ["t1", "t2"]);
});

test("splitByKind treats an unknown kind as fabric rather than losing it", () => {
  const out = splitByKind([mat("x", { kind: "" })]);
  assert.deepEqual(out.fabrics.map((m) => m.id), ["x"]);
  assert.equal(out.trims.length, 0);
});

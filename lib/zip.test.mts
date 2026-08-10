// Tests for the zip reader.
//
// The fixtures are built here, byte by byte, rather than checked in as a binary
// blob. That is slower to write once and much better afterwards: when this
// breaks, the archive that broke it is readable in the diff instead of being an
// opaque file nobody can inspect.

import test from "node:test";
import assert from "node:assert/strict";
import { readZip, zipText } from "./zip.ts";

type Part = { name: string; body: string; method?: number };

const enc = new TextEncoder();

function bytes(...vals: number[]): number[] {
  return vals;
}
function u16(n: number): number[] {
  return [n & 0xff, (n >> 8) & 0xff];
}
function u32(n: number): number[] {
  return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
}

/** A minimal but structurally real zip. CRCs are zero; nothing checks them. */
function makeZip(parts: Part[], opts: { comment?: string } = {}): Uint8Array {
  const out: number[] = [];
  const dir: number[] = [];
  for (const p of parts) {
    const name = [...enc.encode(p.name)];
    const body = [...enc.encode(p.body)];
    const method = p.method ?? 0;
    const at = out.length;
    out.push(
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(method),
      ...u16(0), ...u16(0), ...u32(0),
      ...u32(body.length), ...u32(body.length),
      ...u16(name.length), ...u16(0),
      ...name, ...body
    );
    dir.push(
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(method),
      ...u16(0), ...u16(0), ...u32(0),
      ...u32(body.length), ...u32(body.length),
      ...u16(name.length), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0), ...u32(0), ...u32(at),
      ...name
    );
  }
  const cdAt = out.length;
  out.push(...dir);
  const comment = [...enc.encode(opts.comment ?? "")];
  out.push(
    ...u32(0x06054b50), ...u16(0), ...u16(0),
    ...u16(parts.length), ...u16(parts.length),
    ...u32(dir.length), ...u32(cdAt), ...u16(comment.length), ...comment
  );
  return new Uint8Array(out);
}

const never = () => {
  throw new Error("inflate should not have been called");
};

test("readZip returns every stored entry by name", () => {
  const z = readZip(makeZip([{ name: "a.xml", body: "<a/>" }, { name: "b/c.xml", body: "<c/>" }]), never);
  assert.deepEqual([...z.keys()], ["a.xml", "b/c.xml"]);
  assert.equal(zipText(z, "a.xml"), "<a/>");
  assert.equal(zipText(z, "b/c.xml"), "<c/>");
});

test("zipText is empty for an entry that is not there", () => {
  const z = readZip(makeZip([{ name: "a.xml", body: "<a/>" }]), never);
  assert.equal(zipText(z, "xl/styles.xml"), "");
});

test("readZip finds the directory past a trailing archive comment", () => {
  const z = readZip(makeZip([{ name: "a.xml", body: "hi" }], { comment: "written by something" }), never);
  assert.equal(zipText(z, "a.xml"), "hi");
});

test("readZip hands deflated entries to the caller's inflate and stores the result", () => {
  const z = readZip(makeZip([{ name: "d.xml", body: "raw", method: 8 }]), () => new TextEncoder().encode("inflated"));
  assert.equal(zipText(z, "d.xml"), "inflated");
});

test("readZip refuses a compression method it cannot honestly read", () => {
  assert.throws(() => readZip(makeZip([{ name: "x", body: "y", method: 12 }]), never), /Unsupported zip compression/);
});

test("readZip refuses something that is not a zip at all", () => {
  assert.throws(() => readZip(new TextEncoder().encode("this is a csv, actually"), never), /Not a zip file/);
});

test("readZip skips directory entries", () => {
  const z = readZip(makeZip([{ name: "xl/", body: "" }, { name: "xl/a.xml", body: "<a/>" }]), never);
  assert.deepEqual([...z.keys()], ["xl/a.xml"]);
});

test("byte helpers stay little-endian", () => {
  assert.deepEqual(u16(0x0201), bytes(0x01, 0x02));
  assert.deepEqual(u32(0x04030201), bytes(0x01, 0x02, 0x03, 0x04));
});

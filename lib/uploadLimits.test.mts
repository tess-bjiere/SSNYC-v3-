// The upload size ceiling exists because Next rejects oversized Server Action
// bodies before our code runs — by then there is no useful error to show. These
// tests pin the messages a person actually reads when a photo is too big.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_UPLOAD_BYTES,
  formatBytes,
  isOversize,
  oversizeError,
} from "./uploadLimits.ts";

test("the limit matches next.config.mjs (25mb)", () => {
  assert.equal(MAX_UPLOAD_BYTES, 25 * 1024 * 1024);
});

test("formatBytes scales through bytes, KB, MB and GB", () => {
  assert.equal(formatBytes(0), "0 bytes");
  assert.equal(formatBytes(900), "900 bytes");
  assert.equal(formatBytes(2048), "2 KB");
  assert.equal(formatBytes(1024 * 1024), "1.0 MB");
  assert.equal(formatBytes(6.42 * 1024 * 1024), "6.4 MB");
  assert.equal(formatBytes(3 * 1024 * 1024 * 1024), "3.0 GB");
});

test("formatBytes refuses to invent a size it does not have", () => {
  assert.equal(formatBytes(NaN), "unknown size");
  assert.equal(formatBytes(-5), "unknown size");
});

test("isOversize is exclusive — a file exactly at the limit still sends", () => {
  assert.equal(isOversize(MAX_UPLOAD_BYTES), false);
  assert.equal(isOversize(MAX_UPLOAD_BYTES + 1), true);
  assert.equal(isOversize(1024), false);
  assert.equal(isOversize(NaN), false);
});

test("oversizeError names the file, its size and the ceiling", () => {
  const msg = oversizeError("look-01.jpg", 40 * 1024 * 1024);
  assert.match(msg, /look-01\.jpg/);
  assert.match(msg, /40\.0 MB/);
  assert.match(msg, /25\.0 MB/);
});

test("oversizeError still reads as a sentence when the file has no name", () => {
  assert.match(oversizeError("  ", 30 * 1024 * 1024), /^That image is 30\.0 MB/);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { isSuperAdmin, parseSuperAdmins } from "./superAdmins.ts";

test("tess and lorne are super-admins by default; nobody else without being named", () => {
  assert.equal(isSuperAdmin("tess@theloyalist.com"), true);
  assert.equal(isSuperAdmin("lorne@theloyalist.com"), true); // Tess, 2026-08-11: "add lorne"
  assert.equal(isSuperAdmin("TESS@THELOYALIST.COM"), true); // case-insensitive
  assert.equal(isSuperAdmin("kara@theloyalist.com"), false); // team is not god mode
  assert.equal(isSuperAdmin(""), false);
  assert.equal(isSuperAdmin(null), false);
  assert.equal(isSuperAdmin(undefined), false);
});

test("the env list names extra super-admins", () => {
  const extra = parseSuperAdmins("kara@theloyalist.com, Max@theloyalist.com");
  assert.deepEqual(extra, ["kara@theloyalist.com", "max@theloyalist.com"]);
  assert.equal(isSuperAdmin("kara@theloyalist.com", extra), true);
  assert.equal(isSuperAdmin("max@theloyalist.com", extra), true);
  assert.equal(isSuperAdmin("gabi@theloyalist.com", extra), false);
});

test("parsing the env value tolerates commas, spaces, blanks and case", () => {
  assert.deepEqual(parseSuperAdmins(""), []);
  assert.deepEqual(parseSuperAdmins(null), []);
  assert.deepEqual(parseSuperAdmins("  A@b.com ,, B@b.com  "), ["a@b.com", "b@b.com"]);
});

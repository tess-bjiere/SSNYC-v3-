import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeStatus,
  statusLabel,
  normalizeApproval,
  normalizeApprovals,
  normalizeStandard,
  normalizeStandards,
} from "./colorStandards.ts";

test("normalizeStatus defaults to pending and only accepts the known keys", () => {
  assert.equal(normalizeStatus("approved"), "approved");
  assert.equal(normalizeStatus("rejected"), "rejected");
  assert.equal(normalizeStatus("pending"), "pending");
  assert.equal(normalizeStatus("nonsense"), "pending");
  assert.equal(normalizeStatus(undefined), "pending");
  assert.equal(statusLabel("approved"), "Approved");
});

// An approval is worthless without the material it is about.
test("normalizeApproval requires a material_id and defaults status", () => {
  assert.equal(normalizeApproval({ status: "approved" }), null);
  assert.equal(normalizeApproval(null), null);
  assert.equal(normalizeApproval("nope"), null);
  const a = normalizeApproval({ material_id: " m1 " });
  assert.deepEqual(a, { material_id: "m1", status: "pending" });
});

test("normalizeApproval keeps the judgement fields it is given", () => {
  const a = normalizeApproval({
    material_id: "m1",
    status: "approved",
    judged_on: "2026-08-23",
    judged_by: "tess@theloyalist.com",
    light: "Daylight",
    lab_dip_url: "https://example.com/dip.jpg",
    note: "half step warmer than the master",
  });
  assert.equal(a?.status, "approved");
  assert.equal(a?.judged_on, "2026-08-23");
  assert.equal(a?.light, "Daylight");
  assert.equal(a?.note, "half step warmer than the master");
});

// One approval per material — a material is either approved against this
// standard or it is not, so a duplicate is a bug, and the first wins.
test("normalizeApprovals drops duplicates and junk, keeping order", () => {
  const list = normalizeApprovals([
    { material_id: "a", status: "approved" },
    { material_id: "b" },
    { material_id: "a", status: "rejected" },
    { status: "approved" },
    null,
  ]);
  assert.deepEqual(list.map((a) => a.material_id), ["a", "b"]);
  assert.equal(list[0].status, "approved");
});

test("normalizeApprovals returns [] for non-arrays", () => {
  assert.deepEqual(normalizeApprovals(undefined), []);
  assert.deepEqual(normalizeApprovals("nope"), []);
});

// A standard with no id or no name cannot be shown or linked to.
test("normalizeStandard requires id and name", () => {
  assert.equal(normalizeStandard({ name: "Standard A" }), null);
  assert.equal(normalizeStandard({ id: "s1" }), null);
  assert.equal(normalizeStandard(null), null);
});

test("normalizeStandard fills the full shape and cleans the hex", () => {
  const s = normalizeStandard({
    id: "s1",
    name: " Standard A ",
    label: "Cold / optic",
    kind: "white",
    hex: "FFF",
    master_location: "studio, white binder",
    approved_on: "2026-08-23",
    brightener: true,
    approvals: [{ material_id: "m1", status: "approved" }],
  });
  assert.equal(s?.name, "Standard A");
  assert.equal(s?.kind, "white");
  assert.equal(s?.hex, "#ffffff");
  assert.equal(s?.brightener, true);
  assert.equal(s?.approvals.length, 1);
  assert.equal(s?.archived, false);
});

// brightener is a tri-state: yes, no, and not-yet-known. Only a real boolean
// counts, so an unset column stays null rather than reading as "no brightener".
test("normalizeStandard keeps brightener tri-state and rejects unknown kinds", () => {
  assert.equal(normalizeStandard({ id: "s", name: "n" })?.brightener, null);
  assert.equal(normalizeStandard({ id: "s", name: "n", brightener: false })?.brightener, false);
  assert.equal(normalizeStandard({ id: "s", name: "n", brightener: "yes" })?.brightener, null);
  assert.equal(normalizeStandard({ id: "s", name: "n", kind: "pantone" })?.kind, "");
});

test("normalizeStandards drops the rows that do not survive", () => {
  const list = normalizeStandards([
    { id: "s1", name: "Standard A" },
    { id: "s2" },
    null,
  ]);
  assert.deepEqual(list.map((s) => s.name), ["Standard A"]);
  assert.deepEqual(normalizeStandards(undefined), []);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeStatus,
  statusLabel,
  normalizeApproval,
  normalizeApprovals,
  normalizeStandard,
  normalizeStandards,
  approvalFor,
  standardForMaterial,
  rollup,
  setApproval,
  removeApproval,
  specLine,
  type ColorStandard,
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

function std(over: Partial<ColorStandard> = {}): ColorStandard {
  return {
    id: "s1", name: "Standard A", label: "", kind: "", pantone: "", hex: "",
    swatch_url: "", master_location: "", approved_on: "", approved_by: "",
    spec: "", brightener: null, notes: "", approvals: [], archived: false,
    ...over,
  };
}

test("approvalFor finds the material's entry or returns null", () => {
  const s = std({ approvals: [{ material_id: "m1", status: "approved" }] });
  assert.equal(approvalFor(s, "m1")?.status, "approved");
  assert.equal(approvalFor(s, "m2"), null);
});

// The materials page needs the other direction: given a material, which standard
// claims it. A material belongs to at most one standard; the first wins.
test("standardForMaterial inverts the map", () => {
  const a = std({ id: "a", name: "A", approvals: [{ material_id: "m1", status: "pending" }] });
  const b = std({ id: "b", name: "B", approvals: [{ material_id: "m2", status: "pending" }] });
  assert.equal(standardForMaterial([a, b], "m2")?.name, "B");
  assert.equal(standardForMaterial([a, b], "m9"), null);
});

test("rollup counts by status", () => {
  const s = std({ approvals: [
    { material_id: "m1", status: "approved" },
    { material_id: "m2", status: "approved" },
    { material_id: "m3", status: "pending" },
    { material_id: "m4", status: "rejected" },
  ] });
  assert.deepEqual(rollup(s), { approved: 2, pending: 1, rejected: 1, total: 4 });
});

// A material that was soft-deleted leaves its approval behind. It must not be
// counted or shown as a broken row, but the entry stays so restoring the
// material restores its approval.
test("rollup ignores approvals whose material no longer resolves", () => {
  const s = std({ approvals: [
    { material_id: "m1", status: "approved" },
    { material_id: "gone", status: "approved" },
  ] });
  assert.deepEqual(rollup(s, new Set(["m1"])), { approved: 1, pending: 0, rejected: 0, total: 1 });
});

test("setApproval adds a new entry and patches an existing one without mutating", () => {
  const s = std({ approvals: [{ material_id: "m1", status: "pending" }] });
  const added = setApproval(s, "m2", { status: "approved", light: "Daylight" });
  assert.deepEqual(added.map((a) => a.material_id), ["m1", "m2"]);
  assert.equal(added[1].status, "approved");
  assert.equal(s.approvals.length, 1, "original untouched");

  const patched = setApproval(s, "m1", { judged_by: "tess@theloyalist.com" });
  assert.equal(patched[0].status, "pending", "unspecified fields survive");
  assert.equal(patched[0].judged_by, "tess@theloyalist.com");
});

// Clearing a field is a real edit — passing "" must remove it, not be ignored.
test("setApproval clears a field when given an empty string", () => {
  const s = std({ approvals: [{ material_id: "m1", status: "approved", note: "old" }] });
  assert.equal(setApproval(s, "m1", { note: "" })[0].note, undefined);
});

test("removeApproval drops just that material", () => {
  const s = std({ approvals: [
    { material_id: "m1", status: "pending" },
    { material_id: "m2", status: "pending" },
  ] });
  assert.deepEqual(removeApproval(s, "m1").map((a) => a.material_id), ["m2"]);
  assert.deepEqual(removeApproval(s, "nope").map((a) => a.material_id), ["m1", "m2"]);
});

test("specLine joins what is set and stays empty when nothing is", () => {
  assert.equal(specLine(std()), "");
  assert.equal(
    specLine(std({ label: "Cold / optic", pantone: "11-0601 TCX", brightener: true })),
    "Cold / optic · 11-0601 TCX · Optical brightener",
  );
  assert.equal(specLine(std({ label: "Soft", brightener: false })), "Soft · No brightener");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeCampaignKind, CAMPAIGN_KINDS } from "./campaign.ts";

// The kind is stored as free text (references.ref_kind), so the reader defends
// against case, whitespace and anything that is not one of the two kinds.

test("normalizeCampaignKind canonicalises case and whitespace", () => {
  assert.equal(normalizeCampaignKind("Editorial"), "Editorial");
  assert.equal(normalizeCampaignKind("editorial"), "Editorial");
  assert.equal(normalizeCampaignKind("  STYLING "), "Styling");
});

test("normalizeCampaignKind returns '' for untagged or unknown", () => {
  assert.equal(normalizeCampaignKind(""), "");
  assert.equal(normalizeCampaignKind(null), "");
  assert.equal(normalizeCampaignKind("image"), "");
  assert.equal(normalizeCampaignKind(7), "");
});

test("the two kinds are exactly Editorial and Styling", () => {
  assert.deepEqual([...CAMPAIGN_KINDS], ["Editorial", "Styling"]);
});

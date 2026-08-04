import { test } from "node:test";
import assert from "node:assert/strict";

import {
  bypassAllowed,
  decideAccess,
  isOrgEmail,
  normalizeEmail,
} from "./authz.ts";

const DOMAIN = "theloyalist.com";

function decide(email: string | null | undefined, allowlist: string[] = []) {
  return decideAccess({ email, domain: DOMAIN, allowlist });
}

test("an address is one address however it was typed", () => {
  assert.equal(normalizeEmail("  Tess@TheLoyalist.com "), "tess@theloyalist.com");
  assert.equal(normalizeEmail(null), "");
  assert.equal(normalizeEmail(undefined), "");
});

test("the org domain lets its own people in, in any casing", () => {
  assert.equal(isOrgEmail("tess@theloyalist.com", DOMAIN), true);
  assert.equal(isOrgEmail("  TESS@THELOYALIST.COM  ", DOMAIN), true);
  assert.equal(decide("tess@theloyalist.com").reason, "org-domain");
});

test("a lookalike domain is not the org domain", () => {
  // Every one of these is a domain somebody else can register.
  assert.equal(isOrgEmail("tess@nottheloyalist.com", DOMAIN), false);
  assert.equal(isOrgEmail("tess@theloyalist.com.example.net", DOMAIN), false);
  assert.equal(isOrgEmail("tess@theloyalist.co", DOMAIN), false);
  assert.equal(isOrgEmail("tess@sub.theloyalist.com", DOMAIN), false);
});

test("the domain must be matched after an @, not anywhere in the string", () => {
  // The local part is attacker-chosen. It must never be able to spell its way in.
  assert.equal(isOrgEmail("theloyalist.com@example.net", DOMAIN), false);
  assert.equal(isOrgEmail("tess@theloyalist.com@example.net", DOMAIN), false);
});

test("nothing that is not an address is admitted", () => {
  for (const bad of ["", "   ", "tess", "@theloyalist.com", null, undefined]) {
    const d = decide(bad as string);
    assert.equal(d.allowed, false, `admitted ${JSON.stringify(bad)}`);
    assert.equal(d.reason, "no-email");
  }
});

test("a guest is admitted only by being on the list", () => {
  assert.equal(decide("gabby@gmail.com").allowed, false);
  assert.equal(decide("gabby@gmail.com").reason, "not-allowed");
  const ok = decide("gabby@gmail.com", ["gabby@gmail.com"]);
  assert.equal(ok.allowed, true);
  assert.equal(ok.reason, "allowlist");
});

test("a guest entered with capitals or stray spaces still gets in", () => {
  // The bug this prevents has no error message: she is simply turned away by a
  // system that believes it approved her.
  const d = decide("gabby@gmail.com", ["  Gabby@Gmail.com  "]);
  assert.equal(d.allowed, true);
  assert.equal(d.reason, "allowlist");
});

test("a signed-in address with capitals matches a lowercase allowlist row", () => {
  assert.equal(decide("Gabby@Gmail.COM", ["gabby@gmail.com"]).allowed, true);
});

test("junk rows in the allowlist admit nobody and crash nothing", () => {
  const d = decide("gabby@gmail.com", [null as unknown as string, undefined as unknown as string, "", "   "]);
  assert.equal(d.allowed, false);
  // And an empty-ish signed-in address must not be matched by an empty row.
  assert.equal(decideAccess({ email: "", domain: DOMAIN, allowlist: [""] }).allowed, false);
});

test("an empty allowlist changes nothing for the org's own people", () => {
  assert.equal(decide("tess@theloyalist.com", []).allowed, true);
});

test("the decision reports the address it decided about", () => {
  assert.equal(decide("  TESS@theloyalist.com ").email, "tess@theloyalist.com");
});

test("the login bypass is off unless it is explicitly, exactly on", () => {
  assert.equal(bypassAllowed({ flag: "true" }), true);
  for (const flag of ["false", "TRUE", "1", "yes", "", null, undefined]) {
    assert.equal(bypassAllowed({ flag: flag as string }), false, `honoured ${JSON.stringify(flag)}`);
  }
});

test("the login bypass is refused on a production deployment whatever the flag says", () => {
  // The flag is NEXT_PUBLIC_ and set by hand in a dashboard. Leaving it on must
  // not be able to open the studio's library to the internet.
  assert.equal(bypassAllowed({ flag: "true", vercelEnv: "production" }), false);
  assert.equal(bypassAllowed({ flag: "true", vercelEnv: "  Production  " }), false);
  // Preview deployments and local work still get it.
  assert.equal(bypassAllowed({ flag: "true", vercelEnv: "preview" }), true);
  assert.equal(bypassAllowed({ flag: "true", vercelEnv: "development" }), true);
});

import test from "node:test";
import assert from "node:assert/strict";
import { decideAuthorization } from "../src/authorization.js";

test("explicit Admin Hub permission allows an authorized user", () => {
  assert.equal(decideAuthorization({ schema: { AdminHubAccess: "AdminHubAccess" }, row: { AdminHubAccess: "Yes" }, legacyAllowed: false }).allowed, true);
});

test("explicit Admin Hub denial wins over a legacy role fallback", () => {
  assert.equal(decideAuthorization({ schema: { AdminHubAccess: "AdminHubAccess" }, row: { AdminHubAccess: "No" }, legacyAllowed: true }).allowed, false);
});

test("Admin Panel permission does not imply Admin Hub access", () => {
  const result = decideAuthorization({ schema: { "Admin Panel": "AdminPanel" }, row: { AdminPanel: "Yes" }, legacyAllowed: false });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "explicit-column-missing");
});

test("missing explicit access columns fail closed", () => {
  assert.equal(decideAuthorization({ schema: { Email: "Email", PACE: "PACE" }, row: { PACE: "Yes" }, legacyAllowed: true }).allowed, false);
  assert.equal(decideAuthorization({ schema: { Email: "Email", PACE: "PACE" }, row: { PACE: "Yes" }, legacyAllowed: true }).allowed, false);
});

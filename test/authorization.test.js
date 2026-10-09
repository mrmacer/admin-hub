import test from "node:test";
import assert from "node:assert/strict";
import { decideAuthorization } from "../src/authorization.js";

test("an IEP_App_Users row with Admin Panel = Yes allows access", () => {
  const result = decideAuthorization({ row: { "Admin Panel": "Yes" }, legacyAllowed: false });
  assert.equal(result.allowed, true);
  assert.equal(result.reason, "app-users-permission");
});

test("an IEP_App_Users row with Admin Panel = No denies even an administrator", () => {
  assert.equal(decideAuthorization({ row: { "Admin Panel": "No" }, legacyAllowed: true }).allowed, false);
  assert.equal(decideAuthorization({ row: { "Admin Panel": false }, legacyAllowed: true }).allowed, false);
  assert.equal(decideAuthorization({ row: { PACE: "Yes" }, legacyAllowed: true }).allowed, false);
});

test("other app flags do not grant Admin Hub access", () => {
  const result = decideAuthorization({ row: { PACE: true, Walkthrough: true, "Daily Pulse": true, "Admin Panel": false }, legacyAllowed: false });
  assert.equal(result.allowed, false);
});

test("no row falls back to the active administrator rule", () => {
  assert.equal(decideAuthorization({ row: null, legacyAllowed: true, enforce: false }).reason, "legacy-fallback");
  assert.equal(decideAuthorization({ row: null, legacyAllowed: false, enforce: false }).allowed, false);
});

test("enforced mode denies users with no row", () => {
  const result = decideAuthorization({ row: null, legacyAllowed: true, enforce: true });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "enforced-no-row");
});

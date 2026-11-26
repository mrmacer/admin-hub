import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { createEntraTokenValidator } from "../src/server/entra.js";
import { resolveAdminPrincipal } from "../src/server/authorization.js";
import { createAdminApiHandler } from "../src/server/handler.js";
import { readRuntimeConfig } from "../src/server/runtime-config.js";

const env = {
  ADMIN_HUB_APP_ENV: "production",
  ADMIN_HUB_GRAPH_TENANT_ID: "tenant-1",
  ADMIN_HUB_ENTRA_ISSUER: "https://login.microsoftonline.com/tenant-1/v2.0",
  ADMIN_HUB_ENTRA_AUDIENCE: "api://admin-hub",
  ADMIN_HUB_GRAPH_CLIENT_ID: "graph-client",
  ADMIN_HUB_GRAPH_CLIENT_SECRET: "not-a-real-secret",
  ADMIN_HUB_ALLOWED_ORIGINS: "https://admin-hub-beige.vercel.app,http://localhost:4173",
  ADMIN_HUB_AUTHZ_REGISTRY_PROTECTED: "true",
  ADMIN_HUB_AUDIT_PROTECTION_CONFIRMED: "false",
  ADMIN_HUB_WRITE_ENABLED: "true"
};

function tokenClaims(overrides = {}) {
  return { authenticated: true, email: "admin@iu29.org", oid: "oid-1", name: "Synthetic Admin", tid: "tenant-1", ...overrides };
}

function mockResponse(body, status = 200) { return { ok: status >= 200 && status < 300, status, async json() { return body; }, async text() { return JSON.stringify(body); } }; }

function makeResponse() {
  return { statusCode: 0, headers: {}, body: "", setHeader(key, value) { this.headers[key] = value; }, end(value) { this.body = value; } };
}

test("runtime configuration keeps production writes closed until both protections are confirmed", () => {
  const config = readRuntimeConfig(env);
  assert.equal(config.appEnv, "production");
  assert.equal(config.writeRequested, true);
  assert.equal(config.writeEnabled, false);
  assert.equal(config.listIds.IEP_Pace_Admin_Audit, "2635ec81-5012-475a-a962-ab23299eabbc");
});

test("Entra validator rejects wrong tenant, audience, issuer and expiry", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" });
  const config = readRuntimeConfig(env);
  const now = 1_700_000_000;
  const validator = createEntraTokenValidator({ config, now: () => now, fetchImpl: async () => mockResponse({ keys: [{ ...jwk, kid: "kid-1", kty: "RSA", alg: "RS256" }] }) });
  const makeToken = (claims = {}, key = privateKey) => {
    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT", kid: "kid-1" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ iss: config.issuer, aud: config.audience, tid: config.tenantId, oid: "oid-1", preferred_username: "admin@iu29.org", exp: now + 300, ...claims })).toString("base64url");
    const input = `${header}.${payload}`;
    return `${input}.${sign("RSA-SHA256", Buffer.from(input), key).toString("base64url")}`;
  };
  const valid = await validator.validate(`Bearer ${makeToken()}`);
  assert.equal(valid.email, "admin@iu29.org");
  await assert.rejects(() => validator.validate(`Bearer ${makeToken({ tid: "other-tenant" })}`), /different application or tenant/);
  await assert.rejects(() => validator.validate(`Bearer ${makeToken({ aud: "other-api" })}`), /different application or tenant/);
  await assert.rejects(() => validator.validate(`Bearer ${makeToken({ iss: "https:\/\/issuer.invalid" })}`), /different application or tenant/);
  await assert.rejects(() => validator.validate(`Bearer ${makeToken({ exp: now - 1 })}`), /expired/);
  const other = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
  await assert.rejects(() => validator.validate(`Bearer ${makeToken({}, other)}`), /signature is invalid/);
});

function authGraph({ active = true, entitlement = true, duplicate = false, includeField = true } = {}) {
  const users = [{ Email: "admin@iu29.org", Active: active }];
  const appUsers = [{ Email: "admin@iu29.org", AdminHubAccess: entitlement }];
  if (duplicate) appUsers.push({ Email: "admin@iu29.org", AdminHubAccess: true });
  return {
    async getListItems(name) { return name === "IEP_Users2" ? users : appUsers; },
    async getSchema() { return includeField ? { AdminHubAccess: "AdminHubAccess" } : { PACE: "PACE" }; }
  };
}

test("server authorization requires an active identity and explicit AdminHubAccess", async () => {
  const config = readRuntimeConfig(env);
  const allowed = await resolveAdminPrincipal({ tokenClaims: tokenClaims(), graphClient: authGraph(), config });
  assert.equal(allowed.adminHubAllowed, true);
  await assert.rejects(() => resolveAdminPrincipal({ tokenClaims: tokenClaims(), graphClient: authGraph({ entitlement: false }), config }), /not explicitly authorized/);
  await assert.rejects(() => resolveAdminPrincipal({ tokenClaims: tokenClaims(), graphClient: authGraph({ active: false }), config }), /inactive/);
  await assert.rejects(() => resolveAdminPrincipal({ tokenClaims: tokenClaims(), graphClient: authGraph({ duplicate: true }), config }), /missing or duplicated/);
  await assert.rejects(() => resolveAdminPrincipal({ tokenClaims: tokenClaims(), graphClient: authGraph({ includeField: false }), config }), /not configured/);
});

test("API enforces same-origin JSON mutations and never exposes DELETE", async () => {
  const config = readRuntimeConfig(env);
  const service = { async handle({ method, path, principal, body }) { return { status: 200, body: { method, path, email: principal.email, operationId: body.operationId } }; } };
  const handler = createAdminApiHandler({ config, tokenValidator: { async validate() { return tokenClaims(); } }, authorizationResolver: async () => ({ authenticated: true, active: true, adminHubAllowed: true, email: "admin@iu29.org" }), service, graphClient: {} });
  let response = makeResponse();
  await handler({ method: "POST", url: "/api/admin/pace/visits/42/edit", headers: { origin: "https://evil.invalid", "content-type": "application/json" }, body: { operationId: "op-1" } }, response);
  assert.equal(response.statusCode, 403);
  response = makeResponse();
  await handler({ method: "POST", url: "/api/admin/pace/visits/42/edit", headers: { origin: "https://admin-hub-beige.vercel.app", "content-type": "application/json" }, body: { operationId: "op-1" } }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(JSON.parse(response.body).email, "admin@iu29.org");
  response = makeResponse();
  await handler({ method: "DELETE", url: "/api/admin/pace/visits/42", headers: {} }, response);
  assert.equal(response.statusCode, 405);
  assert.match(response.body, /Permanent deletion is not supported/);
});

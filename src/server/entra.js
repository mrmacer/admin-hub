import { createPublicKey, verify as verifySignature } from "node:crypto";
import { missingRuntimeConfig, RuntimeConfigError } from "./runtime-config.js";

function decodePart(value) {
  try { return Buffer.from(value, "base64url").toString("utf8"); } catch { throw new RuntimeConfigError("The Entra token is malformed.", "INVALID_TOKEN"); }
}

function parseToken(token) {
  const parts = String(token ?? "").split(".");
  if (parts.length !== 3) throw new RuntimeConfigError("The Entra token is malformed.", "INVALID_TOKEN");
  try { return { header: JSON.parse(decodePart(parts[0])), claims: JSON.parse(decodePart(parts[1])), signingInput: `${parts[0]}.${parts[1]}`, signature: Buffer.from(parts[2], "base64url") }; }
  catch { throw new RuntimeConfigError("The Entra token is malformed.", "INVALID_TOKEN"); }
}

function bearerValue(header) {
  const value = String(header ?? "");
  const match = value.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new RuntimeConfigError("A bearer token is required.", "UNAUTHENTICATED");
  return match[1].trim();
}

function audienceMatches(aud, expected) { return Array.isArray(aud) ? aud.includes(expected) : aud === expected; }

export function createEntraTokenValidator({ config, fetchImpl = globalThis.fetch, now = () => Math.floor(Date.now() / 1000) } = {}) {
  let cachedKeys = null;
  let cachedAt = 0;
  const cacheMs = 15 * 60 * 1000;

  async function keys() {
    const missing = missingRuntimeConfig(config);
    if (missing.length) throw new RuntimeConfigError("The server authentication configuration is incomplete.", "AUTH_CONFIG_MISSING");
    if (cachedKeys && Date.now() - cachedAt < cacheMs) return cachedKeys;
    if (typeof fetchImpl !== "function") throw new RuntimeConfigError("Server fetch is unavailable.", "AUTH_CONFIG_MISSING");
    const response = await fetchImpl(`https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/discovery/v2.0/keys`, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new RuntimeConfigError("Microsoft Entra signing keys are unavailable.", "AUTH_PROVIDER_UNAVAILABLE");
    const data = await response.json();
    cachedKeys = data.keys ?? [];
    cachedAt = Date.now();
    return cachedKeys;
  }

  return {
    async validate(authorizationHeader) {
      const token = bearerValue(authorizationHeader);
      const { header, claims, signingInput, signature } = parseToken(token);
      if (header.alg !== "RS256" || !header.kid) throw new RuntimeConfigError("The Entra token uses an unsupported signing algorithm.", "INVALID_TOKEN");
      if (claims.iss !== config.issuer || claims.tid !== config.tenantId || !audienceMatches(claims.aud, config.audience)) throw new RuntimeConfigError("The Entra token was issued for a different application or tenant.", "INVALID_TOKEN");
      const current = now();
      if (!Number.isFinite(claims.exp) || claims.exp <= current || (claims.nbf !== undefined && claims.nbf > current + 60)) throw new RuntimeConfigError("The Entra token is expired or not yet valid.", "INVALID_TOKEN");
      const jwk = (await keys()).find(key => key.kid === header.kid && key.kty === "RSA");
      if (!jwk) throw new RuntimeConfigError("The Entra token signing key is unavailable.", "INVALID_TOKEN");
      let valid = false;
      try { valid = verifySignature("RSA-SHA256", Buffer.from(signingInput), createPublicKey({ key: jwk, format: "jwk" }), signature); } catch { valid = false; }
      if (!valid) throw new RuntimeConfigError("The Entra token signature is invalid.", "INVALID_TOKEN");
      const email = String(claims.preferred_username ?? claims.upn ?? claims.email ?? "").trim().toLowerCase();
      if (!email || !claims.oid) throw new RuntimeConfigError("The authenticated Entra identity is incomplete.", "INVALID_TOKEN");
      return { authenticated: true, email, oid: String(claims.oid), name: String(claims.name ?? email).trim(), tenantId: claims.tid, claims };
    }
  };
}

export function createClientCredentialTokenProvider({ config, fetchImpl = globalThis.fetch, now = () => Date.now() } = {}) {
  let cached = null;
  return {
    async getToken() {
      const missing = missingRuntimeConfig(config, { requireWriteCredential: true });
      if (missing.length) throw new RuntimeConfigError("The server Graph credential configuration is incomplete.", "GRAPH_CONFIG_MISSING");
      if (cached && cached.expiresAt > now() + 60_000) return cached.accessToken;
      const response = await fetchImpl(`https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams({ client_id: config.graphClientId, client_secret: config.graphClientSecret, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" }).toString()
      });
      if (!response.ok) throw new RuntimeConfigError("The server could not acquire a Microsoft Graph token.", "GRAPH_AUTH_FAILED");
      const data = await response.json();
      if (!data.access_token) throw new RuntimeConfigError("Microsoft Graph did not return an application token.", "GRAPH_AUTH_FAILED");
      cached = { accessToken: data.access_token, expiresAt: now() + Number(data.expires_in ?? 3600) * 1000 };
      return cached.accessToken;
    }
  };
}

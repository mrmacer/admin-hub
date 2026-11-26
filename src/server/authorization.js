import { CONFIG } from "../config.js";

export class AuthorizationResolutionError extends Error {
  constructor(message, code = "FORBIDDEN", status = 403) { super(message); this.name = "AuthorizationResolutionError"; this.code = code; this.status = status; }
}

function bool(value) { return value === true || ["yes", "true", "1"].includes(String(value ?? "").trim().toLowerCase()); }
function emailOf(row) { return String(row?.Email ?? row?.email ?? row?.EMail ?? row?.["Email Address"] ?? row?.EmailAddress ?? "").trim().toLowerCase(); }

export async function resolveAdminPrincipal({ tokenClaims, graphClient, config } = {}) {
  if (!tokenClaims?.authenticated || !tokenClaims.email || !tokenClaims.oid) throw new AuthorizationResolutionError("The authenticated identity is incomplete.", "UNAUTHENTICATED", 401);
  if (config?.authzRegistryProtected !== true) throw new AuthorizationResolutionError("The authorization registry protection has not been verified.", "AUTHZ_REGISTRY_UNVERIFIED", 503);

  const [users, appUsers, appSchema] = await Promise.all([
    graphClient.getListItems(CONFIG.lists.users),
    graphClient.getListItems(CONFIG.lists.appUsers),
    graphClient.getSchema(CONFIG.lists.appUsers)
  ]);
  const email = tokenClaims.email.toLowerCase();
  const identityMatches = users.filter(row => emailOf(row) === email);
  if (identityMatches.length !== 1) throw new AuthorizationResolutionError("The authenticated identity is missing, duplicated, or unauthorized.", "IDENTITY_NOT_UNIQUE");
  const identity = identityMatches[0];
  if (!bool(identity.field_3 ?? identity.Active)) throw new AuthorizationResolutionError("The authenticated identity is inactive.", "IDENTITY_INACTIVE");

  const entitlementField = appSchema?.AdminHubAccess;
  if (!entitlementField) throw new AuthorizationResolutionError("AdminHubAccess is not configured in IEP_App_Users.", "AUTHZ_SCHEMA_MISMATCH", 503);
  const entitlementMatches = appUsers.filter(row => emailOf(row) === email);
  if (entitlementMatches.length !== 1) throw new AuthorizationResolutionError("The Admin Hub authorization entry is missing or duplicated.", "AUTHZ_NOT_UNIQUE");
  if (!bool(entitlementMatches[0]["AdminHubAccess"] ?? entitlementMatches[0][entitlementField])) throw new AuthorizationResolutionError("The authenticated identity is not explicitly authorized for Admin Hub.", "FORBIDDEN");

  return { authenticated: true, active: true, adminHubAllowed: true, email, actor: email, oid: tokenClaims.oid, name: tokenClaims.name };
}

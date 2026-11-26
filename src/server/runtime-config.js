import { APP_ENV, CONFIG } from "../config.js";

export const VERIFIED_RESOURCE_IDS = Object.freeze({
  paceVisits: "a905e5df-624b-4fa1-8460-091e9bd62a22",
  reviews: "35073e8c-3d6a-428b-a577-f79f890e6e73",
  notes: "b4a9fb52-b006-4bd1-a369-05f632512d74",
  audit: "2635ec81-5012-475a-a962-ab23299eabbc",
  appUsers: "43bac604-7880-4f0f-aed9-b7f2fea82133",
  users2: "5ff962d7-03b1-464b-84af-f8e332627779"
});

export class RuntimeConfigError extends Error {
  constructor(message, code = "RUNTIME_CONFIG_INVALID") {
    super(message);
    this.name = "RuntimeConfigError";
    this.code = code;
    this.status = 503;
  }
}

function booleanValue(value) {
  return value === true || ["true", "1", "yes"].includes(String(value ?? "").trim().toLowerCase());
}

function listValue(value) {
  return String(value ?? "").split(",").map(item => item.trim()).filter(Boolean);
}

function envValue(env, key, fallback = "") {
  const value = env?.[key];
  return value === undefined || value === null ? fallback : String(value).trim();
}

export function readRuntimeConfig(env = typeof process === "undefined" ? {} : process.env) {
  const appEnv = envValue(env, "ADMIN_HUB_APP_ENV", APP_ENV);
  const tenantId = envValue(env, "ADMIN_HUB_GRAPH_TENANT_ID");
  const issuer = envValue(env, "ADMIN_HUB_ENTRA_ISSUER", tenantId ? `https://login.microsoftonline.com/${tenantId}/v2.0` : "");
  const audience = envValue(env, "ADMIN_HUB_ENTRA_AUDIENCE");
  const writeRequested = booleanValue(env?.ADMIN_HUB_WRITE_ENABLED);
  const authzProtected = booleanValue(env?.ADMIN_HUB_AUTHZ_REGISTRY_PROTECTED);
  const auditProtected = booleanValue(env?.ADMIN_HUB_AUDIT_PROTECTION_CONFIRMED);

  return Object.freeze({
    appEnv,
    tenantId,
    issuer,
    audience,
    graphClientId: envValue(env, "ADMIN_HUB_GRAPH_CLIENT_ID"),
    graphClientSecret: envValue(env, "ADMIN_HUB_GRAPH_CLIENT_SECRET"),
    graphSitePath: envValue(env, "ADMIN_HUB_GRAPH_SITE_PATH", CONFIG.sitePath),
    graphApiBase: "https://graph.microsoft.com/v1.0",
    allowedOrigins: listValue(envValue(env, "ADMIN_HUB_ALLOWED_ORIGINS")),
    authzRegistryProtected: authzProtected,
    auditProtectionConfirmed: auditProtected,
    writeRequested,
    writeEnabled: appEnv === "production" && writeRequested && authzProtected && auditProtected,
    authzField: "AdminHubAccess",
    listIds: Object.freeze({
      [CONFIG.lists.paceVisits]: envValue(env, "ADMIN_HUB_GRAPH_PACE_LIST_ID", VERIFIED_RESOURCE_IDS.paceVisits),
      IEP_Pace_Admin_Reviews: envValue(env, "ADMIN_HUB_GRAPH_REVIEWS_LIST_ID", VERIFIED_RESOURCE_IDS.reviews),
      IEP_Pace_Admin_Notes: envValue(env, "ADMIN_HUB_GRAPH_NOTES_LIST_ID", VERIFIED_RESOURCE_IDS.notes),
      IEP_Pace_Admin_Audit: envValue(env, "ADMIN_HUB_GRAPH_AUDIT_LIST_ID", VERIFIED_RESOURCE_IDS.audit),
      [CONFIG.lists.appUsers]: envValue(env, "ADMIN_HUB_GRAPH_APP_USERS_LIST_ID", VERIFIED_RESOURCE_IDS.appUsers),
      [CONFIG.lists.users]: envValue(env, "ADMIN_HUB_GRAPH_USERS2_LIST_ID", VERIFIED_RESOURCE_IDS.users2)
    })
  });
}

export function missingRuntimeConfig(config, { requireWriteCredential = false } = {}) {
  const missing = [];
  for (const [key, label] of [["appEnv", "ADMIN_HUB_APP_ENV"], ["tenantId", "ADMIN_HUB_GRAPH_TENANT_ID"], ["issuer", "ADMIN_HUB_ENTRA_ISSUER"], ["audience", "ADMIN_HUB_ENTRA_AUDIENCE"], ["graphSitePath", "ADMIN_HUB_GRAPH_SITE_PATH"]]) if (!config?.[key]) missing.push(label);
  if (requireWriteCredential && (!config?.graphClientId || !config?.graphClientSecret)) missing.push("ADMIN_HUB_GRAPH_CLIENT_ID/ADMIN_HUB_GRAPH_CLIENT_SECRET");
  return missing;
}

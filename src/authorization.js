import { APP_ENV, CONFIG } from "./config.js";
import { AUTH } from "./auth.js";

function bool(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  return ["yes", "true", "1"].includes(String(value ?? "").trim().toLowerCase());
}

function findField(schema, candidates) { return candidates.find(name => Object.prototype.hasOwnProperty.call(schema ?? {}, name)) ?? null; }

export function decideAuthorization({ schema = {}, row = null, legacyAllowed = false } = {}) {
  const adminHubField = findField(schema, CONFIG.authorization.adminHubFields);
  const paceField = findField(schema, CONFIG.authorization.paceDashboardFields);
  if (adminHubField && row) {
    return { allowed: bool(row[adminHubField]), reason: bool(row[adminHubField]) ? "explicit-admin-hub" : "explicit-denied", field: adminHubField };
  }
  if (paceField && row) {
    return { allowed: bool(row[paceField]), reason: bool(row[paceField]) ? "explicit-pace-dashboard" : "explicit-denied", field: paceField };
  }
  if (!adminHubField && !paceField) return { allowed: Boolean(legacyAllowed), reason: legacyAllowed ? "temporary-role-fallback" : "temporary-role-fallback-denied" };
  return { allowed: false, reason: "explicit-column-present-no-row" };
}

export const APP_USERS = {
  row: null, schema: null, error: null, decision: null,
  async authorize() {
    if (APP_ENV === "demo") { this.decision = { allowed: true, reason: "demo-environment" }; return this.decision; }
    if (APP_ENV !== "production") { this.decision = { allowed: false, reason: "invalid-environment" }; return this.decision; }
    try {
      const [rows, schema] = await Promise.all([window.GRAPH.getAppUsers(), window.GRAPH.getAppUsersSchema()]);
      this.schema = schema;
      this.row = rows.find(row => String(row.Email ?? "").trim().toLowerCase() === AUTH.email.toLowerCase().trim()) ?? null;
      // Temporary migration fallback only. It deliberately checks the
      // existing active identity/administrator role and never Admin Panel.
      const legacyAllowed = Boolean(AUTH.staff?.active) && AUTH.staff?.role.toLowerCase() === "administrator";
      this.decision = decideAuthorization({ schema, row: this.row, legacyAllowed });
      return this.decision;
    } catch (error) {
      this.error = error;
      this.decision = { allowed: false, reason: "lookup-failed" };
      return this.decision;
    }
  },
  get isAllowed() { return Boolean(this.decision?.allowed); },
  get authorizationNote() {
    if (APP_ENV === "demo") return "Demo access is enabled for this synthetic-only build.";
    if (this.decision?.reason?.startsWith("temporary")) return "Temporary migration fallback: add an explicit Admin Hub flag before broader use.";
    return this.decision?.field ? `Authorized by ${this.decision.field}.` : "Authorization is explicit to Admin Hub.";
  },
  // Exposed for tests and documentation checks: Admin Panel is not read here.
  adminPanelIsNeverUsed: true
};

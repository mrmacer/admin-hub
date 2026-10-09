import { CONFIG } from "./config.js";
import { AUTH } from "./auth.js";

function bool(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  return ["yes", "true", "1"].includes(String(value ?? "").trim().toLowerCase());
}

// Same model as PACE, MAC-Walkthrough and Daily Pulse: an IEP_App_Users row is
// authoritative whenever it exists. With no row, the user falls back to the
// legacy rule (active IEP_Users2 administrator) unless enforceAppUsers is on.
export function decideAuthorization({ row = null, legacyAllowed = false, enforce = CONFIG.authorization.enforceAppUsers } = {}) {
  const field = CONFIG.authorization.permissionField;
  if (row) {
    const allowed = bool(row[field]);
    return { allowed, reason: allowed ? "app-users-permission" : "app-users-denied", field };
  }
  if (enforce) return { allowed: false, reason: "enforced-no-row" };
  return { allowed: Boolean(legacyAllowed), reason: legacyAllowed ? "legacy-fallback" : "legacy-denied" };
}

export const APP_USERS = {
  row: null, error: null, decision: null,
  async authorize() {
    try {
      const rows = await window.GRAPH.getAppUsers();
      const email = AUTH.email.toLowerCase().trim();
      this.row = rows.find(row => String(row.Email ?? "").trim().toLowerCase() === email) ?? null;
      const legacyAllowed = Boolean(AUTH.staff?.active) && AUTH.staff?.role.toLowerCase() === "administrator";
      this.decision = decideAuthorization({ row: this.row, legacyAllowed });
      return this.decision;
    } catch (error) {
      // A failed lookup always denies; it never falls back to the legacy rule.
      this.error = error;
      this.decision = { allowed: false, reason: "lookup-failed" };
      return this.decision;
    }
  },
  get authorizationNote() {
    const field = CONFIG.authorization.permissionField;
    if (this.decision?.reason === "app-users-denied") return `Your IEP_App_Users row does not have ${field} set to Yes.`;
    if (this.decision?.reason === "enforced-no-row") return "You do not have a row in IEP_App_Users.";
    return `Ask an administrator to set ${field} to Yes on your IEP_App_Users row.`;
  }
};

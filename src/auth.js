import { CONFIG } from "./config.js";

// Email columns checked in IEP_Users2 and IEP_App_Users.
export const EMAIL_FIELDS = ["Email", "email", "EMail", "Email Address", "EmailAddress"];
const INTERACTION_CODES = ["interaction_required", "consent_required", "login_required", "no_tokens_found"];

export function normalizeEmail(value) { return String(value ?? "").trim().toLowerCase(); }

export function rowMatchesEmail(row, emails) {
  const wanted = new Set(emails.map(normalizeEmail).filter(Boolean));
  return EMAIL_FIELDS.some(field => wanted.has(normalizeEmail(row?.[field])));
}

// Asks SharePoint for just the matching row. The filter is an exact match, so
// if it fails or finds nothing (e.g. stray spaces in a stored email) the whole
// list is read and matched here instead.
export async function findRowByEmail(listName, emails) {
  const match = rows => rows.find(row => rowMatchesEmail(row, emails)) ?? null;
  try {
    const found = match(await window.GRAPH.getListItems(listName, { equals: { fields: EMAIL_FIELDS, values: emails } }));
    if (found) return found;
  } catch (error) {
    console.warn(`Filtered ${listName} lookup failed; reading the whole list instead.`, error);
  }
  return match(await window.GRAPH.getListItems(listName));
}

// Only these MSAL errors can be fixed by sending the user back through sign-in.
// Anything else (network, misconfiguration) must surface instead of looping.
export function needsInteraction(error) {
  const InteractionError = globalThis.window?.msal?.InteractionRequiredAuthError;
  return Boolean((InteractionError && error instanceof InteractionError) || error?.name === "InteractionRequiredAuthError" || INTERACTION_CODES.includes(error?.errorCode));
}

export const AUTH = {
  client: null, account: null, staff: null, error: null, signInError: null,
  async init() {
    if (!window.msal) throw new Error("Microsoft sign-in is unavailable in this browser session.");
    this.client = new window.msal.PublicClientApplication({ auth: { clientId: CONFIG.auth.clientId, authority: CONFIG.auth.authority, redirectUri: window.location.origin }, cache: { cacheLocation: "localStorage", storeAuthStateInCookie: false } });
    let response = null;
    try { response = await this.client.handleRedirectPromise(); }
    catch (error) { console.error(error); this.signInError = "Sign-in did not complete. Please try again."; }
    this.account = response?.account ?? this.client.getAllAccounts()[0] ?? null;
    if (!this.account) return;
    const user = await findRowByEmail(CONFIG.lists.users, this.emails);
    if (!user) { this.error = "Your IEP Skook account was not found."; return; }
    const activeValue = user.field_3 ?? user.Active;
    const active = activeValue === true || ["yes", "true", "1"].includes(String(activeValue).toLowerCase());
    if (!active) { this.error = "Your IEP Skook account is inactive. Contact an administrator."; return; }
    this.staff = { id: user.id, name: String(user.field_1 ?? user.Name ?? user.Title ?? this.account.name ?? "").trim(), role: String(Array.isArray(user.field_2) ? user.field_2[0] : user.field_2 ?? user.Role ?? "").trim(), active };
  },
  get isAuthenticated() { return Boolean(this.account && this.staff); },
  get displayName() { return this.account?.name || this.account?.username || ""; },
  // Sign-in name plus the email claims, since a staff list may hold either.
  get emails() {
    const claims = this.account?.idTokenClaims ?? {};
    return [...new Set([this.account?.username, claims.email, claims.preferred_username, claims.upn].map(normalizeEmail).filter(Boolean))];
  },
  async acquireGraphToken() {
    if (!this.client || !this.account) throw new Error("You are not signed in.");
    const request = { scopes: CONFIG.auth.scopes, account: this.account };
    try { return (await this.client.acquireTokenSilent(request)).accessToken; }
    catch (error) {
      if (!needsInteraction(error)) throw error;
      await this.client.acquireTokenRedirect(request);
      // The browser is leaving the page; never resolve so nothing runs with no token.
      return new Promise(() => {});
    }
  },
  login() { this.client?.loginRedirect({ scopes: CONFIG.auth.scopes }); },
  logout() { if (this.client && this.account) return this.client.logoutRedirect({ account: this.account, postLogoutRedirectUri: window.location.origin }); }
};

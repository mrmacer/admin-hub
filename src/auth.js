import { APP_ENV, CONFIG } from "./config.js";

export const AUTH = {
  client: null, account: null, staff: null, error: null,
  async init() {
    if (APP_ENV !== "production") return { skipped: true };
    if (!window.msal) throw new Error("Microsoft sign-in is unavailable in this browser session.");
    this.client = new window.msal.PublicClientApplication({ auth: { clientId: CONFIG.auth.clientId, authority: CONFIG.auth.authority, redirectUri: window.location.origin }, cache: { cacheLocation: "localStorage", storeAuthStateInCookie: false } });
    const response = await this.client.handleRedirectPromise();
    this.account = response?.account ?? this.client.getAllAccounts()[0] ?? null;
    if (!this.account) return;
    const users = await window.GRAPH.getListItems(CONFIG.lists.users);
    const target = this.account.username.toLowerCase().trim();
    const user = users.find(row => [row.Email, row.email, row.EMail, row["Email Address"], row.EmailAddress].some(value => String(value ?? "").toLowerCase().trim() === target));
    if (!user) { this.error = "Your IEP Skook account was not found."; return; }
    const activeValue = user.field_3 ?? user.Active;
    const active = activeValue === true || ["yes", "true", "1"].includes(String(activeValue).toLowerCase());
    if (!active) { this.error = "Your IEP Skook account is inactive. Contact an administrator."; return; }
    this.staff = { id: user.id, name: String(user.field_1 ?? user.Name ?? user.Title ?? this.account.name ?? "").trim(), role: String(Array.isArray(user.field_2) ? user.field_2[0] : user.field_2 ?? user.Role ?? "").trim(), active };
  },
  get isAuthenticated() { return APP_ENV === "production" && Boolean(this.account && this.staff); },
  get displayName() { return this.account?.name || this.account?.username || ""; },
  get email() { return this.account?.username ?? "demo@example.invalid"; },
  async acquireGraphToken() {
    if (APP_ENV !== "production") throw new Error("Microsoft Graph access is disabled outside production.");
    if (!this.client || !this.account) throw new Error("You are not signed in.");
    const response = await this.client.acquireTokenSilent({ scopes: CONFIG.auth.scopes, account: this.account });
    return response.accessToken;
  },
  login() { if (APP_ENV === "production") this.client?.loginRedirect({ scopes: CONFIG.auth.scopes }); },
  logout() { if (APP_ENV === "production" && this.client && this.account) return this.client.logoutRedirect({ account: this.account, postLogoutRedirectUri: window.location.origin }); }
};

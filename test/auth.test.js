import test from "node:test";
import assert from "node:assert/strict";
import { AUTH, findRowByEmail, needsInteraction, rowMatchesEmail } from "../src/auth.js";

class InteractionRequiredAuthError extends Error { constructor() { super("interaction"); this.name = "InteractionRequiredAuthError"; } }

function fakeClient({ silent, redirectResult = null, redirectError = null, accounts = [] } = {}) {
  const calls = { redirects: 0 };
  return {
    calls,
    handleRedirectPromise: async () => { if (redirectError) throw redirectError; return redirectResult; },
    getAllAccounts: () => accounts,
    acquireTokenSilent: silent,
    acquireTokenRedirect: async () => { calls.redirects += 1; }
  };
}

test("email matching checks every email column, ignoring case and spaces", () => {
  assert.equal(rowMatchesEmail({ "Email Address": " Jane.Doe@IU29.org " }, ["jane.doe@iu29.org"]), true);
  assert.equal(rowMatchesEmail({ Email: "someone@iu29.org" }, ["jane.doe@iu29.org"]), false);
  assert.equal(rowMatchesEmail({ Email: "" }, [""]), false);
});

test("the signed-in user's emails include the sign-in name and email claims", () => {
  AUTH.account = { username: "JDoe@iu29.org", idTokenClaims: { email: "jane.doe@iu29.org", preferred_username: "jdoe@iu29.org" } };
  assert.deepEqual(AUTH.emails, ["jdoe@iu29.org", "jane.doe@iu29.org"]);
  AUTH.account = null;
});

test("only interaction-required errors count as needing sign-in", () => {
  assert.equal(needsInteraction(new InteractionRequiredAuthError()), true);
  assert.equal(needsInteraction({ errorCode: "consent_required" }), true);
  assert.equal(needsInteraction(new Error("Failed to fetch")), false);
});

test("a non-interaction token error is rethrown without redirecting", async () => {
  const client = fakeClient({ silent: async () => { throw new Error("network down"); } });
  AUTH.client = client; AUTH.account = { username: "a@iu29.org" };
  await assert.rejects(() => AUTH.acquireGraphToken(), /network down/);
  assert.equal(client.calls.redirects, 0);
});

test("an interaction-required token error redirects once and never resolves", async () => {
  const client = fakeClient({ silent: async () => { throw new InteractionRequiredAuthError(); } });
  AUTH.client = client; AUTH.account = { username: "a@iu29.org" };
  const outcome = await Promise.race([AUTH.acquireGraphToken().then(() => "resolved"), new Promise(resolve => setTimeout(() => resolve("pending"), 20))]);
  assert.equal(outcome, "pending");
  assert.equal(client.calls.redirects, 1);
});

test("a failed or cancelled sign-in shows a message instead of throwing", async () => {
  const client = fakeClient({ redirectError: new Error("user_cancelled") });
  global.window = { msal: { PublicClientApplication: function () { return client; } }, location: { origin: "https://example.test" } };
  Object.assign(AUTH, { client: null, account: null, staff: null, error: null, signInError: null });
  await AUTH.init();
  assert.equal(AUTH.account, null);
  assert.match(AUTH.signInError, /did not complete/);
});

test("user lookup asks SharePoint for one email and only reads the whole list as a fallback", async () => {
  const requests = [];
  const rows = [{ id: "1", Email: "other@iu29.org" }, { id: "2", Email: " Jane@IU29.org " }];
  global.window = { GRAPH: { getListItems: async (list, options) => { requests.push(options?.equals ? "filtered" : "full"); return options?.equals ? rows.slice(1) : rows; } } };
  assert.equal((await findRowByEmail("IEP_Users2", ["jane@iu29.org"])).id, "2");
  assert.deepEqual(requests, ["filtered"]);

  requests.length = 0;
  window.GRAPH.getListItems = async (list, options) => { requests.push(options?.equals ? "filtered" : "full"); if (options?.equals) throw new Error("400"); return rows; };
  assert.equal((await findRowByEmail("IEP_Users2", ["jane@iu29.org"])).id, "2");
  assert.deepEqual(requests, ["filtered", "full"]);

  requests.length = 0;
  window.GRAPH.getListItems = async (list, options) => { requests.push(options?.equals ? "filtered" : "full"); return options?.equals ? [] : rows; };
  assert.equal(await findRowByEmail("IEP_Users2", ["nobody@iu29.org"]), null);
  assert.deepEqual(requests, ["filtered", "full"]);
});

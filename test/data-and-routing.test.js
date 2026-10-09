import test from "node:test";
import assert from "node:assert/strict";
import { buildEqualsFilter, fetchAllGraphPages, mapGraphItemsToDisplay, GRAPH } from "../src/graph.js";

test("Graph pagination follows every nextLink and preserves item ids", async () => {
  const pages = {
    first: { value: [{ id: "10", fields: { Title: "First" } }], "@odata.nextLink": "https://graph.microsoft.com/v1.0/second" },
    second: { value: [{ id: "11", fields: { Title: "Second" } }] }
  };
  const rows = await fetchAllGraphPages(async path => pages[path], "first");
  assert.equal(rows.length, 2);
  assert.deepEqual(mapGraphItemsToDisplay(rows, { Name: "Title" }), [{ id: "10", Created: "", Name: "First" }, { id: "11", Created: "", Name: "Second" }]);
});

test("Admin Hub Graph client exposes read-only PACE operations", () => {
  assert.throws(() => GRAPH.createListItem(), /read-only/);
  assert.throws(() => GRAPH.updateListItem(), /read-only/);
  assert.throws(() => GRAPH.deleteListItem(), /read-only/);
});

test("email filters use internal column names and escape quotes", () => {
  const schema = { Email: "Email", "Email Address": "field_9" };
  assert.equal(buildEqualsFilter(schema, ["Email", "Email Address", "EmailAddress"], ["o'neil@iu29.org"]), "(fields/Email eq 'o''neil@iu29.org' or fields/field_9 eq 'o''neil@iu29.org')");
  assert.equal(buildEqualsFilter({ Title: "Title" }, ["Email"], ["a@iu29.org"]), null);
});

test("concurrent site, list and schema lookups share one request, and failures retry", async () => {
  const paths = []; let failSite = true;
  const graph = { ...GRAPH, siteIds: new Map(), lists: new Map(), schemas: new Map(), async get(path) {
    paths.push(path);
    if (path.startsWith("sites/") && !path.includes("/lists")) { if (failSite) { failSite = false; throw new Error("503"); } return { id: "site" }; }
    if (path.endsWith("$select=id,name,displayName")) return { value: [{ id: "list", name: "IEP_Users2" }] };
    return { value: [{ name: "Email", displayName: "Email" }] };
  } };
  await assert.rejects(() => graph.getSiteId(), /503/);
  await Promise.all([graph.getSchema("IEP_Users2"), graph.getSchema("IEP_Users2"), graph.getListId("IEP_Users2"), graph.getListId("IEP_Users2"), graph.getSiteId()]);
  assert.equal(paths.filter(path => !path.includes("/lists")).length, 2);
  assert.equal(paths.filter(path => path.endsWith("$select=id,name,displayName")).length, 1);
  assert.equal(paths.filter(path => path.includes("/columns")).length, 1);
});

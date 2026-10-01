import test from "node:test";
import assert from "node:assert/strict";
import { fetchAllGraphPages, mapGraphItemsToDisplay, GRAPH } from "../src/graph.js";

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

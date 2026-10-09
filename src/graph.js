import { CONFIG } from "./config.js";
import { toGraphUtcBoundary } from "./date-utils.js";

function writableReadOnly() { throw new Error("Admin Hub is read-only: PACE write operations are disabled."); }

export async function fetchAllGraphPages(fetchPage, firstPath, base = "https://graph.microsoft.com/v1.0") {
  const items = []; let path = firstPath;
  while (path) {
    const data = await fetchPage(path); items.push(...(data.value ?? []));
    const next = data["@odata.nextLink"]; path = next ? next.replace(`${base}/`, "") : null;
  }
  return items;
}

export function mapGraphItemsToDisplay(items, schema) {
  const inverse = Object.fromEntries(Object.entries(schema ?? {}).map(([display, internal]) => [internal, display]));
  return (items ?? []).map(item => { const row = { id: item.id, Created: item.createdDateTime ?? "" }; for (const [key, value] of Object.entries(item.fields ?? item)) if (key !== "id") row[inverse[key] ?? key] = value; return row; });
}

// Builds "(fields/A eq 'x' or fields/B eq 'x' ...)" from display column names.
// Returns null when none of the columns exist, so the caller skips the filter.
export function buildEqualsFilter(schema, fields, values) {
  const columns = [...new Set(fields.map(field => schema?.[field]).filter(Boolean))];
  const literals = [...new Set(values.map(value => String(value ?? "").trim()).filter(Boolean))].map(value => `'${value.replaceAll("'", "''")}'`);
  if (!columns.length || !literals.length) return null;
  return `(${columns.flatMap(column => literals.map(literal => `fields/${column} eq ${literal}`)).join(" or ")})`;
}

// Shares one in-flight request between concurrent callers and keeps the
// result; a failed request is forgotten so the next call retries.
function cached(cache, key, load) {
  if (!cache.has(key)) cache.set(key, load().catch(error => { cache.delete(key); throw error; }));
  return cache.get(key);
}

export const GRAPH = {
  base: "https://graph.microsoft.com/v1.0", siteIds: new Map(), lists: new Map(), schemas: new Map(),
  async get(path, headers = {}) {
    const token = await this.token();
    const response = await fetch(`${this.base}/${path}`, { headers: { Authorization: `Bearer ${token}`, ...headers } });
    if (!response.ok) { const detail = (await response.json().catch(() => null))?.error?.message; throw new Error(`Microsoft Graph request failed (${response.status})${detail ? `: ${detail}` : "."}`); }
    return response.json();
  },
  async token() { return window.AUTH_TOKEN ?? (await window.AUTH.acquireGraphToken?.()); },
  getSiteId() { return cached(this.siteIds, CONFIG.sitePath, async () => (await this.get(`sites/${CONFIG.sitePath}`)).id); },
  // One request lists every list on the site; each list's id is found from it.
  getLists() { return cached(this.lists, "*", async () => (await this.get(`sites/${await this.getSiteId()}/lists?$select=id,name,displayName`)).value ?? []); },
  async getListId(listName) {
    const match = (await this.getLists()).find(list => [list.name, list.displayName].some(value => String(value ?? "").toLowerCase().trim() === listName.toLowerCase()));
    if (!match) throw new Error(`The SharePoint list ${listName} was not found.`);
    return match.id;
  },
  getSchema(listName) {
    return cached(this.schemas, listName, async () => {
      const siteId = await this.getSiteId(); const listId = await this.getListId(listName);
      const data = await this.get(`sites/${siteId}/lists/${listId}/columns?$select=name,displayName`);
      const schema = {}; for (const column of data.value ?? []) if (column.displayName && column.name) schema[column.displayName] = column.name;
      return schema;
    });
  },
  async getListItems(listName, options = {}) {
    const siteId = await this.getSiteId(); const listId = await this.getListId(listName); const schema = await this.getSchema(listName);
    let path = `sites/${siteId}/lists/${listId}/items?$expand=fields&$top=200`; let headers = {};
    const filters = [];
    if (options.from && options.to && schema.Date) filters.push(`fields/${schema.Date} ge '${toGraphUtcBoundary(options.from)}' and fields/${schema.Date} lt '${toGraphUtcBoundary(options.to, true)}'`);
    if (options.equals) { const clause = buildEqualsFilter(schema, options.equals.fields, options.equals.values); if (clause) filters.push(clause); }
    if (filters.length) {
      path += `&$filter=${encodeURIComponent(filters.join(" and "))}`;
      // These columns are not indexed; SharePoint rejects the filter without this header.
      headers = { Prefer: "HonorNonIndexedQueriesWarningMayFailRandomly" };
    }
    const items = await fetchAllGraphPages(pathValue => this.get(pathValue, headers), path, this.base);
    return mapGraphItemsToDisplay(items, schema);
  },
  async getPaceVisits(range) { return this.getListItems(CONFIG.lists.paceVisits, range); },
  createListItem: writableReadOnly,
  updateListItem: writableReadOnly,
  deleteListItem: writableReadOnly
};

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

export const GRAPH = {
  base: "https://graph.microsoft.com/v1.0", siteId: null, listIds: new Map(), schemas: new Map(),
  async get(path) {
    const token = await this.token();
    const response = await fetch(`${this.base}/${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Microsoft Graph request failed (${response.status}).`);
    return response.json();
  },
  async token() { return window.AUTH_TOKEN ?? (await window.AUTH.acquireGraphToken?.()); },
  async getSiteId() { if (!this.siteId) this.siteId = (await this.get(`sites/${CONFIG.sitePath}`)).id; return this.siteId; },
  async getListId(listName) {
    if (this.listIds.has(listName)) return this.listIds.get(listName);
    const siteId = await this.getSiteId();
    const data = await this.get(`sites/${siteId}/lists?$select=id,name,displayName`);
    const match = (data.value ?? []).find(list => [list.name, list.displayName].some(value => String(value ?? "").toLowerCase().trim() === listName.toLowerCase()));
    if (!match) throw new Error(`The SharePoint list ${listName} was not found.`);
    this.listIds.set(listName, match.id); return match.id;
  },
  async getSchema(listName) {
    if (this.schemas.has(listName)) return this.schemas.get(listName);
    const siteId = await this.getSiteId(); const listId = await this.getListId(listName);
    const data = await this.get(`sites/${siteId}/lists/${listId}/columns?$select=name,displayName`);
    const schema = {}; for (const column of data.value ?? []) if (column.displayName && column.name) schema[column.displayName] = column.name;
    this.schemas.set(listName, schema); return schema;
  },
  async getListItems(listName, options = {}) {
    const siteId = await this.getSiteId(); const listId = await this.getListId(listName); const schema = await this.getSchema(listName);
    let path = `sites/${siteId}/lists/${listId}/items?$expand=fields&$top=200`;
    if (options.from && options.to && schema.Date) {
      const filter = `fields/${schema.Date} ge '${toGraphUtcBoundary(options.from)}' and fields/${schema.Date} lt '${toGraphUtcBoundary(options.to, true)}'`;
      path += `&$filter=${encodeURIComponent(filter)}`;
    }
    const items = await fetchAllGraphPages(pathValue => this.get(pathValue), path, this.base);
    return mapGraphItemsToDisplay(items, schema);
  },
  async getPaceVisits(range) { return this.getListItems(CONFIG.lists.paceVisits, range); },
  async getAppUsers() { return this.getListItems(CONFIG.lists.appUsers); },
  async getAppUsersSchema() { return this.getSchema(CONFIG.lists.appUsers); },
  createListItem: writableReadOnly,
  updateListItem: writableReadOnly,
  deleteListItem: writableReadOnly
};

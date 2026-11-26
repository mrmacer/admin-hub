import { CONFIG, PRODUCTION_ADMIN_WRITES_ENABLED } from "./config.js";
import { toGraphUtcBoundary } from "./date-utils.js";
import { APP_ENV } from "./environment.js";

function writableReadOnly() { throw new Error("Admin Hub is read-only: PACE write operations are disabled."); }
function assertProductionGraph() { if (APP_ENV !== "production") throw new Error("Demo environment safety block: Microsoft Graph is disabled."); }

const SYSTEM_COLUMNS = new Set(["id", "ContentType", "Modified", "Created", "Author", "Editor", "AuthorLookupId", "EditorLookupId", "Attachments", "Edit", "LinkTitle", "LinkTitleNoMenu", "ItemChildCount", "FolderChildCount"]);
const columnKind = column => ["calculated", "boolean", "choice", "text", "number", "dateTime", "lookup", "personOrGroup"].find(kind => column?.[kind]) ?? "other";

// Kept as pure schema helpers for the legacy roster module and its tests. They
// do not enable writes; GRAPH write methods remain hard-blocked below.
export function isWritableColumn(name) { return Boolean(name) && !SYSTEM_COLUMNS.has(name) && !name.startsWith("_"); }
export function buildSchema(columns) {
  const schema = {};
  for (const column of columns ?? []) {
    if (!column?.displayName || !column?.name || !isWritableColumn(column.name) || column.hidden || column.readOnly) continue;
    if (column.displayName === "Student First Name" && schema[column.displayName] && schema[column.displayName] !== "Title") continue;
    schema[column.displayName] = column.name;
  }
  return schema;
}
export function encodeField(column, value) {
  const name = column?.name;
  if (!name || !isWritableColumn(name) || column.hidden || column.readOnly) throw new Error(`Column ${name || "unknown"} is not writable.`);
  const kind = columnKind(column);
  if (kind === "lookup" || kind === "personOrGroup") throw new Error(`Column ${name} is a lookup column and is not supported.`);
  if (kind === "calculated" || kind === "other") throw new Error(`Column ${name} is not a supported writable field.`);
  if (kind === "boolean") return { [name]: Boolean(value) };
  if (kind === "text") {
    const text = typeof value === "boolean" ? (value ? "Yes" : "No") : String(value ?? "");
    const max = column.text?.maxLength;
    if (max && text.length > max) throw new Error(`${name} must be at most ${max} characters.`);
    return { [name]: text };
  }
  if (kind === "choice") {
    const choices = column.choice?.choices ?? [];
    if (typeof value === "boolean" && choices.includes(value ? "Yes" : "No")) value = value ? "Yes" : "No";
    if (column.choice?.displayAs === "checkBoxes" && !Array.isArray(value) && value !== undefined && value !== null && value !== "") value = [value];
    if (Array.isArray(value)) {
      if (column.choice?.displayAs !== "checkBoxes") throw new Error(`${name} does not accept multiple values.`);
      if (value.some(item => !choices.includes(item))) throw new Error(`${name} contains a value that is not offered.`);
      return { [`${name}@odata.type`]: "Collection(Edm.String)", [name]: value };
    }
    if (value !== undefined && value !== null && value !== "" && !choices.includes(value)) throw new Error(`${name} does not offer "${value}".`);
    return { [name]: value ?? "" };
  }
  return { [name]: value };
}

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

export function buildGraphDateFilter(fieldName, from, to) {
  const start = toGraphUtcBoundary(from);
  const end = toGraphUtcBoundary(to, true);
  return `fields/${fieldName} ge '${start}' and fields/${fieldName} lt '${end}'`;
}

export const GRAPH = {
  base: "https://graph.microsoft.com/v1.0", siteId: null, listIds: new Map(), schemas: new Map(),
  async request(method, path, { headers = {}, body } = {}) {
    assertProductionGraph();
    if (method !== "GET" && !PRODUCTION_ADMIN_WRITES_ENABLED) throw new Error("Admin Hub production mutations are disabled by the feature gate.");
    const token = await this.token();
    const response = await fetch(`${this.base}/${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Microsoft Graph request failed (${response.status}).${detail ? ` ${detail}` : ""}`);
    }
    if (response.status === 204) return null;
    return response.json();
  },
  async get(path, extraHeaders = {}) {
    return this.request("GET", path, { headers: extraHeaders });
  },
  async token() { assertProductionGraph(); return window.AUTH_TOKEN ?? (await window.AUTH.acquireGraphToken?.()); },
  async getSiteId() { assertProductionGraph(); if (!this.siteId) this.siteId = (await this.get(`sites/${CONFIG.sitePath}`)).id; return this.siteId; },
  async getListId(listName) {
    assertProductionGraph();
    if (this.listIds.has(listName)) return this.listIds.get(listName);
    const siteId = await this.getSiteId();
    const data = await this.get(`sites/${siteId}/lists?$select=id,name,displayName`);
    const match = (data.value ?? []).find(list => [list.name, list.displayName].some(value => String(value ?? "").toLowerCase().trim() === listName.toLowerCase()));
    if (!match) throw new Error(`The SharePoint list ${listName} was not found.`);
    this.listIds.set(listName, match.id); return match.id;
  },
  async getSchema(listName) {
    assertProductionGraph();
    if (this.schemas.has(listName)) return this.schemas.get(listName);
    const siteId = await this.getSiteId(); const listId = await this.getListId(listName);
    const data = await this.get(`sites/${siteId}/lists/${listId}/columns?$select=name,displayName`);
    const schema = {}; for (const column of data.value ?? []) if (column.displayName && column.name) schema[column.displayName] = column.name;
    this.schemas.set(listName, schema); return schema;
  },
  async getListItems(listName, options = {}) {
    assertProductionGraph();
    const siteId = await this.getSiteId(); const listId = await this.getListId(listName); const schema = await this.getSchema(listName);
    let path = `sites/${siteId}/lists/${listId}/items?$expand=fields&$top=200`;
    if (options.from && options.to && schema.Date) {
      const filter = buildGraphDateFilter(schema.Date, options.from, options.to);
      path += `&$filter=${encodeURIComponent(filter)}`;
    }
    const filterHeaders = options.from && options.to && schema.Date ? { Prefer: "HonorNonIndexedQueriesWarningMayFailRandomly" } : {};
    const items = await fetchAllGraphPages(pathValue => this.get(pathValue, filterHeaders), path, this.base);
    return mapGraphItemsToDisplay(items, schema);
  },
  async getPaceVisits(range) { return this.getListItems(CONFIG.lists.paceVisits, range); },
  async getAppUsers() { return this.getListItems(CONFIG.lists.appUsers); },
  async getAppUsersSchema() { return this.getSchema(CONFIG.lists.appUsers); },
  createListItem: writableReadOnly,
  updateListItem: writableReadOnly,
  deleteListItem: writableReadOnly
};

import { CONFIG } from "./config.js";
import { toGraphUtcBoundary } from "./date-utils.js";

function writableReadOnly() { throw new Error("Admin Hub is read-only: PACE write operations are disabled."); }

const COLUMN_FIELDS = "name,displayName,hidden,readOnly,required,defaultValue,text,choice,boolean,number,dateTime,lookup,personOrGroup,calculated";
const SYSTEM_COLUMNS = new Set(["id", "ContentType", "Modified", "Created", "Author", "Editor", "AuthorLookupId", "EditorLookupId", "Attachments", "Edit", "LinkTitle", "LinkTitleNoMenu", "ItemChildCount", "FolderChildCount"]);

export function isWritableColumn(name) { return Boolean(name) && !SYSTEM_COLUMNS.has(name) && !name.startsWith("_"); }
const usable = column => isWritableColumn(column.name) && !column.hidden && !column.readOnly;

// Maps display name -> internal name. A renamed Title column shares its
// display name with the computed LinkTitle columns, so a writable, visible
// column always wins the name; otherwise the last column listed wins.
export function buildSchema(columns) {
  const schema = {}; const won = new Set();
  for (const column of columns ?? []) {
    if (!column.displayName || !column.name) continue;
    if (schema[column.displayName] === undefined || usable(column) || !won.has(column.displayName)) {
      schema[column.displayName] = column.name;
      if (usable(column)) won.add(column.displayName); else won.delete(column.displayName);
    }
  }
  return schema;
}

export function columnKind(column) { return ["calculated", "boolean", "choice", "text", "number", "dateTime", "lookup", "personOrGroup"].find(kind => column?.[kind]) ?? "other"; }

// Turns one value into the payload its column's real type accepts, or throws
// before anything is sent. A boolean is a Yes/No flag and is stored however
// the column holds one; strings must fit the column.
export function encodeField(column, value) {
  const label = `"${column.displayName || column.name}"`; const kind = columnKind(column);
  if (typeof value === "boolean") {
    if (kind === "boolean") return { [column.name]: value };
    if (kind === "text") return { [column.name]: value ? "Yes" : "No" };
    if (kind === "choice") {
      const wanted = value ? ["yes", "true"] : ["no", "false"];
      const choice = (column.choice.choices ?? []).find(option => wanted.includes(String(option).trim().toLowerCase()));
      if (choice === undefined) throw new Error(`${label} is a Choice column with no ${value ? "Yes" : "No"} option.`);
      return { [column.name]: choice };
    }
    throw new Error(`${label} is a ${kind} column; a Yes/No value cannot be saved in it.`);
  }
  if (typeof value !== "string") throw new Error(`${label} needs a text value.`);
  if (kind === "text") {
    const max = column.text?.maxLength;
    if (max && value.length > max) throw new Error(`${label} allows at most ${max} characters.`);
    return { [column.name]: value };
  }
  if (kind === "choice") {
    const choices = column.choice.choices ?? [];
    if (!column.choice.allowTextEntry && !choices.includes(value)) throw new Error(`${label} does not offer "${value}" (choices: ${choices.join(", ") || "none"}).`);
    // checkBoxes is SharePoint's multi-select choice column, which takes a collection.
    return column.choice.displayAs === "checkBoxes" ? { [`${column.name}@odata.type`]: "Collection(Edm.String)", [column.name]: [value] } : { [column.name]: value };
  }
  throw new Error(`${label} is a ${kind} column, which Admin Hub cannot write.`);
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
  base: "https://graph.microsoft.com/v1.0", siteIds: new Map(), lists: new Map(), schemas: new Map(), columns: new Map(),
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
  getColumns(listName) {
    return cached(this.columns, listName, async () => {
      const siteId = await this.getSiteId(); const listId = await this.getListId(listName);
      return (await this.get(`sites/${siteId}/lists/${listId}/columns?$select=${COLUMN_FIELDS}`)).value ?? [];
    });
  },
  getSchema(listName) { return cached(this.schemas, listName, async () => buildSchema(await this.getColumns(listName))); },
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
  // One item by its exact id, used to confirm a save independently of paging or name matching.
  async getListItem(listName, itemId) {
    const siteId = await this.getSiteId(); const listId = await this.getListId(listName); const schema = await this.getSchema(listName);
    return mapGraphItemsToDisplay([await this.get(`sites/${siteId}/lists/${listId}/items/${encodeURIComponent(itemId)}?$expand=fields`)], schema)[0];
  },
  // Display name -> value into a ready-to-send payload. Sends nothing; throws if
  // a column is missing, read-only or the wrong type, or a required column is unfilled.
  async prepareFields(listName, values) {
    const [schema, columns] = await Promise.all([this.getSchema(listName), this.getColumns(listName)]);
    const fields = {};
    for (const [displayName, value] of Object.entries(values)) {
      const name = schema[displayName];
      if (!name) throw new Error(`${listName} has no "${displayName}" column. Columns found: ${Object.keys(schema).join(", ") || "none"}.`);
      if (!isWritableColumn(name)) throw new Error(`"${displayName}" in ${listName} is a read-only column.`);
      if (name in fields) throw new Error(`Two values would both be saved to the "${displayName}" column.`);
      Object.assign(fields, encodeField(columns.find(column => column.name === name) ?? { name, displayName }, value));
    }
    const missing = columns.filter(column => column.required && usable(column) && !column.calculated && column.defaultValue == null && !(column.name in fields)).map(column => `"${column.displayName || column.name}"`);
    if (missing.length) throw new Error(`${listName} requires ${missing.join(", ")}, which this form does not collect. Nothing will be made up for it.`);
    return fields;
  },
  // A refusal from SharePoint carries graphStatus and a failure before sending
  // carries notSent; with neither, the request may or may not have happened.
  async send(method, path, body) {
    let token;
    try { token = await this.token(); } catch (error) { throw Object.assign(error, { notSent: true }); }
    const response = await fetch(`${this.base}/${path}`, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) { const detail = (await response.json().catch(() => null))?.error?.message; throw Object.assign(new Error(`Microsoft Graph request failed (${response.status})${detail ? `: ${detail}` : "."}`), { graphStatus: response.status }); }
    return response.status === 204 ? null : response.json();
  },
  async createListItem(listName, fields) {
    if (!CONFIG.writableLists.includes(listName)) writableReadOnly();
    const siteId = await this.getSiteId(); const listId = await this.getListId(listName);
    return this.send("POST", `sites/${siteId}/lists/${listId}/items`, { fields });
  },
  updateListItem: writableReadOnly,
  deleteListItem: writableReadOnly
};

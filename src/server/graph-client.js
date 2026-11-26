import { createClientCredentialTokenProvider } from "./entra.js";
import { RuntimeConfigError } from "./runtime-config.js";

function escapeOData(value) { return String(value).replaceAll("'", "''"); }

function relativeGraphPath(path, base) {
  const value = String(path ?? "");
  if (value.startsWith(`${base}/`)) return value.slice(base.length + 1);
  if (/^https?:\/\//i.test(value)) throw new RuntimeConfigError("The Graph pagination link was not trusted.", "GRAPH_RESPONSE_INVALID");
  return value.replace(/^\/+/, "");
}

function mapItem(item, schema) {
  const inverse = Object.fromEntries(Object.entries(schema).map(([display, internal]) => [internal, display]));
  return { id: item.id, Created: item.createdDateTime ?? "", ...Object.fromEntries(Object.entries(item.fields ?? {}).map(([key, value]) => [inverse[key] ?? key, value])) };
}

export function createServerGraphClient({ config, fetchImpl = globalThis.fetch } = {}) {
  if (!config) throw new RuntimeConfigError("Server Graph configuration is required.", "GRAPH_CONFIG_MISSING");
  const tokenProvider = createClientCredentialTokenProvider({ config, fetchImpl });
  const schemaCache = new Map();
  let siteId = null;

  async function request(method, path, { headers = {}, body } = {}) {
    const token = await tokenProvider.getToken();
    const url = `${config.graphApiBase}/${relativeGraphPath(path, config.graphApiBase)}`;
    const response = await fetchImpl(url, { method, headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (!response.ok) { const error = new Error(`Microsoft Graph request failed (${response.status}).`); error.code = "GRAPH_REQUEST_FAILED"; error.status = response.status; throw error; }
    if (response.status === 204) return null;
    return response.json();
  }

  async function getSiteId() {
    if (!siteId) siteId = (await request("GET", `sites/${config.graphSitePath}`)).id;
    if (!siteId) throw new RuntimeConfigError("The configured SharePoint site could not be resolved.", "GRAPH_SITE_MISSING");
    return siteId;
  }

  async function getListId(name) {
    const id = config.listIds?.[name];
    if (!id) throw new RuntimeConfigError(`The SharePoint resource is not approved: ${name}.`, "GRAPH_RESOURCE_NOT_APPROVED");
    return id;
  }

  async function getSchema(name) {
    if (schemaCache.has(name)) return schemaCache.get(name);
    const site = await getSiteId(); const list = await getListId(name);
    const data = await request("GET", `sites/${site}/lists/${list}/columns?$select=name,displayName`);
    const schema = {};
    for (const column of data.value ?? []) if (column.displayName && column.name) schema[column.displayName] = column.name;
    schemaCache.set(name, schema); return schema;
  }

  async function allPages(path) {
    const items = []; let next = path;
    while (next) { const data = await request("GET", next); items.push(...(data.value ?? [])); next = data["@odata.nextLink"] ? relativeGraphPath(data["@odata.nextLink"], config.graphApiBase) : null; }
    return items;
  }

  return {
    request,
    async getSiteId() { return getSiteId(); },
    async getListId(name) { return getListId(name); },
    async getSchema(name) { return getSchema(name); },
    async getListItems(name, { filterDisplayName, filterValue } = {}) {
      const site = await getSiteId(); const list = await getListId(name); const schema = await getSchema(name);
      let path = `sites/${site}/lists/${list}/items?$expand=fields&$top=200`;
      if (filterDisplayName && filterValue !== undefined) path += `&$filter=fields/${schema[filterDisplayName]} eq '${escapeOData(filterValue)}'`;
      return (await allPages(path)).map(item => mapItem(item, schema));
    }
  };
}

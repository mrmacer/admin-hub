import { createPaceAdminGraphAdapter } from "../modules/pace/pace-admin-graph.js";
import { createPaceAdminService } from "../modules/pace/pace-admin-service.js";
import { createEntraTokenValidator } from "./entra.js";
import { resolveAdminPrincipal } from "./authorization.js";
import { createServerGraphClient } from "./graph-client.js";
import { readRuntimeConfig } from "./runtime-config.js";

const API_PREFIX = "/api/admin/pace";
const MAX_BODY_BYTES = 128 * 1024;

function header(req, name) { return req.headers?.[name.toLowerCase()] ?? req.headers?.[name] ?? ""; }

function jsonResponse(res, status, body, extra = {}) {
  res.statusCode = status;
  for (const [key, value] of Object.entries({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Vary": "Origin", ...extra })) res.setHeader?.(key, value);
  res.end(JSON.stringify(body));
}

function servicePath(req) {
  const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
  if (!pathname.startsWith(API_PREFIX)) return null;
  const suffix = pathname.slice(API_PREFIX.length) || "/";
  return `/admin/pace${suffix}`;
}

async function requestBody(req) {
  if (req.body !== undefined) {
    if (typeof req.body === "object") return req.body;
    try { return JSON.parse(String(req.body)); } catch { throw Object.assign(new Error("Request JSON is invalid."), { code: "INVALID_REQUEST", status: 400 }); }
  }
  const chunks = []; let total = 0;
  for await (const chunk of req) { total += chunk.length; if (total > MAX_BODY_BYTES) throw Object.assign(new Error("Request is too large."), { code: "REQUEST_TOO_LARGE", status: 413 }); chunks.push(chunk); }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw Object.assign(new Error("Request JSON is invalid."), { code: "INVALID_REQUEST", status: 400 }); }
}

function safeServiceBody(status, body) {
  if (status < 500 || body?.code === "PARTIAL_ADMIN_OPERATION") {
    if (body?.details) { const details = { ...body.details }; delete details.cause; return { ...body, ...(Object.keys(details).length ? { details } : {}) }; }
    return body;
  }
  return { error: "The administrative service could not complete the request.", code: body?.code ?? "ADMIN_SERVICE_ERROR" };
}

export function createAdminApiHandler({ config = readRuntimeConfig(), tokenValidator, graphClient, authorizationResolver = resolveAdminPrincipal, service } = {}) {
  const validator = tokenValidator ?? createEntraTokenValidator({ config });
  const graph = graphClient ?? createServerGraphClient({ config });
  const adminService = service ?? createPaceAdminService({ adapter: createPaceAdminGraphAdapter({ graphClient: graph, writeEnabled: config.writeRequested, productionWritesEnabled: config.writeEnabled, authorized: true, environment: "production" }) });

  return async function handler(req, res) {
    const method = String(req.method ?? "GET").toUpperCase();
    const path = servicePath(req);
    if (!path) return jsonResponse(res, 404, { error: "Not found.", code: "NOT_FOUND" });
    if (method === "DELETE") return jsonResponse(res, 405, { error: "Permanent deletion is not supported.", code: "DELETE_NOT_SUPPORTED" }, { Allow: "GET, POST" });
    if (! ["GET", "POST"].includes(method)) return jsonResponse(res, 405, { error: "Method not allowed.", code: "METHOD_NOT_ALLOWED" }, { Allow: "GET, POST" });
    if (method === "POST") {
      const origin = String(header(req, "origin"));
      if (!origin || !config.allowedOrigins.includes(origin)) return jsonResponse(res, 403, { error: "The request origin is not allowed.", code: "ORIGIN_NOT_ALLOWED" });
      if (!String(header(req, "content-type")).toLowerCase().startsWith("application/json")) return jsonResponse(res, 415, { error: "JSON requests are required.", code: "CONTENT_TYPE_REQUIRED" });
    }
    try {
      const claims = await validator.validate(header(req, "authorization"));
      const principal = await authorizationResolver({ tokenClaims: claims, graphClient: graph, config });
      const body = method === "POST" ? await requestBody(req) : {};
      const result = await adminService.handle({ method, path, principal, body });
      return jsonResponse(res, result.status, safeServiceBody(result.status, result.body));
    } catch (error) {
      const status = Number(error.status) || (error.code === "UNAUTHENTICATED" ? 401 : error.code === "FORBIDDEN" ? 403 : 503);
      return jsonResponse(res, status, { error: status >= 500 ? "The administrative API is unavailable." : error.message, code: error.code ?? "ADMIN_API_ERROR" });
    }
  };
}

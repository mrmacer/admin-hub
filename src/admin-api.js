import { APP_ENV, CONFIG, PRODUCTION_ADMIN_WRITES_ENABLED } from "./config.js";

export const ADMIN_API_CONFIGURED = APP_ENV === "production" && Boolean(CONFIG.api.scope);

function operationId(prefix) {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${id}`;
}

async function request(path, { method = "GET", body } = {}) {
  if (!ADMIN_API_CONFIGURED) throw new Error("The protected Admin Hub API is not configured for this build.");
  const token = await window.AUTH.acquireApiToken();
  const response = await fetch(`${CONFIG.api.basePath}${path}`, {
    method,
    credentials: "same-origin",
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(result.error || "The protected Admin Hub API rejected the request."); error.code = result.code; error.status = response.status; throw error; }
  return result;
}

export const ADMIN_API = {
  configured: ADMIN_API_CONFIGURED,
  writesEnabled: ADMIN_API_CONFIGURED && PRODUCTION_ADMIN_WRITES_ENABLED,
  getVisit(visitId) { return request(`/visits/${encodeURIComponent(visitId)}`); },
  getHistory(visitId) { return request(`/visits/${encodeURIComponent(visitId)}/history`); },
  edit(visitId, payload) { return request(`/visits/${encodeURIComponent(visitId)}/edit`, { method: "POST", body: { ...payload, operationId: payload.operationId ?? operationId("edit") } }); },
  saveReview(visitId, payload) { return request(`/visits/${encodeURIComponent(visitId)}/follow-up`, { method: "POST", body: { ...payload, operationId: payload.operationId ?? operationId("review") } }); },
  markViewed(visitId) { return request(`/visits/${encodeURIComponent(visitId)}/viewed`, { method: "POST", body: { operationId: operationId("viewed") } }); },
  addNote(visitId, text, supersedesNoteId = "") { return request(`/visits/${encodeURIComponent(visitId)}/notes`, { method: "POST", body: { text, supersedesNoteId, operationId: operationId("note") } }); },
  voidVisit(visitId, reason) { return request(`/visits/${encodeURIComponent(visitId)}/void`, { method: "POST", body: { reason, operationId: operationId("void") } }); },
  restoreVisit(visitId) { return request(`/visits/${encodeURIComponent(visitId)}/restore`, { method: "POST", body: { operationId: operationId("restore") } }); }
};

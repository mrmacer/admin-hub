// Server-only request boundary. Do not import this module from browser UI code.
// The caller must provide a principal produced by authenticated middleware;
// request bodies never supply actor identity, roles, list names, or field maps.
import { ADMIN_LISTS } from "./pace-admin-graph.js";

export const ADMIN_SERVICE_ROUTES = Object.freeze({
  visit: /^\/admin\/pace\/visits\/([^/]+)$/,
  history: /^\/admin\/pace\/visits\/([^/]+)\/history$/,
  edit: /^\/admin\/pace\/visits\/([^/]+)\/edit$/,
  notes: /^\/admin\/pace\/visits\/([^/]+)\/notes$/,
  viewed: /^\/admin\/pace\/visits\/([^/]+)\/viewed$/,
  followUp: /^\/admin\/pace\/visits\/([^/]+)\/follow-up$/,
  void: /^\/admin\/pace\/visits\/([^/]+)\/void$/,
  restore: /^\/admin\/pace\/visits\/([^/]+)\/restore$/
});

export const SUPPORTED_EDIT_FIELDS = Object.freeze([
  "student", "date", "teacherCameFrom", "room", "specialists", "timeIn",
  "timeOut", "reasons", "interventions", "scmUsed", "notes", "returnStatus"
]);

const EDIT_FIELD_SET = new Set(SUPPORTED_EDIT_FIELDS);
const FOLLOW_UP_STATUSES = new Set(["Open", "In Progress", "Resolved"]);

export class AdminServiceError extends Error {
  constructor(message, code = "INVALID_REQUEST", status = 400, details = {}) {
    super(message); this.name = "AdminServiceError"; this.code = code; this.status = status; this.details = details;
  }
}

function requiredText(value, label) {
  const text = String(value ?? "").trim();
  if (!text) throw new AdminServiceError(`${label} is required.`, "INVALID_REQUEST", 400);
  return text;
}

function jsonObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AdminServiceError(`${label} must be an object.`, "INVALID_REQUEST", 400);
  return value;
}

function operationId(body) { return requiredText(body.operationId, "operationId"); }

export function authorizeAdministrator(principal = {}) {
  if (principal.authenticated !== true) throw new AdminServiceError("An authenticated administrator is required.", "UNAUTHENTICATED", 401);
  if (principal.active !== true || principal.adminHubAllowed !== true) throw new AdminServiceError("The signed-in account is not authorized for Admin Hub administration.", "FORBIDDEN", 403);
  const email = String(principal.email ?? "").trim().toLowerCase();
  if (!email) throw new AdminServiceError("The authenticated administrator identity is missing.", "MISSING_ACTOR", 403);
  return { actor: email, email };
}

function routeMatch(route, path) {
  const match = route.exec(path);
  return match ? decodeURIComponent(match[1]) : null;
}

function findRoute(method, path) {
  if (method === "GET") {
    const history = routeMatch(ADMIN_SERVICE_ROUTES.history, path); if (history) return { action: "history", visitId: history };
    const visit = routeMatch(ADMIN_SERVICE_ROUTES.visit, path); if (visit) return { action: "visit", visitId: visit };
  }
  if (method === "POST") {
    for (const [action, route] of [["edit", ADMIN_SERVICE_ROUTES.edit], ["notes", ADMIN_SERVICE_ROUTES.notes], ["viewed", ADMIN_SERVICE_ROUTES.viewed], ["followUp", ADMIN_SERVICE_ROUTES.followUp], ["void", ADMIN_SERVICE_ROUTES.void], ["restore", ADMIN_SERVICE_ROUTES.restore]]) {
      const visitId = routeMatch(route, path); if (visitId) return { action, visitId };
    }
  }
  return null;
}

function rejectUntrustedBody(body = {}) {
  for (const key of ["actor", "email", "role", "roles", "list", "listId", "listName", "siteId", "sitePath", "fields"]) {
    if (Object.hasOwn(body, key)) throw new AdminServiceError(`Request body cannot supply ${key}.`, "UNTRUSTED_REQUEST_FIELD", 400);
  }
}

function reviewInput(review = {}, current = {}) {
  const fields = current?.fields ?? {};
  return {
    reviewStatus: review.reviewStatus ?? fields.ReviewStatus ?? "Unreviewed",
    followUpNeeded: review.followUpNeeded ?? fields.FollowUpNeeded ?? false,
    followUpStatus: review.followUpStatus ?? fields.FollowUpStatus ?? "Open",
    followUpAssignedTo: review.followUpAssignedTo ?? fields.FollowUpAssignedTo ?? "",
    followUpDueDate: review.followUpDueDate ?? fields.FollowUpDueDate ?? "",
    isVoided: fields.IsVoided === true,
    voidReason: fields.VoidReason ?? ""
  };
}

function safeChanges(changes) {
  const candidate = jsonObject(changes, "changes");
  const unknown = Object.keys(candidate).filter(key => !EDIT_FIELD_SET.has(key));
  if (unknown.length) throw new AdminServiceError(`Unsupported PACE fields: ${unknown.join(", ")}.`, "FIELD_NOT_ALLOWED", 400, { unknown });
  if (!Object.keys(candidate).length) throw new AdminServiceError("At least one supported PACE field is required.", "INVALID_REQUEST", 400);
  return candidate;
}

async function readSubmission(adapter, visitId) {
  const [source, review, notes] = await Promise.all([adapter.readPaceItem(visitId), adapter.getReview(visitId), adapter.listAdminNotes(visitId)]);
  return { source, review, notes, sourceId: source.id, lists: ADMIN_LISTS };
}

export function createPaceAdminService({ adapter, authorize = authorizeAdministrator, now = () => new Date().toISOString() } = {}) {
  if (!adapter) throw new AdminServiceError("A PACE administrative adapter is required.", "ADAPTER_MISSING", 500);
  if (typeof authorize !== "function") throw new AdminServiceError("A server-side authorization function is required.", "AUTHORIZER_MISSING", 500);

  const service = {
    async handle({ method = "GET", path = "", principal, body = {} } = {}) {
      const route = findRoute(String(method).toUpperCase(), path);
      if (String(method).toUpperCase() === "DELETE") return { status: 405, body: { error: "Permanent deletion is not supported." } };
      if (!route) return { status: 404, body: { error: "Administrative route not found." } };
      try {
        const identity = await authorize(principal);
        rejectUntrustedBody(body);
        if (route.action === "visit") return { status: 200, body: await readSubmission(adapter, route.visitId) };
        if (route.action === "history") return { status: 200, body: { visitId: route.visitId, audit: await adapter.listAuditHistory(route.visitId), notes: await adapter.listAdminNotes(route.visitId) } };
        const requestBody = jsonObject(body, "request");
        if (route.action === "edit") {
          const result = await adapter.saveAdministrativeChange({ visitId: route.visitId, changes: safeChanges(requestBody.changes), review: requestBody.review ?? {}, actor: identity.actor, correctionReason: requiredText(requestBody.correctionReason, "correctionReason"), expectedEtag: requiredText(requestBody.expectedEtag, "expectedEtag"), operationId: operationId(requestBody), timestamp: now() });
          return { status: 200, body: result };
        }
        if (route.action === "notes") {
          const result = await adapter.appendAdminNote({ visitId: route.visitId, text: requiredText(requestBody.text, "text"), actor: identity.actor, operationId: operationId(requestBody), timestamp: now(), supersedesNoteId: requestBody.supersedesNoteId ?? "" });
          return { status: 201, body: result };
        }
        if (route.action === "viewed") {
          const current = await adapter.getReview(route.visitId); const review = reviewInput({}, current);
          const result = await adapter.saveReview({ visitId: route.visitId, review: { ...review, reviewStatus: "Reviewed" }, actor: identity.actor, reason: "Marked as viewed", operationId: operationId(requestBody), timestamp: now() });
          return { status: 200, body: result };
        }
        if (route.action === "followUp") {
          const current = await adapter.getReview(route.visitId); const review = reviewInput(requestBody, current);
          if (!FOLLOW_UP_STATUSES.has(review.followUpStatus)) throw new AdminServiceError("followUpStatus is invalid.", "INVALID_REQUEST", 400);
          const result = await adapter.saveReview({ visitId: route.visitId, review, actor: identity.actor, reason: String(requestBody.reason ?? "Follow-up updated").trim() || "Follow-up updated", operationId: operationId(requestBody), timestamp: now() });
          return { status: 200, body: result };
        }
        if (route.action === "void") {
          const result = await adapter.voidOrRestore({ visitId: route.visitId, voided: true, reason: requiredText(requestBody.reason, "reason"), actor: identity.actor, operationId: operationId(requestBody), timestamp: now() });
          return { status: 200, body: result };
        }
        if (route.action === "restore") {
          const result = await adapter.voidOrRestore({ visitId: route.visitId, voided: false, actor: identity.actor, operationId: operationId(requestBody), timestamp: now() });
          return { status: 200, body: result };
        }
        return { status: 404, body: { error: "Administrative operation not found." } };
      } catch (error) {
        const status = error.status ?? (error.code === "STALE_RECORD" ? 409 : error.code === "PARTIAL_ADMIN_OPERATION" ? 502 : error.code === "WRITE_GATE_CLOSED" ? 503 : 500);
        return { status, body: { error: error.message, code: error.code ?? "ADMIN_SERVICE_ERROR", details: error.details ?? {} } };
      }
    }
  };
  return service;
}

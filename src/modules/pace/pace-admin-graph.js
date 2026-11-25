import { CONFIG, PRODUCTION_ADMIN_WRITES_ENABLED } from "../../config.js";
import { calculateDuration } from "./pace-analytics.js";

export const ADMIN_LISTS = {
  reviews: "IEP_Pace_Admin_Reviews",
  audit: "IEP_Pace_Admin_Audit",
  notes: "IEP_Pace_Admin_Notes"
};

export const REVIEW_LIST_SCHEMA = {
  PACEVisitItemID: { type: "Text", required: true, default: "", indexed: true, unique: true },
  ReviewStatus: { type: "Choice", required: true, default: "Unreviewed", choices: ["Unreviewed", "Reviewed", "Needs Follow-Up"] },
  ReviewedBy: { type: "Text", required: false, default: "" },
  ReviewedAt: { type: "DateTime", required: false, default: null },
  FollowUpNeeded: { type: "Boolean", required: true, default: false },
  FollowUpStatus: { type: "Choice", required: true, default: "Open", choices: ["Open", "In Progress", "Resolved"] },
  FollowUpAssignedTo: { type: "Text", required: false, default: "" },
  FollowUpDueDate: { type: "DateTime", required: false, default: null },
  IsVoided: { type: "Boolean", required: true, default: false },
  VoidReason: { type: "MultilineText", required: false, default: "" },
  VoidedBy: { type: "Text", required: false, default: "" },
  VoidedAt: { type: "DateTime", required: false, default: null },
  RestoredBy: { type: "Text", required: false, default: "" },
  RestoredAt: { type: "DateTime", required: false, default: null },
  LastReviewedRecordVersion: { type: "Text", required: false, default: "" },
  LastOperationId: { type: "Text", required: false, default: "", indexed: true }
};

export const AUDIT_LIST_SCHEMA = {
  PACEVisitItemID: { type: "Text", required: true, default: "", indexed: true },
  OperationId: { type: "Text", required: true, default: "", indexed: true, unique: true },
  ActionType: { type: "Choice", required: true, default: "Edit", choices: ["Edit", "Review", "Void", "Restore"] },
  Actor: { type: "Text", required: true, default: "" },
  Timestamp: { type: "DateTime", required: true, default: null },
  ChangedFields: { type: "MultilineText", required: false, default: "" },
  PreviousValues: { type: "MultilineText", required: false, default: "" },
  NewValues: { type: "MultilineText", required: false, default: "" },
  Reason: { type: "MultilineText", required: false, default: "" },
  SourceRecordVersion: { type: "Text", required: false, default: "" }
};

export const NOTES_LIST_SCHEMA = {
  NoteID: { type: "Text", required: true, default: "", indexed: true, unique: true },
  PACEVisitItemID: { type: "Text", required: true, default: "", indexed: true },
  NoteText: { type: "MultilineText", required: true, default: "" },
  Actor: { type: "Text", required: true, default: "" },
  CreatedAt: { type: "DateTime", required: true, default: null },
  SupersedesNoteID: { type: "Text", required: false, default: "", indexed: true },
  OperationId: { type: "Text", required: true, default: "", indexed: true, unique: true }
};

const PACE_FIELD_BY_KEY = {
  student: "Student",
  date: "Date",
  teacherCameFrom: "Teacher Came From",
  room: "Room",
  specialists: "Behavior Specialist",
  timeIn: "Time In",
  timeOut: "Time Out",
  reasons: "Reason",
  interventions: "Intervention Used",
  scmUsed: "SCM",
  notes: "Notes",
  durationMinutes: "Duration",
  returnStatus: "Return Status"
};

export class AdminAdapterError extends Error {
  constructor(message, code = "ADMIN_ADAPTER_ERROR", details = {}) {
    super(message); this.name = "AdminAdapterError"; this.code = code; this.details = details;
  }
}

export class PartialAdminOperationError extends AdminAdapterError {
  constructor(message, details = {}) { super(message, "PARTIAL_ADMIN_OPERATION", details); this.operationId = details.operationId; }
}

function operationId(value) {
  const result = String(value ?? "").trim();
  if (!result) throw new AdminAdapterError("An operation ID is required for an administrative mutation.", "MISSING_OPERATION_ID");
  return result;
}

function authorized(options) {
  if (options.authorized !== true) throw new AdminAdapterError("An authorized administrator is required.", "UNAUTHORIZED");
  const actor = String(options.actor ?? "").trim();
  if (!actor) throw new AdminAdapterError("An authenticated administrator identity is required.", "MISSING_ACTOR");
  return actor;
}

function escapeOData(value) { return String(value).replaceAll("'", "''"); }

function itemShape(item = {}, schema = {}) {
  const inverse = Object.fromEntries(Object.entries(schema).map(([display, internal]) => [internal, display]));
  const fields = item.fields ?? {};
  const mapped = {};
  for (const [key, value] of Object.entries(fields)) mapped[inverse[key] ?? key] = value;
  return { id: item.id ?? null, etag: item["@odata.etag"] ?? item.eTag ?? item.etag ?? null, fields: mapped, rawFields: fields };
}

function findInternal(schema, displayName) {
  const internal = schema?.[displayName];
  if (!internal) throw new AdminAdapterError(`Required SharePoint column is missing: ${displayName}.`, "SCHEMA_MISMATCH", { displayName });
  return internal;
}

function mapFields(schema, values) {
  const result = {};
  for (const [displayName, value] of Object.entries(values)) result[findInternal(schema, displayName)] = value;
  return result;
}

function json(value) { return JSON.stringify(value ?? {}); }

function graphPaceValues(changes = {}) {
  const values = {};
  for (const [key, value] of Object.entries(changes)) if (PACE_FIELD_BY_KEY[key]) values[PACE_FIELD_BY_KEY[key]] = value;
  if ((Object.hasOwn(changes, "timeIn") || Object.hasOwn(changes, "timeOut")) && changes.timeIn && changes.timeOut) {
    const duration = calculateDuration(changes.timeIn, changes.timeOut); if (duration === null) throw new AdminAdapterError("Time Out must be at or after Time In.", "INVALID_TIME_RANGE"); values[PACE_FIELD_BY_KEY.durationMinutes] = duration;
  }
  return values;
}

function sameValue(left, right) { return JSON.stringify(left ?? null) === JSON.stringify(right ?? null); }

function valuesAlreadyApplied(item, values) { return Object.entries(values).every(([displayName, value]) => sameValue(item.fields[displayName], value)); }

function graphClientRequest(client, method, path, options = {}) {
  if (typeof client.request === "function") return client.request(method, path, options);
  if (method === "GET" && typeof client.get === "function") return client.get(path, options.headers ?? {});
  throw new AdminAdapterError(`The Graph client cannot perform ${method} requests.`, "GRAPH_CLIENT_UNSUPPORTED");
}

export function createPaceAdminGraphAdapter({ graphClient, writeEnabled = false, authorized: isAuthorized = false, environment = "production", testMode = false } = {}) {
  if (!graphClient) throw new AdminAdapterError("A Graph client is required.", "GRAPH_CLIENT_MISSING");

  const mutationGate = () => {
    if (environment !== "production" && !testMode) throw new AdminAdapterError("Production adapter cannot run outside production.", "ENVIRONMENT_BLOCKED");
    if (!writeEnabled || (!PRODUCTION_ADMIN_WRITES_ENABLED && !testMode)) throw new AdminAdapterError("Production administrative writes are disabled pending approval.", "WRITE_GATE_CLOSED");
    authorized({ authorized: isAuthorized, actor: "adapter" });
  };

  const resource = async listName => {
    const siteId = await graphClient.getSiteId(); const listId = await graphClient.getListId(listName); const schema = await graphClient.getSchema(listName);
    return { siteId, listId, schema };
  };

  const listItems = async (listName, filter) => {
    const { siteId, listId, schema } = await resource(listName);
    const filterText = filter ? `&$filter=fields/${findInternal(schema, filter.displayName)} eq '${escapeOData(filter.value)}'` : "";
    const response = await graphClientRequest(graphClient, "GET", `sites/${siteId}/lists/${listId}/items?$expand=fields&$top=200${filterText}`);
    return { items: response.value ?? [], schema, siteId, listId };
  };

  const getItem = async (listName, itemId) => {
    const { siteId, listId, schema } = await resource(listName);
    const item = await graphClientRequest(graphClient, "GET", `sites/${siteId}/lists/${listId}/items/${encodeURIComponent(itemId)}?$expand=fields`);
    return { ...itemShape(item, schema), schema, siteId, listId };
  };

  const getReview = async visitId => {
    const result = await listItems(ADMIN_LISTS.reviews, { displayName: "PACEVisitItemID", value: visitId });
    if (result.items.length > 1) throw new AdminAdapterError("Duplicate review metadata exists for this PACE visit.", "DUPLICATE_REVIEW_METADATA", { visitId });
    return result.items[0] ? { ...itemShape(result.items[0], result.schema), schema: result.schema, siteId: result.siteId, listId: result.listId } : null;
  };

  const reviewValues = (visitId, input, sourceVersion) => ({
    PACEVisitItemID: String(visitId), ReviewStatus: input.reviewStatus ?? "Unreviewed", ReviewedBy: input.reviewedBy ?? "", ReviewedAt: input.reviewedAt ?? null,
    FollowUpNeeded: input.followUpNeeded === true, FollowUpStatus: input.followUpStatus ?? "Open", FollowUpAssignedTo: input.followUpAssignedTo ?? "", FollowUpDueDate: input.followUpDueDate ?? null,
    IsVoided: input.isVoided === true, VoidReason: input.voidReason ?? "", VoidedBy: input.voidedBy ?? "", VoidedAt: input.voidedAt ?? null, RestoredBy: input.restoredBy ?? "", RestoredAt: input.restoredAt ?? null,
    LastReviewedRecordVersion: sourceVersion ?? "", LastOperationId: input.operationId ?? ""
  });

  const writeItemFields = async (listName, item, schema, values, etag) => {
    const headers = { "Content-Type": "application/json" }; if (etag) headers["If-Match"] = etag;
    const body = mapFields(schema, values);
    return graphClientRequest(graphClient, "PATCH", `sites/${item.siteId}/lists/${item.listId}/items/${encodeURIComponent(item.id)}/fields`, { headers, body });
  };

  const createItem = async (listName, schema, siteId, listId, values) => graphClientRequest(graphClient, "POST", `sites/${siteId}/lists/${listId}/items`, { headers: { "Content-Type": "application/json" }, body: { fields: mapFields(schema, values) } });

  const upsertReview = async (visitId, input, sourceVersion) => {
    mutationGate(); const existing = await getReview(visitId); const fields = existing?.fields ?? {};
    const merged = {
      reviewStatus: fields.ReviewStatus ?? "Unreviewed", reviewedBy: fields.ReviewedBy ?? "", reviewedAt: fields.ReviewedAt ?? null,
      followUpNeeded: fields.FollowUpNeeded === true, followUpStatus: fields.FollowUpStatus ?? "Open", followUpAssignedTo: fields.FollowUpAssignedTo ?? "", followUpDueDate: fields.FollowUpDueDate ?? null,
      isVoided: fields.IsVoided === true, voidReason: fields.VoidReason ?? "", voidedBy: fields.VoidedBy ?? "", voidedAt: fields.VoidedAt ?? null,
      restoredBy: fields.RestoredBy ?? "", restoredAt: fields.RestoredAt ?? null, ...input
    };
    const values = reviewValues(visitId, merged, sourceVersion);
    if (existing?.fields?.LastOperationId === input.operationId) return existing;
    if (existing) { await writeItemFields(ADMIN_LISTS.reviews, existing, existing.schema, values, existing.etag); return getReview(visitId); }
    const target = await resource(ADMIN_LISTS.reviews); await createItem(ADMIN_LISTS.reviews, target.schema, target.siteId, target.listId, values); return getReview(visitId);
  };

  const appendAudit = async event => {
    mutationGate(); const existing = await listItems(ADMIN_LISTS.audit, { displayName: "OperationId", value: event.operationId });
    if (existing.items.length > 1) throw new AdminAdapterError("Duplicate audit entries exist for this operation.", "DUPLICATE_AUDIT_EVENT", { operationId: event.operationId });
    if (existing.items.length === 1) return { duplicate: true, item: itemShape(existing.items[0], existing.schema) };
    const target = await resource(ADMIN_LISTS.audit); const values = { PACEVisitItemID: String(event.visitId), OperationId: event.operationId, ActionType: event.action, Actor: event.actor, Timestamp: event.timestamp, ChangedFields: json(event.changedFields), PreviousValues: json(event.previousValues), NewValues: json(event.newValues), Reason: event.reason ?? "", SourceRecordVersion: event.sourceRecordVersion ?? "" };
    const item = await createItem(ADMIN_LISTS.audit, target.schema, target.siteId, target.listId, values); return { duplicate: false, item: itemShape(item, target.schema) };
  };

  const listAdminNotes = async visitId => {
    const result = await listItems(ADMIN_LISTS.notes, { displayName: "PACEVisitItemID", value: visitId });
    return result.items.map(item => itemShape(item, result.schema)).sort((left, right) => String(left.fields.CreatedAt ?? "").localeCompare(String(right.fields.CreatedAt ?? "")));
  };

  const listAuditHistory = async visitId => {
    const result = await listItems(ADMIN_LISTS.audit, { displayName: "PACEVisitItemID", value: visitId });
    return result.items.map(item => itemShape(item, result.schema)).sort((left, right) => String(left.fields.Timestamp ?? "").localeCompare(String(right.fields.Timestamp ?? "")));
  };

  const appendAdminNote = async ({ visitId, text, actor: actorName, operationId: suppliedOperationId, timestamp = new Date().toISOString(), supersedesNoteId = "" } = {}) => {
    const op = operationId(suppliedOperationId); const administrator = authorized({ authorized: isAuthorized, actor: actorName }); const noteText = String(text ?? "").trim();
    if (!noteText) throw new AdminAdapterError("Administrative note text is required.", "NOTE_TEXT_REQUIRED");
    mutationGate();
    const existing = await listItems(ADMIN_LISTS.notes, { displayName: "OperationId", value: op });
    if (existing.items.length > 1) throw new AdminAdapterError("Duplicate administrative note operations exist.", "DUPLICATE_NOTE_OPERATION", { operationId: op });
    if (existing.items.length === 1) return { operationId: op, duplicate: true, note: itemShape(existing.items[0], existing.schema) };
    const target = await resource(ADMIN_LISTS.notes);
    const values = { NoteID: `note-${op}`, PACEVisitItemID: String(visitId), NoteText: noteText, Actor: administrator, CreatedAt: timestamp, SupersedesNoteID: String(supersedesNoteId ?? ""), OperationId: op };
    const item = await createItem(ADMIN_LISTS.notes, target.schema, target.siteId, target.listId, values);
    return { operationId: op, duplicate: false, note: itemShape(item, target.schema) };
  };

  const readPaceItem = itemId => getItem(CONFIG.lists.paceVisits, itemId);

  const updatePaceFields = async (itemId, changes, options = {}) => {
    mutationGate(); const current = await readPaceItem(itemId);
    if (options.expectedEtag && current.etag !== options.expectedEtag) throw new AdminAdapterError("The PACE record changed while it was open.", "STALE_RECORD", { expectedEtag: options.expectedEtag, actualEtag: current.etag, itemId });
    const values = graphPaceValues(changes);
    const changed = Object.keys(values); if (!changed.length) return { item: current, changed: [] };
    const response = await writeItemFields(CONFIG.lists.paceVisits, current, current.schema, values, current.etag);
    const verified = await readPaceItem(itemId);
    for (const displayName of changed) if (JSON.stringify(verified.fields[displayName] ?? null) !== JSON.stringify(values[displayName] ?? null)) throw new AdminAdapterError("The saved PACE values could not be verified.", "SAVE_VERIFICATION_FAILED", { itemId, field: displayName });
    const previousValues = Object.fromEntries(changed.map(displayName => [displayName, current.fields[displayName] ?? null]));
    return { item: verified, changed, previousValues, response };
  };

  const saveAdministrativeChange = async ({ visitId, changes = {}, review = {}, actor: actorName, correctionReason = "", expectedEtag, operationId: suppliedOperationId, timestamp = new Date().toISOString() } = {}) => {
    const op = operationId(suppliedOperationId); const administrator = authorized({ authorized: isAuthorized, actor: actorName }); mutationGate();
    const completed = []; let sourceVersion = expectedEtag ?? ""; let paceResult = null;
    try {
      try {
        paceResult = await updatePaceFields(visitId, changes, { expectedEtag });
      } catch (error) {
        if (error.code !== "STALE_RECORD") throw error;
        const current = await readPaceItem(visitId); const values = graphPaceValues(changes);
        if (!valuesAlreadyApplied(current, values)) throw error;
        paceResult = { item: current, changed: Object.keys(values), alreadyApplied: true };
      }
      sourceVersion = paceResult.item.etag ?? sourceVersion; completed.push("pace");
      const reviewResult = await upsertReview(visitId, { ...review, reviewedBy: administrator, reviewedAt: timestamp, operationId: op }, sourceVersion); completed.push("review");
      const auditResult = await appendAudit({ visitId, operationId: op, action: "Edit", actor: administrator, timestamp, changedFields: paceResult.changed, previousValues: paceResult.previousValues ?? {}, newValues: changes, reason: correctionReason, sourceRecordVersion: sourceVersion }); completed.push("audit");
      return { operationId: op, paceResult, reviewResult, auditResult, completed };
    } catch (error) {
      if (completed.length) throw new PartialAdminOperationError("The operation partially completed; retry with the same operation ID after reviewing the completed stages.", { operationId: op, completed, failedStage: completed.includes("review") ? "audit" : completed.includes("pace") ? "review" : "pace", cause: error.message });
      throw error;
    }
  };

  const saveReview = async ({ visitId, review = {}, actor: actorName, reason = "", operationId: suppliedOperationId, timestamp = new Date().toISOString() } = {}) => {
    const op = operationId(suppliedOperationId); const administrator = authorized({ authorized: isAuthorized, actor: actorName }); mutationGate();
    try {
      const source = await readPaceItem(visitId); const reviewResult = await upsertReview(visitId, { ...review, reviewedBy: administrator, reviewedAt: timestamp, operationId: op }, source.etag);
      const auditResult = await appendAudit({ visitId, operationId: op, action: review.isVoided ? "Void" : "Review", actor: administrator, timestamp, changedFields: Object.keys(review), previousValues: {}, newValues: review, reason, sourceRecordVersion: source.etag });
      return { operationId: op, reviewResult, auditResult };
    } catch (error) { throw error; }
  };

  const voidOrRestore = async ({ visitId, voided, reason = "", actor: actorName, operationId: suppliedOperationId, timestamp = new Date().toISOString() } = {}) => {
    if (voided && !String(reason).trim()) throw new AdminAdapterError("A void reason is required.", "VOID_REASON_REQUIRED");
    const op = operationId(suppliedOperationId); const administrator = authorized({ authorized: isAuthorized, actor: actorName }); mutationGate();
    const source = await readPaceItem(visitId); const review = voided ? { isVoided: true, voidReason: reason, voidedBy: administrator, voidedAt: timestamp, operationId: op } : { isVoided: false, voidReason: "", restoredBy: administrator, restoredAt: timestamp, operationId: op };
    const reviewResult = await upsertReview(visitId, review, source.etag);
    const auditResult = await appendAudit({ visitId, operationId: op, action: voided ? "Void" : "Restore", actor: administrator, timestamp, changedFields: ["IsVoided"], previousValues: {}, newValues: review, reason: reason || "Submission restored", sourceRecordVersion: source.etag });
    return { operationId: op, reviewResult, auditResult };
  };

  return { getReview, listAdminNotes, listAuditHistory, appendAdminNote, readPaceItem, updatePaceFields, saveAdministrativeChange, saveReview, voidOrRestore, appendAudit, mutationGate };
}

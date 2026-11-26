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
  OperationStatus: { type: "Choice", required: true, default: "Attempted", choices: ["Attempted", "Succeeded", "Conflicted", "Failed", "Uncertain"] },
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

function parseJson(value, fallback = null) {
  try { return JSON.parse(String(value ?? "")); } catch { return fallback; }
}

function outcomeForError(error) {
  if (error?.code === "STALE_RECORD" || Number(error?.status) === 409 || Number(error?.status) === 412) return "Conflicted";
  if (error?.code === "GRAPH_REQUEST_FAILED" && Number(error?.status) >= 500) return "Uncertain";
  if (error?.code === "SAVE_VERIFICATION_FAILED") return "Uncertain";
  if (error?.name === "TypeError" || error?.code === "NETWORK_ERROR") return "Uncertain";
  return "Failed";
}

function graphClientRequest(client, method, path, options = {}) {
  if (typeof client.request === "function") return client.request(method, path, options);
  if (method === "GET" && typeof client.get === "function") return client.get(path, options.headers ?? {});
  throw new AdminAdapterError(`The Graph client cannot perform ${method} requests.`, "GRAPH_CLIENT_UNSUPPORTED");
}

export function createPaceAdminGraphAdapter({ graphClient, writeEnabled = false, productionWritesEnabled = PRODUCTION_ADMIN_WRITES_ENABLED, authorized: isAuthorized = false, environment = "production", testMode = false } = {}) {
  if (!graphClient) throw new AdminAdapterError("A Graph client is required.", "GRAPH_CLIENT_MISSING");

  const mutationGate = () => {
    if (environment !== "production" && !testMode) throw new AdminAdapterError("Production adapter cannot run outside production.", "ENVIRONMENT_BLOCKED");
    if (!writeEnabled || (!productionWritesEnabled && !testMode)) throw new AdminAdapterError("Production administrative writes are disabled pending approval.", "WRITE_GATE_CLOSED");
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

  const auditResource = async () => {
    const target = await resource(ADMIN_LISTS.audit);
    for (const displayName of Object.keys(AUDIT_LIST_SCHEMA)) findInternal(target.schema, displayName);
    return target;
  };

  const getAuditByOperation = async suppliedOperationId => {
    const result = await listItems(ADMIN_LISTS.audit, { displayName: "OperationId", value: suppliedOperationId });
    if (result.items.length > 1) throw new AdminAdapterError("Duplicate audit entries exist for this operation.", "DUPLICATE_AUDIT_EVENT", { operationId: suppliedOperationId });
    return result.items[0] ? { ...itemShape(result.items[0], result.schema), schema: result.schema, siteId: result.siteId, listId: result.listId } : null;
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
    mutationGate(); const existing = await getAuditByOperation(event.operationId);
    if (existing) return { duplicate: true, item: existing };
    const target = await auditResource(); const values = { PACEVisitItemID: String(event.visitId), OperationId: event.operationId, OperationStatus: event.operationStatus ?? "Succeeded", ActionType: event.action, Actor: event.actor, Timestamp: event.timestamp, ChangedFields: json(event.changedFields), PreviousValues: json(event.previousValues), NewValues: json(event.newValues), Reason: event.reason ?? "", SourceRecordVersion: event.sourceRecordVersion ?? "" };
    const item = await createItem(ADMIN_LISTS.audit, target.schema, target.siteId, target.listId, values);
    const persisted = await getAuditByOperation(event.operationId);
    if (!persisted) throw new AdminAdapterError("The preservation record could not be found after creation.", "PRESERVATION_VERIFICATION_FAILED", { operationId: event.operationId });
    return { duplicate: false, item: persisted ?? { ...itemShape(item, target.schema), schema: target.schema, siteId: target.siteId, listId: target.listId } };
  };

  const updateAuditOutcome = async (audit, operationStatus, sourceRecordVersion = undefined) => {
    if (!audit) throw new AdminAdapterError("The preservation record is unavailable.", "PRESERVATION_RECORD_MISSING");
    const values = { OperationStatus: operationStatus };
    if (sourceRecordVersion !== undefined) values.SourceRecordVersion = sourceRecordVersion;
    await writeItemFields(ADMIN_LISTS.audit, audit, audit.schema, values, audit.etag);
    const verified = await getItem(ADMIN_LISTS.audit, audit.id);
    if (verified.fields.OperationStatus !== operationStatus) throw new AdminAdapterError("The preservation outcome could not be verified.", "PRESERVATION_VERIFICATION_FAILED", { operationId: audit.fields.OperationId, operationStatus });
    return verified;
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

  const verifyAuditReady = async () => { mutationGate(); await auditResource(); return true; };

  const preserveBeforeSourceChange = async ({ visitId, current, changedValues, previousValues, actor, correctionReason, operationId: op, timestamp, expectedEtag }) => {
    const intended = { ...changedValues };
    let audit = await getAuditByOperation(op);
    if (!audit) {
      const created = await appendAudit({ visitId, operationId: op, operationStatus: "Attempted", action: "Edit", actor, timestamp, changedFields: Object.keys(intended), previousValues, newValues: intended, reason: correctionReason, sourceRecordVersion: current.etag });
      audit = created.item;
      const fields = audit.fields;
      const verified = String(fields.PACEVisitItemID) === String(visitId)
        && String(fields.OperationId) === String(op)
        && fields.OperationStatus === "Attempted"
        && fields.ActionType === "Edit"
        && String(fields.Actor) === String(actor)
        && sameValue(parseJson(fields.ChangedFields, []), Object.keys(intended))
        && sameValue(parseJson(fields.PreviousValues, {}), previousValues)
        && sameValue(parseJson(fields.NewValues, {}), intended)
        && String(fields.Reason ?? "") === String(correctionReason)
        && String(fields.SourceRecordVersion ?? "") === String(current.etag ?? "");
      if (!verified) throw new AdminAdapterError("The preservation record could not be verified before the source mutation.", "PRESERVATION_VERIFICATION_FAILED", { operationId: op });
    } else {
      const fields = audit.fields;
      const matches = String(fields.PACEVisitItemID) === String(visitId)
        && fields.ActionType === "Edit"
        && String(fields.Actor) === String(actor)
        && sameValue(parseJson(fields.ChangedFields, []), Object.keys(intended))
        && sameValue(parseJson(fields.NewValues, {}), intended)
        && String(fields.Reason ?? "") === String(correctionReason);
      if (!matches) throw new AdminAdapterError("The operation ID is already used for a different correction.", "DUPLICATE_OPERATION", { operationId: op });
      if (fields.OperationStatus === "Succeeded") return { audit, intended, sourceVersion: String(fields.SourceRecordVersion ?? current.etag ?? "") };
    }
    if (expectedEtag && current.etag !== expectedEtag && !valuesAlreadyApplied(current, intended)) {
      audit = await updateAuditOutcome(audit, "Conflicted", current.etag);
      throw new AdminAdapterError("The PACE record changed before the correction could begin.", "STALE_RECORD", { operationId: op, expectedEtag, actualEtag: current.etag, operationStatus: "Conflicted" });
    }
    return { audit, intended, sourceVersion: String(audit.fields.SourceRecordVersion ?? current.etag ?? "") };
  };

  const saveAdministrativeChange = async ({ visitId, changes = {}, review = {}, actor: actorName, correctionReason = "", expectedEtag, operationId: suppliedOperationId, timestamp = new Date().toISOString() } = {}) => {
    const op = operationId(suppliedOperationId); const administrator = authorized({ authorized: isAuthorized, actor: actorName }); mutationGate();
    const completed = []; let sourceVersion = expectedEtag ?? ""; let paceResult = null; let auditResult = null;
    try {
      await verifyAuditReady();
      const current = await readPaceItem(visitId);
      const intended = graphPaceValues(changes);
      const changed = Object.keys(intended);
      const previousValues = Object.fromEntries(changed.map(displayName => [displayName, current.fields[displayName] ?? null]));
      const preservation = await preserveBeforeSourceChange({ visitId, current, changedValues: intended, previousValues, actor: administrator, correctionReason, operationId: op, timestamp, expectedEtag });
      auditResult = preservation.audit;
      completed.push("preservation");
      if (auditResult.fields.OperationStatus === "Succeeded" && !valuesAlreadyApplied(current, intended)) throw new AdminAdapterError("A completed operation would overwrite a newer correction.", "DUPLICATE_OPERATION", { operationId: op });
      if (valuesAlreadyApplied(current, intended)) {
        const verifiedAudit = auditResult.fields.OperationStatus === "Succeeded" ? auditResult : await updateAuditOutcome(auditResult, "Succeeded", current.etag);
        paceResult = { item: current, changed, previousValues, alreadyApplied: true }; completed.push("pace"); auditResult = verifiedAudit; completed.push("audit");
      } else {
        if (current.etag !== preservation.sourceVersion) {
          auditResult = await updateAuditOutcome(auditResult, "Conflicted", current.etag);
          throw new AdminAdapterError("The PACE record changed after preservation and was not modified.", "STALE_RECORD", { operationId: op, operationStatus: "Conflicted" });
        }
        try {
          paceResult = await updatePaceFields(visitId, changes, { expectedEtag: preservation.sourceVersion });
        } catch (error) {
          const latest = await readPaceItem(visitId).catch(() => null);
          if (latest && valuesAlreadyApplied(latest, intended)) {
            paceResult = { item: latest, changed, previousValues, alreadyApplied: true };
          } else {
            const outcome = outcomeForError(error);
            try { auditResult = await updateAuditOutcome(auditResult, outcome, preservation.sourceVersion); }
            catch (outcomeError) { throw new PartialAdminOperationError("The source outcome could not be recorded safely; investigate before retrying.", { operationId: op, completed, failedStage: "audit-outcome", operationStatus: "Uncertain", cause: outcomeError.message }); }
            error.details = { ...(error.details ?? {}), operationId: op, operationStatus: outcome };
            throw error;
          }
        }
        completed.push("pace");
        try { auditResult = await updateAuditOutcome(auditResult, "Succeeded", paceResult.item.etag); }
        catch (error) { throw new PartialAdminOperationError("The source correction completed but its preservation outcome is uncertain.", { operationId: op, completed, failedStage: "audit-outcome", operationStatus: "Uncertain", cause: error.message }); }
        completed.push("audit");
      }
      sourceVersion = paceResult.item.etag ?? sourceVersion;
      const reviewResult = await upsertReview(visitId, { ...review, reviewedBy: administrator, reviewedAt: timestamp, operationId: op }, sourceVersion); completed.push("review");
      return { operationId: op, paceResult, reviewResult, auditResult, completed };
    } catch (error) {
      if (error instanceof PartialAdminOperationError || error.details?.operationStatus) throw error;
      if (completed.length && error.code !== "STALE_RECORD" && error.code !== "DUPLICATE_OPERATION") throw new PartialAdminOperationError("The operation partially completed; retry with the same operation ID after reviewing the completed stages.", { operationId: op, completed, failedStage: completed.includes("review") ? "review" : completed.includes("pace") ? "review" : "preservation", cause: error.message });
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

  return { getReview, listAdminNotes, listAuditHistory, appendAdminNote, readPaceItem, updatePaceFields, saveAdministrativeChange, saveReview, voidOrRestore, appendAudit, verifyAuditReady, mutationGate };
}

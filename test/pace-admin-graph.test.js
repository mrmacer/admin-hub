import test from "node:test";
import assert from "node:assert/strict";
import { createPaceAdminGraphAdapter, PartialAdminOperationError } from "../src/modules/pace/pace-admin-graph.js";

const schemas = {
  IEP_Pace_Visits: Object.fromEntries(["Student", "Date", "Teacher Came From", "Room", "Behavior Specialist", "Time In", "Time Out", "Reason", "Intervention Used", "SCM", "Notes", "Duration", "Return Status"].map(name => [name, `pace_${name.replaceAll(" ", "_")}`])),
  IEP_Pace_Admin_Reviews: Object.fromEntries(["PACEVisitItemID", "ReviewStatus", "ReviewedBy", "ReviewedAt", "FollowUpNeeded", "FollowUpStatus", "FollowUpAssignedTo", "FollowUpDueDate", "IsVoided", "VoidReason", "VoidedBy", "VoidedAt", "RestoredBy", "RestoredAt", "LastReviewedRecordVersion", "LastOperationId"].map(name => [name, `review_${name.replaceAll(" ", "_")}`])),
  IEP_Pace_Admin_Notes: Object.fromEntries(["NoteID", "PACEVisitItemID", "NoteText", "Actor", "CreatedAt", "SupersedesNoteID", "OperationId"].map(name => [name, `note_${name.replaceAll(" ", "_")}`])),
  IEP_Pace_Admin_Audit: Object.fromEntries(["PACEVisitItemID", "OperationId", "OperationStatus", "ActionType", "Actor", "Timestamp", "ChangedFields", "PreviousValues", "NewValues", "Reason", "SourceRecordVersion"].map(name => [name, `audit_${name.replaceAll(" ", "_")}`]))
};

function clone(value) { return structuredClone(value); }

function createMockGraph({ failAudit = false, failAuditOutcome = false, failSourcePatch = false, corruptPreservation = false, uncertainSourceReadAfterPatch = false, missingAuditField = false } = {}) {
  const calls = []; let sequence = 10; let shouldFailAudit = failAudit; let shouldFailAuditOutcome = failAuditOutcome; let shouldFailSourcePatch = failSourcePatch; let shouldCorruptPreservation = corruptPreservation; let shouldFailSourceReadAfterPatch = uncertainSourceReadAfterPatch; let sourcePatchCompleted = false;
  const lists = {
    pace: { id: "pace-1", items: { "42": { id: "42", "@odata.etag": 'W/"1"', fields: { pace_Student: "Synthetic Student", pace_Date: "2026-11-25", pace_Teacher_Came_From: "Synthetic Classroom", pace_Room: "PACE Room 1", pace_Behavior_Specialist: ["Synthetic Specialist"], pace_Time_In: "08:00", pace_Time_Out: "08:20", pace_Reason: ["Break request"], pace_Intervention_Used: ["Calm space"], pace_SCM: false, pace_Notes: "Original synthetic note.", pace_Duration: 20, pace_Return_Status: "Returned" } } } },
    reviews: { id: "reviews-1", items: {} },
    notes: { id: "notes-1", items: {} },
    audit: { id: "audit-1", items: {} }
  };
  const listKey = listName => listName === "IEP_Pace_Visits" ? "pace" : listName === "IEP_Pace_Admin_Reviews" ? "reviews" : listName === "IEP_Pace_Admin_Notes" ? "notes" : "audit";
  const mock = {
    calls,
    async getSiteId() { return "site-1"; },
    async getListId(name) { return lists[listKey(name)].id; },
    async getSchema(name) {
      const schema = clone(schemas[name]);
      if (missingAuditField && name === "IEP_Pace_Admin_Audit") delete schema.OperationId;
      return schema;
    },
    async request(method, path, options = {}) {
      calls.push({ method, path, options: clone(options) });
      const list = Object.values(lists).find(entry => path.includes(`/lists/${entry.id}/`));
      if (!list) throw new Error(`Unknown list path: ${path}`);
      if (method === "GET" && path.includes("/items?") && path.includes("$filter=")) {
        const match = decodeURIComponent(path).match(/eq '([^']+)'/); const value = match?.[1] ?? "";
        return { value: Object.values(list.items).filter(item => Object.values(item.fields).some(field => String(field) === value)) .map(clone) };
      }
      if (method === "GET" && path.includes("/items?") && !path.match(/\/items\/[^?]+\?/)) return { value: Object.values(list.items).map(clone) };
      const itemMatch = path.match(/\/items\/([^?\/]+)(?:\?[^]*)?$/);
      if (method === "GET" && itemMatch) {
        if (list.id === "pace-1" && sourcePatchCompleted && shouldFailSourceReadAfterPatch) throw Object.assign(new Error("Synthetic network interruption after source save"), { code: "NETWORK_ERROR" });
        return clone(list.items[decodeURIComponent(itemMatch[1])]);
      }
      if (method === "POST" && path.endsWith("/items")) {
        if (shouldFailAudit && list.id === "audit-1") throw new Error("Synthetic audit list failure");
        const id = String(sequence++); list.items[id] = { id, "@odata.etag": 'W/"1"', fields: clone(options.body.fields) };
        if (shouldCorruptPreservation && list.id === "audit-1") list.items[id].fields.audit_OperationStatus = "Succeeded";
        return clone(list.items[id]);
      }
      if (method === "PATCH" && path.endsWith("/fields")) {
        const itemId = decodeURIComponent(path.split("/items/")[1].split("/")[0]); const item = list.items[itemId];
        if (list.id === "pace-1" && shouldFailSourcePatch) throw new Error("Synthetic source PATCH failure");
        if (list.id === "audit-1" && shouldFailAuditOutcome) throw new Error("Synthetic audit outcome failure");
        if (options.headers?.["If-Match"] && options.headers["If-Match"] !== item["@odata.etag"]) throw new Error("412 Precondition Failed");
        Object.assign(item.fields, clone(options.body)); item["@odata.etag"] = `W/"${Number(item["@odata.etag"].match(/\d+/)?.[0] ?? 1) + 1}"`; if (list.id === "pace-1") sourcePatchCompleted = true; return clone(item);
      }
      throw new Error(`Unsupported mock request: ${method} ${path}`);
    }
  };
  mock.setFailAudit = value => { shouldFailAudit = value; };
  mock.setFailAuditOutcome = value => { shouldFailAuditOutcome = value; };
  mock.setFailSourcePatch = value => { shouldFailSourcePatch = value; };
  mock.setFailSourceReadAfterPatch = value => { shouldFailSourceReadAfterPatch = value; };
  return mock;
}

const admin = { authorized: true, actor: "admin@iu29.org" };

test("production adapter rejects mutations while the production gate is closed", async () => {
  const adapter = createPaceAdminGraphAdapter({ graphClient: createMockGraph(), writeEnabled: false, authorized: true });
  await assert.rejects(() => adapter.updatePaceFields("42", { room: "PACE Room 2" }), error => error.code === "WRITE_GATE_CLOSED");
});

test("mocked production adapter updates only mapped fields and verifies the saved record", async () => {
  const mock = createMockGraph();
  const adapter = createPaceAdminGraphAdapter({ graphClient: mock, writeEnabled: true, authorized: true, testMode: true });
  const result = await adapter.updatePaceFields("42", { timeIn: "08:00", timeOut: "08:35", room: "PACE Room 2" }, { expectedEtag: 'W/"1"' });
  assert.deepEqual(result.changed.sort(), ["Room", "Time In", "Time Out", "Duration"].sort());
  assert.equal(result.item.fields.Notes, "Original synthetic note.");
  assert.equal(result.item.fields.Duration, 35);
  assert.equal(mock.calls.filter(call => call.method === "DELETE").length, 0);
});

test("source edits map student, date, teacher and return fields while preserving the stable item id", async () => {
  const mock = createMockGraph(); const adapter = createPaceAdminGraphAdapter({ graphClient: mock, writeEnabled: true, authorized: true, testMode: true });
  const result = await adapter.updatePaceFields("42", { student: "Corrected Student", date: "2026-11-24", teacherCameFrom: "Corrected Classroom", returnStatus: "Returned to class" }, { expectedEtag: 'W/"1"' });
  assert.equal(result.item.id, "42");
  assert.deepEqual(result.changed.sort(), ["Student", "Date", "Teacher Came From", "Return Status"].sort());
  assert.deepEqual(result.previousValues, { Student: "Synthetic Student", Date: "2026-11-25", "Teacher Came From": "Synthetic Classroom", "Return Status": "Returned" });
  const patch = mock.calls.find(call => call.method === "PATCH" && call.path.includes("pace-1"));
  assert.equal(patch.options.headers["If-Match"], 'W/"1"');
});

test("stale source ETags are rejected before any PATCH", async () => {
  const mock = createMockGraph(); const adapter = createPaceAdminGraphAdapter({ graphClient: mock, writeEnabled: true, authorized: true, testMode: true });
  await assert.rejects(() => adapter.updatePaceFields("42", { room: "PACE Room 3" }, { expectedEtag: 'W/"stale"' }), error => error.code === "STALE_RECORD");
  assert.equal(mock.calls.some(call => call.method === "PATCH"), false);
});

test("audit schema is verified before a source mutation begins", async () => {
  const mock = createMockGraph({ missingAuditField: true });
  const adapter = createPaceAdminGraphAdapter({ graphClient: mock, writeEnabled: true, authorized: true, testMode: true });
  await assert.rejects(() => adapter.saveAdministrativeChange({ visitId: "42", changes: { room: "PACE Room 2" }, actor: admin.actor, correctionReason: "Synthetic correction", expectedEtag: 'W/"1"', operationId: "op-schema-1" }), error => error.code === "SCHEMA_MISMATCH");
  assert.equal(mock.calls.some(call => call.method === "PATCH" && call.path.includes("pace-1")), false);
});

test("review metadata and audit events persist through mocked Graph storage", async () => {
  const mock = createMockGraph(); const adapter = createPaceAdminGraphAdapter({ graphClient: mock, writeEnabled: true, authorized: true, testMode: true });
  const result = await adapter.saveReview({ visitId: "42", review: { reviewStatus: "Reviewed", followUpNeeded: true, followUpStatus: "Open" }, actor: admin.actor, reason: "Synthetic review", operationId: "op-review-1", timestamp: "2026-11-25T15:00:00.000Z" });
  assert.equal(result.reviewResult.fields.ReviewStatus, "Reviewed");
  assert.equal(result.auditResult.item.fields.OperationId, "op-review-1");
  const review = await adapter.getReview("42");
  assert.equal(review.fields.ReviewedBy, admin.actor);
  const note = await adapter.appendAdminNote({ visitId: "42", text: "Synthetic administrative note", actor: admin.actor, operationId: "op-note-1", timestamp: "2026-11-25T15:01:00.000Z" });
  assert.equal(note.note.fields.NoteText, "Synthetic administrative note");
  assert.equal(note.note.fields.Actor, admin.actor);
  assert.equal((await adapter.listAdminNotes("42")).length, 1);
  const duplicate = await adapter.appendAdminNote({ visitId: "42", text: "Synthetic administrative note", actor: admin.actor, operationId: "op-note-1", timestamp: "2026-11-25T15:01:00.000Z" });
  assert.equal(duplicate.duplicate, true);
  assert.equal(mock.calls.some(call => call.method === "DELETE" && call.path.includes("notes-1")), false);
});

test("preservation creation failure prevents any source PATCH", async () => {
  const mock = createMockGraph({ failAudit: true }); const adapter = createPaceAdminGraphAdapter({ graphClient: mock, writeEnabled: true, authorized: true, testMode: true });
  await assert.rejects(() => adapter.saveAdministrativeChange({ visitId: "42", changes: { room: "PACE Room 2" }, actor: admin.actor, correctionReason: "Synthetic correction", expectedEtag: 'W/"1"', operationId: "op-preservation-fail" }), /Synthetic audit list failure/);
  assert.equal(mock.calls.some(call => call.method === "PATCH" && call.path.includes("pace-1")), false);
});

test("preservation verification failure prevents any source PATCH", async () => {
  const mock = createMockGraph({ corruptPreservation: true }); const adapter = createPaceAdminGraphAdapter({ graphClient: mock, writeEnabled: true, authorized: true, testMode: true });
  await assert.rejects(() => adapter.saveAdministrativeChange({ visitId: "42", changes: { room: "PACE Room 2" }, actor: admin.actor, correctionReason: "Synthetic correction", expectedEtag: 'W/"1"', operationId: "op-preservation-verify-fail" }), error => error.code === "PRESERVATION_VERIFICATION_FAILED");
  assert.equal(mock.calls.some(call => call.method === "PATCH" && call.path.includes("pace-1")), false);
});

test("ETag conflict is recorded without modifying the source", async () => {
  const mock = createMockGraph(); const adapter = createPaceAdminGraphAdapter({ graphClient: mock, writeEnabled: true, authorized: true, testMode: true });
  await assert.rejects(() => adapter.saveAdministrativeChange({ visitId: "42", changes: { room: "PACE Room 2" }, actor: admin.actor, correctionReason: "Synthetic correction", expectedEtag: 'W/"stale"', operationId: "op-conflict-1" }), error => error.code === "STALE_RECORD");
  assert.equal(mock.calls.some(call => call.method === "PATCH" && call.path.includes("pace-1")), false);
  assert.equal(mock.calls.some(call => call.method === "PATCH" && call.path.includes("audit-1") && call.options.body.audit_OperationStatus === "Conflicted"), true);
});

test("source PATCH failure after preservation is retryable with the same operation ID", async () => {
  const mock = createMockGraph({ failSourcePatch: true }); const adapter = createPaceAdminGraphAdapter({ graphClient: mock, writeEnabled: true, authorized: true, testMode: true });
  await assert.rejects(() => adapter.saveAdministrativeChange({ visitId: "42", changes: { room: "PACE Room 2" }, actor: admin.actor, correctionReason: "Synthetic correction", expectedEtag: 'W/"1"', operationId: "op-source-fail-1" }), error => error.details?.operationStatus === "Failed");
  mock.setFailSourcePatch(false);
  const retried = await adapter.saveAdministrativeChange({ visitId: "42", changes: { room: "PACE Room 2" }, actor: admin.actor, correctionReason: "Synthetic correction", expectedEtag: 'W/"1"', operationId: "op-source-fail-1" });
  assert.equal(retried.auditResult.fields.OperationStatus, "Succeeded");
  assert.equal(mock.calls.filter(call => call.method === "PATCH" && call.path.includes("pace-1")).length, 2);
});

test("source PATCH success followed by audit outcome failure is uncertain and recovers without a second PATCH", async () => {
  const mock = createMockGraph({ failAuditOutcome: true }); const adapter = createPaceAdminGraphAdapter({ graphClient: mock, writeEnabled: true, authorized: true, testMode: true });
  await assert.rejects(() => adapter.saveAdministrativeChange({ visitId: "42", changes: { room: "PACE Room 2" }, actor: admin.actor, correctionReason: "Synthetic correction", expectedEtag: 'W/"1"', operationId: "op-outcome-fail-1" }), error => error instanceof PartialAdminOperationError && error.details.operationStatus === "Uncertain");
  mock.setFailAuditOutcome(false);
  const recovered = await adapter.saveAdministrativeChange({ visitId: "42", changes: { room: "PACE Room 2" }, actor: admin.actor, correctionReason: "Synthetic correction", expectedEtag: 'W/"1"', operationId: "op-outcome-fail-1" });
  assert.equal(recovered.paceResult.alreadyApplied, true);
  assert.equal(recovered.auditResult.fields.OperationStatus, "Succeeded");
  assert.equal(mock.calls.filter(call => call.method === "PATCH" && call.path.includes("pace-1")).length, 1);
});

test("network interruption after source save is uncertain and retry does not overwrite newer values", async () => {
  const mock = createMockGraph({ uncertainSourceReadAfterPatch: true }); const adapter = createPaceAdminGraphAdapter({ graphClient: mock, writeEnabled: true, authorized: true, testMode: true });
  await assert.rejects(() => adapter.saveAdministrativeChange({ visitId: "42", changes: { room: "PACE Room 2" }, actor: admin.actor, correctionReason: "Synthetic correction", expectedEtag: 'W/"1"', operationId: "op-network-1" }), error => error.details?.operationStatus === "Uncertain");
  mock.setFailSourceReadAfterPatch(false);
  const recovered = await adapter.saveAdministrativeChange({ visitId: "42", changes: { room: "PACE Room 2" }, actor: admin.actor, correctionReason: "Synthetic correction", expectedEtag: 'W/"1"', operationId: "op-network-1" });
  assert.equal(recovered.paceResult.alreadyApplied, true);
  assert.equal(mock.calls.filter(call => call.method === "PATCH" && call.path.includes("pace-1")).length, 1);
});

test("partial failures expose completed stages and a retry-safe operation ID", async () => {
  const mock = createMockGraph({ failAuditOutcome: true }); const adapter = createPaceAdminGraphAdapter({ graphClient: mock, writeEnabled: true, authorized: true, testMode: true });
  await assert.rejects(() => adapter.saveAdministrativeChange({ visitId: "42", changes: { room: "PACE Room 2" }, review: { reviewStatus: "Reviewed" }, actor: admin.actor, correctionReason: "Synthetic correction", expectedEtag: 'W/"1"', operationId: "op-partial-1", timestamp: "2026-11-25T15:00:00.000Z" }), error => {
    assert.ok(error instanceof PartialAdminOperationError);
    assert.equal(error.operationId, "op-partial-1");
    assert.deepEqual(error.details.completed, ["preservation", "pace"]);
    assert.equal(error.details.failedStage, "audit-outcome");
    return true;
  });
  mock.setFailAuditOutcome(false);
  const retried = await adapter.saveAdministrativeChange({ visitId: "42", changes: { room: "PACE Room 2" }, review: { reviewStatus: "Reviewed" }, actor: admin.actor, correctionReason: "Synthetic correction", expectedEtag: 'W/"1"', operationId: "op-partial-1", timestamp: "2026-11-25T15:00:00.000Z" });
  assert.equal(retried.auditResult.fields.OperationStatus, "Succeeded");
  assert.equal(mock.calls.filter(call => call.method === "PATCH" && call.path.includes("pace-1")).length, 1);
  assert.equal(mock.calls.some(call => call.method === "DELETE"), false);
});

test("duplicate operations cannot overwrite a newer correction", async () => {
  const mock = createMockGraph(); const adapter = createPaceAdminGraphAdapter({ graphClient: mock, writeEnabled: true, authorized: true, testMode: true });
  await adapter.saveAdministrativeChange({ visitId: "42", changes: { room: "PACE Room 2" }, actor: admin.actor, correctionReason: "First correction", expectedEtag: 'W/"1"', operationId: "op-newer-1" });
  await adapter.saveAdministrativeChange({ visitId: "42", changes: { room: "PACE Room 3" }, actor: admin.actor, correctionReason: "Newer correction", expectedEtag: 'W/"2"', operationId: "op-newer-2" });
  await assert.rejects(() => adapter.saveAdministrativeChange({ visitId: "42", changes: { room: "PACE Room 2" }, actor: admin.actor, correctionReason: "First correction", expectedEtag: 'W/"1"', operationId: "op-newer-1" }), error => error.code === "DUPLICATE_OPERATION");
  assert.equal(mock.calls.filter(call => call.method === "PATCH" && call.path.includes("pace-1")).length, 2);
});

test("void and restore write review metadata only and preserve the source item ID", async () => {
  const mock = createMockGraph(); const adapter = createPaceAdminGraphAdapter({ graphClient: mock, writeEnabled: true, authorized: true, testMode: true });
  const voided = await adapter.voidOrRestore({ visitId: "42", voided: true, reason: "Synthetic duplicate", actor: admin.actor, operationId: "op-void-1" });
  assert.equal(voided.reviewResult.fields.IsVoided, true);
  const restored = await adapter.voidOrRestore({ visitId: "42", voided: false, actor: admin.actor, operationId: "op-restore-1" });
  assert.equal(restored.reviewResult.fields.IsVoided, false);
  assert.equal((await adapter.readPaceItem("42")).id, "42");
  await assert.rejects(() => adapter.voidOrRestore({ visitId: "42", voided: true, actor: admin.actor, operationId: "op-void-2" }), /void reason/);
});

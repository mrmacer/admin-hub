import test from "node:test";
import assert from "node:assert/strict";
import { createPaceAdminGraphAdapter } from "../src/modules/pace/pace-admin-graph.js";
import { createPaceAdminService } from "../src/modules/pace/pace-admin-service.js";

const schemas = {
  IEP_Pace_Visits: Object.fromEntries(["Student", "Date", "Teacher Came From", "Room", "Behavior Specialist", "Time In", "Time Out", "Reason", "Intervention Used", "SCM", "Notes", "Duration", "Return Status"].map(name => [name, `pace_${name.replaceAll(" ", "_")}`])),
  IEP_Pace_Admin_Reviews: Object.fromEntries(["PACEVisitItemID", "ReviewStatus", "ReviewedBy", "ReviewedAt", "FollowUpNeeded", "FollowUpStatus", "FollowUpAssignedTo", "FollowUpDueDate", "IsVoided", "VoidReason", "VoidedBy", "VoidedAt", "RestoredBy", "RestoredAt", "LastReviewedRecordVersion", "LastOperationId"].map(name => [name, `review_${name.replaceAll(" ", "_")}`])),
  IEP_Pace_Admin_Notes: Object.fromEntries(["NoteID", "PACEVisitItemID", "NoteText", "Actor", "CreatedAt", "SupersedesNoteID", "OperationId"].map(name => [name, `note_${name.replaceAll(" ", "_")}`])),
  IEP_Pace_Admin_Audit: Object.fromEntries(["PACEVisitItemID", "OperationId", "ActionType", "Actor", "Timestamp", "ChangedFields", "PreviousValues", "NewValues", "Reason", "SourceRecordVersion"].map(name => [name, `audit_${name.replaceAll(" ", "_")}`]))
};

const clone = value => structuredClone(value);

function createMockGraph({ failAudit = false } = {}) {
  const calls = [];
  let sequence = 10;
  let shouldFailAudit = failAudit;
  const lists = {
    pace: { id: "pace-1", items: { "42": { id: "42", "@odata.etag": 'W/"1"', fields: { pace_Student: "Synthetic Student", pace_Date: "2026-11-25", pace_Teacher_Came_From: "Synthetic Classroom", pace_Room: "PACE Room 1", pace_Behavior_Specialist: ["Synthetic Specialist"], pace_Time_In: "08:00", pace_Time_Out: "08:20", pace_Reason: ["Break request"], pace_Intervention_Used: ["Calm space"], pace_SCM: false, pace_Notes: "Original synthetic note.", pace_Duration: 20, pace_Return_Status: "Returned" } } } },
    reviews: { id: "reviews-1", items: {} },
    notes: { id: "notes-1", items: {} },
    audit: { id: "audit-1", items: {} }
  };
  const listKey = name => name === "IEP_Pace_Visits" ? "pace" : name === "IEP_Pace_Admin_Reviews" ? "reviews" : name === "IEP_Pace_Admin_Notes" ? "notes" : "audit";
  const mock = {
    calls,
    async getSiteId() { return "site-1"; },
    async getListId(name) { return lists[listKey(name)].id; },
    async getSchema(name) { return schemas[name]; },
    async request(method, path, options = {}) {
      calls.push({ method, path, options: clone(options) });
      const list = Object.values(lists).find(entry => path.includes(`/lists/${entry.id}/`));
      if (!list) throw new Error(`Unknown list path: ${path}`);
      if (method === "GET" && path.includes("/items?") && path.includes("$filter=")) {
        const match = decodeURIComponent(path).match(/eq '([^']+)'/);
        const value = match?.[1] ?? "";
        return { value: Object.values(list.items).filter(item => Object.values(item.fields).some(field => String(field) === value)).map(clone) };
      }
      if (method === "GET" && path.includes("/items?") && !path.match(/\/items\/[^?]+\?/)) return { value: Object.values(list.items).map(clone) };
      const itemMatch = path.match(/\/items\/([^?\/]+)(?:\?[^]*)?$/);
      if (method === "GET" && itemMatch) return clone(list.items[decodeURIComponent(itemMatch[1])]);
      if (method === "POST" && path.endsWith("/items")) {
        if (shouldFailAudit && list.id === "audit-1") throw new Error("Synthetic audit list failure");
        const id = String(sequence++);
        list.items[id] = { id, "@odata.etag": 'W/"1"', fields: clone(options.body.fields) };
        return clone(list.items[id]);
      }
      if (method === "PATCH" && path.endsWith("/fields")) {
        const itemId = decodeURIComponent(path.split("/items/")[1].split("/")[0]);
        const item = list.items[itemId];
        if (options.headers?.["If-Match"] && options.headers["If-Match"] !== item["@odata.etag"]) throw new Error("412 Precondition Failed");
        Object.assign(item.fields, clone(options.body));
        item["@odata.etag"] = `W/"${Number(item["@odata.etag"].match(/\d+/)?.[0] ?? 1) + 1}"`;
        return clone(item);
      }
      throw new Error(`Unsupported mock request: ${method} ${path}`);
    }
  };
  mock.setFailAudit = value => { shouldFailAudit = value; };
  return mock;
}

const principal = { authenticated: true, active: true, adminHubAllowed: true, email: "Admin@IU29.org", actor: "body-spoof" };
const fixedNow = () => "2026-11-25T15:00:00.000Z";

function createService(options = {}) {
  const graph = options.graph ?? createMockGraph();
  const adapter = options.adapter ?? createPaceAdminGraphAdapter({ graphClient: graph, writeEnabled: options.writeEnabled ?? true, authorized: true, environment: options.environment ?? "production", testMode: options.testMode ?? true });
  return { graph, service: createPaceAdminService({ adapter, now: fixedNow }) };
}

test("service authorizes the administrator and reads a stable visit with fixed lists", async () => {
  const { service } = createService();
  const allowed = await service.handle({ method: "GET", path: "/admin/pace/visits/42", principal });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.body.sourceId, "42");
  assert.equal(allowed.body.lists.reviews, "IEP_Pace_Admin_Reviews");
  const denied = await service.handle({ method: "GET", path: "/admin/pace/visits/42", principal: { authenticated: false } });
  assert.equal(denied.status, 401);
});

test("service rejects body-supplied identity/list controls and edits only allowlisted fields", async () => {
  const { service, graph } = createService();
  const spoofed = await service.handle({ method: "POST", path: "/admin/pace/visits/42/edit", principal, body: { actor: "spoofed", changes: { room: "PACE Room 2" }, correctionReason: "Correction", expectedEtag: 'W/"1"', operationId: "op-edit-spoof" } });
  assert.equal(spoofed.status, 400);
  const unsupported = await service.handle({ method: "POST", path: "/admin/pace/visits/42/edit", principal, body: { changes: { arbitraryField: "nope" }, correctionReason: "Correction", expectedEtag: 'W/"1"', operationId: "op-edit-unsupported" } });
  assert.equal(unsupported.status, 400);
  const viewed = await service.handle({ method: "POST", path: "/admin/pace/visits/42/viewed", principal, body: { operationId: "op-edit-viewed" } });
  assert.equal(viewed.status, 200);
  const result = await service.handle({ method: "POST", path: "/admin/pace/visits/42/edit", principal, body: { changes: { timeIn: "08:00", timeOut: "08:35", returnStatus: "Returned to class" }, correctionReason: "Corrected timing", expectedEtag: 'W/"1"', operationId: "op-edit-1" } });
  assert.equal(result.status, 200);
  assert.equal(result.body.paceResult.item.id, "42");
  assert.equal(result.body.paceResult.item.fields.Duration, 35);
  assert.equal(result.body.reviewResult.fields.ReviewStatus, "Reviewed");
  assert.equal(result.body.auditResult.item.fields.Actor, "admin@iu29.org");
  const patch = graph.calls.find(call => call.method === "PATCH" && call.path.includes("pace-1"));
  assert.equal(patch.options.headers["If-Match"], 'W/"1"');
  assert.equal(graph.calls.some(call => call.method === "DELETE"), false);
});

test("notes, viewed and follow-up use independent records and work before a review exists", async () => {
  const { service } = createService();
  const viewed = await service.handle({ method: "POST", path: "/admin/pace/visits/42/viewed", principal, body: { operationId: "op-viewed-1" } });
  assert.equal(viewed.status, 200);
  assert.equal(viewed.body.reviewResult.fields.ReviewStatus, "Reviewed");
  const note = await service.handle({ method: "POST", path: "/admin/pace/visits/42/notes", principal, body: { text: "Independent administrative note.", operationId: "op-note-1" } });
  assert.equal(note.status, 201);
  assert.equal(note.body.note.fields.Actor, "admin@iu29.org");
  const followUp = await service.handle({ method: "POST", path: "/admin/pace/visits/42/follow-up", principal, body: { followUpNeeded: true, followUpStatus: "Open", reason: "Needs review", operationId: "op-follow-up-1" } });
  assert.equal(followUp.status, 200);
  assert.equal(followUp.body.reviewResult.fields.FollowUpNeeded, true);
});

test("void and restore are metadata operations and history remains available", async () => {
  const { service, graph } = createService();
  const followUp = await service.handle({ method: "POST", path: "/admin/pace/visits/42/follow-up", principal, body: { followUpNeeded: true, followUpStatus: "Open", reason: "Preserve this state", operationId: "op-preserve-follow-up" } });
  assert.equal(followUp.status, 200);
  const voided = await service.handle({ method: "POST", path: "/admin/pace/visits/42/void", principal, body: { reason: "Duplicate synthetic submission", operationId: "op-void-1" } });
  assert.equal(voided.status, 200);
  assert.equal(voided.body.reviewResult.fields.FollowUpNeeded, true);
  const restored = await service.handle({ method: "POST", path: "/admin/pace/visits/42/restore", principal, body: { operationId: "op-restore-1" } });
  assert.equal(restored.status, 200);
  assert.equal(restored.body.reviewResult.fields.FollowUpNeeded, true);
  const history = await service.handle({ method: "GET", path: "/admin/pace/visits/42/history", principal });
  assert.equal(history.status, 200);
  assert.ok(history.body.audit.length >= 2);
  assert.equal((await service.handle({ method: "DELETE", path: "/admin/pace/visits/42", principal })).status, 405);
  assert.equal(graph.calls.some(call => call.method === "DELETE"), false);
});

test("stale edits conflict and partial audit failures map to retryable responses", async () => {
  const graph = createMockGraph({ failAudit: true });
  const { service } = createService({ graph });
  const stale = await service.handle({ method: "POST", path: "/admin/pace/visits/42/edit", principal, body: { changes: { room: "PACE Room 2" }, correctionReason: "Correction", expectedEtag: 'W/"stale"', operationId: "op-stale-1" } });
  assert.equal(stale.status, 409);
  const partial = await service.handle({ method: "POST", path: "/admin/pace/visits/42/edit", principal, body: { changes: { room: "PACE Room 2" }, correctionReason: "Correction", expectedEtag: 'W/"1"', operationId: "op-partial-1" } });
  assert.equal(partial.status, 502);
  assert.equal(partial.body.code, "PARTIAL_ADMIN_OPERATION");
  graph.setFailAudit(false);
  const retry = await service.handle({ method: "POST", path: "/admin/pace/visits/42/edit", principal, body: { changes: { room: "PACE Room 2" }, correctionReason: "Correction", expectedEtag: 'W/"1"', operationId: "op-partial-1" } });
  assert.equal(retry.status, 200);
  assert.equal(retry.body.auditResult.duplicate, false);
});

test("production writes stay closed and demo adapters cannot run mutations", async () => {
  const production = createService({ writeEnabled: false, testMode: false }).service;
  const blocked = await production.handle({ method: "POST", path: "/admin/pace/visits/42/edit", principal, body: { changes: { room: "PACE Room 2" }, correctionReason: "Correction", expectedEtag: 'W/"1"', operationId: "op-blocked-1" } });
  assert.equal(blocked.status, 503);
  assert.equal(blocked.body.code, "WRITE_GATE_CLOSED");
  const demo = createService({ environment: "demo", testMode: false });
  const isolated = await demo.service.handle({ method: "POST", path: "/admin/pace/visits/42/edit", principal, body: { changes: { room: "PACE Room 2" }, correctionReason: "Correction", expectedEtag: 'W/"1"', operationId: "op-demo-1" } });
  assert.equal(isolated.status, 500);
  assert.equal(isolated.body.code, "ENVIRONMENT_BLOCKED");
});

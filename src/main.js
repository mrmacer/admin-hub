import { APP_ENV } from "./environment.js";
import { CONFIG, DEFAULT_PACE_RANGE_PRESET, PRODUCTION_ADMIN_WRITES_ENABLED } from "./config.js";
import { dateRangeForPreset, localDateString } from "./date-utils.js";
import { PACE_DATA } from "./modules/pace/pace-data.js";
import { renderApp, renderError, renderLoading, renderLogin, renderUnauthorized } from "./app-shell.js";
import { currentRoute, go } from "./router.js";
import { rangeFromControls } from "./components/date-range.js";
import { applyFollowUpAction, seedFollowUps } from "./modules/pace/pace-follow-up.js";
import { normalizeVisit } from "./modules/pace/pace-analytics.js";
import { ADMIN_MUTATION_ACTIONS, REVIEW_STATUS, addDemoAdminNote, applyDemoEdit, markDemoViewed, recordDemoEdit, restoreDemoVisit, saveDemoReview, seedAdminReviews, voidDemoVisit } from "./modules/pace/pace-admin.js";
import { ADMIN_API } from "./admin-api.js";
import { isIntentionalModalDismissal } from "./modal.js";

const root = document.querySelector("#app");
let AUTH = null; let GRAPH = null; let APP_USERS = null;
const state = { demo: APP_ENV === "demo", range: dateRangeForPreset(DEFAULT_PACE_RANGE_PRESET), visits: [], followUps: {}, followUpsSeeded: false, adminReviews: {}, adminReviewsSeeded: false, demoSnapshotLoaded: false, adminEtags: {}, production: { apiReady: ADMIN_API.configured, writesEnabled: ADMIN_API.writesEnabled }, userName: "", studentsSearch: "", studentsSort: "visits", activityFilters: {}, activeVisitId: null, modalMode: "detail", flagOpen: false, noteOpen: false, historyOpen: false, moreOpen: false, editorDraft: null, mutationError: "", mutationNotice: "" };

function paint() {
  if (state.activeVisitId && state.modalMode === "edit" && root.querySelector("#adminStudent")) state.editorDraft = captureEditorDraft();
  root.innerHTML = renderApp(state);
  document.body.classList.toggle("modal-open", Boolean(state.activeVisitId));
  restoreEditorDraft();
}

function readDemoSnapshot() {
  if (!state.demo || !globalThis.localStorage) return null;
  try { const value = JSON.parse(globalThis.localStorage.getItem(CONFIG.demoStorageKey) ?? "null"); return value && typeof value === "object" ? value : null; } catch { return null; }
}

function persistDemoSnapshot() {
  if (!state.demo || !globalThis.localStorage) return;
  try { globalThis.localStorage.setItem(CONFIG.demoStorageKey, JSON.stringify({ visits: state.visits, followUps: state.followUps, adminReviews: state.adminReviews })); } catch { /* Browser storage is optional for the demo. */ }
}

function resetDemoSnapshot() {
  if (!state.demo) return;
  try { globalThis.localStorage?.removeItem(CONFIG.demoStorageKey); } catch { /* Browser storage is optional for the demo. */ }
  PACE_DATA.clear(); state.visits = []; state.followUps = {}; state.followUpsSeeded = false; state.adminReviews = {}; state.adminReviewsSeeded = false; state.demoSnapshotLoaded = false; state.activeVisitId = null; state.modalMode = "detail"; state.flagOpen = false; state.noteOpen = false; state.editorDraft = null; state.mutationError = ""; state.mutationNotice = "";
}

async function loadMsalForProduction() {
  if (window.msal) return;
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/@azure/msal-browser@2/lib/msal-browser.min.js";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Microsoft sign-in library could not load."));
    document.head.appendChild(script);
  });
}

async function loadData(force = false) {
  const priorVisits = new Map(state.visits.map(visit => [visit.id, visit]));
  const saved = state.demo && !state.demoSnapshotLoaded ? readDemoSnapshot() : null;
  const savedVisits = new Map((saved?.visits ?? []).filter(visit => visit?.id).map(visit => [visit.id, visit]));
  const result = await PACE_DATA.load(state.range, force); state.visits = result.visits.map(visit => state.demo && (priorVisits.get(visit.id) ?? savedVisits.get(visit.id) ?? visit));
  if (state.demo && !state.followUpsSeeded) { state.followUps = saved?.followUps ?? seedFollowUps(state.visits); state.followUpsSeeded = true; }
  if (state.demo && !state.adminReviewsSeeded) { state.adminReviews = saved?.adminReviews ?? seedAdminReviews(state.visits); state.adminReviewsSeeded = true; }
  state.demoSnapshotLoaded = true; persistDemoSnapshot();
  paint();
}

function adminContext(reason) { return { authorized: state.demo || (APP_ENV === "production" && PRODUCTION_ADMIN_WRITES_ENABLED && AUTH?.isAuthenticated === true && APP_USERS?.isAllowed === true), actor: state.userName || "Demo Administrator", reason, at: new Date().toISOString() }; }

function readEditDraft() {
  const value = id => root.querySelector(`#${id}`)?.value ?? "";
  return { student: value("adminStudent"), date: value("adminDate"), teacherCameFrom: value("adminTeacher"), room: value("adminRoom"), specialists: value("adminSpecialists"), timeIn: value("adminTimeIn"), timeOut: value("adminTimeOut"), reasons: value("adminReasons"), interventions: value("adminInterventions"), scmUsed: root.querySelector("#adminScm")?.value ?? "", notes: value("adminNotesSource"), returnStatus: value("adminReturnStatus") };
}

function captureEditorDraft() {
  const value = id => root.querySelector(`#${id}`)?.value ?? "";
  return {
    edit: readEditDraft(),
    correctionReason: value("adminCorrectionReason"),
    reviewStatus: value("adminReviewStatus"),
    followUpStatus: value("adminFollowUpStatus"),
    followUpAssignedTo: value("adminFollowUpAssignedTo"),
    followUpDueDate: value("adminFollowUpDueDate"),
    noteText: value("adminNoteText"),
    reviewReason: value("adminReviewReason"),
    voidReason: value("adminVoidReason"),
    followUpNote: value("followUpNote")
  };
}

function hasUnsavedEdit(activeVisit) {
  if (!activeVisit || !root.querySelector("#adminStudent")) return false;
  const draft = readEditDraft();
  const baseline = { student: activeVisit.student, date: activeVisit.date, teacherCameFrom: activeVisit.teacherCameFrom, room: activeVisit.room, specialists: activeVisit.specialists.join(", "), timeIn: activeVisit.timeIn, timeOut: activeVisit.timeOut, reasons: activeVisit.reasons.join(", "), interventions: activeVisit.interventions.join(", "), scmUsed: activeVisit.scmUsed === null ? "" : activeVisit.scmUsed ? "true" : "false", notes: activeVisit.notes, returnStatus: activeVisit.returnStatus };
  return Object.keys(baseline).some(key => String(draft[key] ?? "") !== String(baseline[key] ?? "")) || Boolean(root.querySelector("#adminCorrectionReason")?.value.trim());
}

function restoreEditorDraft() {
  if (!state.editorDraft) return;
  const draft = state.editorDraft;
  const values = { ...draft.edit, correctionReason: draft.correctionReason, reviewStatus: draft.reviewStatus, followUpStatus: draft.followUpStatus, followUpAssignedTo: draft.followUpAssignedTo, followUpDueDate: draft.followUpDueDate, noteText: draft.noteText, reviewReason: draft.reviewReason, voidReason: draft.voidReason, followUpNote: draft.followUpNote };
  const ids = { student: "adminStudent", date: "adminDate", teacherCameFrom: "adminTeacher", room: "adminRoom", specialists: "adminSpecialists", timeIn: "adminTimeIn", timeOut: "adminTimeOut", reasons: "adminReasons", interventions: "adminInterventions", scmUsed: "adminScm", notes: "adminNotesSource", returnStatus: "adminReturnStatus", correctionReason: "adminCorrectionReason", reviewStatus: "adminReviewStatus", followUpStatus: "adminFollowUpStatus", followUpAssignedTo: "adminFollowUpAssignedTo", followUpDueDate: "adminFollowUpDueDate", noteText: "adminNoteText", reviewReason: "adminReviewReason", voidReason: "adminVoidReason", followUpNote: "followUpNote" };
  for (const [key, id] of Object.entries(ids)) {
    const control = root.querySelector(`#${id}`);
    if (control && values[key] !== undefined) control.value = values[key];
  }
}

function apiBool(value) { return value === true || ["yes", "true", "1"].includes(String(value ?? "").trim().toLowerCase()); }

function apiReviewEntry(visitId, reviewItem, notes = [], audit = []) {
  const fields = reviewItem?.fields ?? {};
  const status = { Unreviewed: REVIEW_STATUS.UNREVIEWED, Reviewed: REVIEW_STATUS.REVIEWED, "Needs Follow-Up": REVIEW_STATUS.NEEDS_FOLLOW_UP }[fields.ReviewStatus] ?? REVIEW_STATUS.UNREVIEWED;
  const followUpStatus = { Open: "open", "In Progress": "in-progress", Resolved: "resolved" }[fields.FollowUpStatus] ?? "open";
  return { visitId, status, notes: notes.map(item => ({ id: item.id, visitId, text: item.fields?.NoteText ?? "", actor: item.fields?.Actor ?? "", createdAt: item.fields?.CreatedAt ?? "", supersedesNoteId: item.fields?.SupersedesNoteID ?? null })), followUpStatus, followUpAssignedTo: fields.FollowUpAssignedTo ?? "", followUpDueDate: fields.FollowUpDueDate ?? "", isVoided: apiBool(fields.IsVoided), voidReason: fields.VoidReason ?? "", reviewedBy: fields.ReviewedBy ?? null, reviewedAt: fields.ReviewedAt ?? null, sourceVersion: fields.LastReviewedRecordVersion ?? null, version: 1, history: audit.map(item => ({ action: item.fields?.ActionType ?? "Review", actor: item.fields?.Actor ?? "", at: item.fields?.Timestamp ?? "", reason: item.fields?.Reason ?? "" })) };
}

function applyProductionSnapshot(snapshot, history = {}) {
  if (!snapshot?.source?.id) return;
  const source = { id: snapshot.source.id, ...(snapshot.source.fields ?? {}) };
  const visit = normalizeVisit(source);
  state.visits = state.visits.map(item => item.id === visit.id ? visit : item);
  state.adminEtags[visit.id] = snapshot.source.etag ?? state.adminEtags[visit.id] ?? null;
  state.adminReviews[visit.id] = apiReviewEntry(visit.id, snapshot.review, history.notes ?? snapshot.notes ?? [], history.audit ?? []);
}

async function hydrateProductionVisit(visitId) {
  if (state.demo || !ADMIN_API.configured) return;
  const [snapshot, history] = await Promise.all([ADMIN_API.getVisit(visitId), ADMIN_API.getHistory(visitId)]);
  applyProductionSnapshot(snapshot, history);
}

async function handleProductionAction(action, activeVisit) {
  if (!ADMIN_API.writesEnabled) throw new Error("Production administrative writes are disabled pending approved infrastructure configuration.");
  const visitId = activeVisit.id;
  if (!state.adminEtags[visitId]) await hydrateProductionVisit(visitId);
  if (action === ADMIN_MUTATION_ACTIONS.EDIT) {
    const draft = readEditDraft();
    draft.scmUsed = draft.scmUsed === "" ? null : draft.scmUsed === "true";
    await ADMIN_API.edit(visitId, { changes: draft, correctionReason: root.querySelector("#adminCorrectionReason")?.value ?? "", expectedEtag: state.adminEtags[visitId] });
  } else if (action === ADMIN_MUTATION_ACTIONS.REVIEW) {
    const status = root.querySelector("#adminReviewStatus")?.value ?? REVIEW_STATUS.UNREVIEWED;
    const followUpStatus = root.querySelector("#adminFollowUpStatus")?.value ?? "open";
    const reviewStatus = { [REVIEW_STATUS.UNREVIEWED]: "Unreviewed", [REVIEW_STATUS.REVIEWED]: "Reviewed", [REVIEW_STATUS.NEEDS_FOLLOW_UP]: "Needs Follow-Up" }[status] ?? "Unreviewed";
    const graphFollowUpStatus = { open: "Open", "in-progress": "In Progress", resolved: "Resolved" }[followUpStatus] ?? "Open";
    await ADMIN_API.saveReview(visitId, { reviewStatus, followUpNeeded: status === REVIEW_STATUS.NEEDS_FOLLOW_UP, followUpStatus: graphFollowUpStatus, followUpAssignedTo: root.querySelector("#adminFollowUpAssignedTo")?.value ?? "", followUpDueDate: root.querySelector("#adminFollowUpDueDate")?.value ?? "", reason: root.querySelector("#adminReviewReason")?.value ?? "" });
  } else if (action === ADMIN_MUTATION_ACTIONS.MARK_VIEWED) await ADMIN_API.markViewed(visitId);
  else if (action === ADMIN_MUTATION_ACTIONS.ADD_NOTE) await ADMIN_API.addNote(visitId, root.querySelector("#adminNoteText")?.value ?? "");
  else if (action === ADMIN_MUTATION_ACTIONS.VOID) {
    if (!window.confirm("Void this production submission? The original SharePoint record will remain intact.")) return;
    await ADMIN_API.voidVisit(visitId, root.querySelector("#adminVoidReason")?.value ?? "");
  } else if (action === ADMIN_MUTATION_ACTIONS.RESTORE) await ADMIN_API.restoreVisit(visitId);
  await hydrateProductionVisit(visitId);
}

async function boot() {
  root.innerHTML = renderLoading();
  try {
    if (APP_ENV === "invalid") { root.innerHTML = renderError("Admin Hub environment is invalid", "This build was stopped safely. Rebuild with an explicit demo or production environment."); return; }
    if (APP_ENV === "production") {
      await loadMsalForProduction();
      const [{ AUTH: auth }, { GRAPH: graph }, { APP_USERS: appUsers }] = await Promise.all([import("./auth.js"), import("./graph.js"), import("./authorization.js")]);
      AUTH = auth; GRAPH = graph; APP_USERS = appUsers; window.AUTH = AUTH; window.GRAPH = GRAPH;
      await AUTH.init();
      if (!AUTH.account) { root.innerHTML = renderLogin(); return; }
      if (!AUTH.isAuthenticated) { root.innerHTML = renderUnauthorized(AUTH.error || "Your account is not approved for Admin Hub."); return; }
      const decision = await APP_USERS.authorize();
      if (!decision.allowed) { root.innerHTML = renderUnauthorized("Your account is not authorized for Admin Hub.", APP_USERS.error ? "Permission verification failed. Please try again later." : APP_USERS.authorizationNote); return; }
      state.userName = AUTH.displayName;
    } else {
      state.userName = "Demo Administrator";
    }
    await loadData();
  } catch (error) {
    console.error(error); root.innerHTML = renderError("Admin Hub could not load", "We could not load the workspace right now. Check your connection or open demo mode for a local review.");
  }
}

document.addEventListener("click", async event => {
  const modalAction = event.target.closest("[data-modal-action]");
  if (modalAction) {
    const action = modalAction.dataset.modalAction;
    const activeVisit = state.visits.find(item => item.id === state.activeVisitId);
    if (action === "edit") { state.modalMode = "edit"; state.flagOpen = false; state.noteOpen = false; state.editorDraft = null; state.mutationError = ""; state.mutationNotice = ""; paint(); return; }
    if (["review", "flag"].includes(action)) { state.modalMode = "review"; state.flagOpen = false; state.noteOpen = false; state.editorDraft = null; state.mutationError = ""; paint(); return; }
    if (["notes", "add-note"].includes(action)) { state.modalMode = "notes"; state.flagOpen = false; state.noteOpen = false; state.editorDraft = null; state.mutationError = ""; paint(); return; }
    if (action === "history") { state.modalMode = "history"; state.flagOpen = false; state.noteOpen = false; state.editorDraft = null; state.mutationError = ""; paint(); return; }
    if (action === "more") { state.modalMode = "more"; state.flagOpen = false; state.noteOpen = false; state.editorDraft = null; state.mutationError = ""; paint(); return; }
    if (action === "detail") {
      if (state.modalMode === "edit" && hasUnsavedEdit(activeVisit) && !window.confirm("Discard unsaved correction changes?")) return;
      state.modalMode = "detail"; state.editorDraft = null; state.mutationError = ""; paint(); return;
    }
    if (action === "cancel-edit") {
      if (hasUnsavedEdit(activeVisit) && !window.confirm("Discard unsaved correction changes?")) return;
      state.modalMode = "detail"; state.editorDraft = null; state.mutationError = ""; state.mutationNotice = ""; paint(); return;
    }
    if (action === "close-flag") { state.modalMode = "detail"; state.flagOpen = false; state.editorDraft = null; paint(); return; }
    if (action === "close-note") { state.modalMode = "detail"; state.noteOpen = false; state.editorDraft = null; paint(); return; }
  }
  const adminAction = event.target.closest("[data-admin-action]");
  if (adminAction) {
    const activeVisit = state.visits.find(item => item.id === state.activeVisitId);
    if (!activeVisit) return;
    const action = adminAction.dataset.adminAction;
    try {
      if (!state.demo) {
        await handleProductionAction(action, activeVisit);
        state.mutationError = "";
        state.editorDraft = null;
        if (action === ADMIN_MUTATION_ACTIONS.EDIT) { state.modalMode = "detail"; state.mutationNotice = "Correction saved successfully."; }
        paint();
        return;
      }
      if (!state.demo && !PRODUCTION_ADMIN_WRITES_ENABLED) throw new Error("Production administrative writes are disabled pending approval.");
      if (action === ADMIN_MUTATION_ACTIONS.EDIT) {
        const reason = root.querySelector("#adminCorrectionReason")?.value ?? "";
        const result = applyDemoEdit(state.visits, activeVisit.id, readEditDraft(), { ...adminContext(reason), expectedVersion: activeVisit.adminVersion ?? 1 });
        state.visits = result.visits; state.adminReviews = recordDemoEdit(state.adminReviews, activeVisit.id, { ...adminContext(result.reason), at: result.at, fields: result.fields, previous: result.previous, updated: result.visit }); state.mutationError = "";
      } else if (action === ADMIN_MUTATION_ACTIONS.REVIEW) {
        const status = root.querySelector("#adminReviewStatus")?.value ?? "";
        const reviewReason = root.querySelector("#adminReviewReason")?.value ?? "";
        state.adminReviews = saveDemoReview(state.adminReviews, activeVisit.id, { status, followUpStatus: root.querySelector("#adminFollowUpStatus")?.value ?? "open", followUpAssignedTo: root.querySelector("#adminFollowUpAssignedTo")?.value ?? "", followUpDueDate: root.querySelector("#adminFollowUpDueDate")?.value ?? "", reason: reviewReason }, { ...adminContext(reviewReason), sourceVersion: activeVisit.adminVersion ?? 1 });
        state.mutationError = "";
      } else if (action === ADMIN_MUTATION_ACTIONS.MARK_VIEWED) {
        state.adminReviews = markDemoViewed(state.adminReviews, activeVisit.id, { ...adminContext("Marked as viewed"), sourceVersion: activeVisit.adminVersion ?? 1 });
        state.mutationError = "";
      } else if (action === ADMIN_MUTATION_ACTIONS.ADD_NOTE) {
        state.adminReviews = addDemoAdminNote(state.adminReviews, activeVisit.id, root.querySelector("#adminNoteText")?.value ?? "", adminContext("Administrative note added"));
        state.mutationError = "";
      } else if (action === ADMIN_MUTATION_ACTIONS.VOID) {
        const reason = root.querySelector("#adminVoidReason")?.value ?? "";
        if (!window.confirm("Void this synthetic submission? The original demo record will remain intact.")) return;
        state.adminReviews = voidDemoVisit(state.adminReviews, activeVisit.id, adminContext(reason)); state.mutationError = "";
      } else if (action === ADMIN_MUTATION_ACTIONS.RESTORE) {
        state.adminReviews = restoreDemoVisit(state.adminReviews, activeVisit.id, adminContext("Submission restored")); state.mutationError = "";
      } else if (action === "save-flag") {
        const reason = root.querySelector("#adminReviewReason")?.value ?? "";
        const assignedTo = root.querySelector("#adminFollowUpAssignedTo")?.value ?? "";
        const dueDate = root.querySelector("#adminFollowUpDueDate")?.value ?? "";
        state.adminReviews = saveDemoReview(state.adminReviews, activeVisit.id, { status: REVIEW_STATUS.NEEDS_FOLLOW_UP, followUpStatus: "open", followUpAssignedTo: assignedTo, followUpDueDate: dueDate, reason }, { ...adminContext(reason || "Flagged for review"), sourceVersion: activeVisit.adminVersion ?? 1 });
        if (!state.followUps[activeVisit.id]) state.followUps = applyFollowUpAction(state.followUps, activeVisit, "flag", { actor: state.userName || "Demo Administrator", date: localDateString() });
      }
      if (action === ADMIN_MUTATION_ACTIONS.EDIT) { state.modalMode = "detail"; state.mutationNotice = "Correction saved successfully."; }
      if (action === "save-flag") { state.modalMode = "detail"; state.flagOpen = false; state.mutationNotice = "Review flag saved."; }
      if (action === ADMIN_MUTATION_ACTIONS.MARK_VIEWED) state.mutationNotice = "Marked as viewed. Any review flag remains active.";
      if (action === ADMIN_MUTATION_ACTIONS.ADD_NOTE) { state.modalMode = "detail"; state.noteOpen = false; state.mutationNotice = "Administrative note added."; }
      if (action === ADMIN_MUTATION_ACTIONS.VOID) { state.modalMode = "detail"; state.moreOpen = false; state.mutationNotice = "Submission voided; the original record remains preserved."; }
      if (action === ADMIN_MUTATION_ACTIONS.RESTORE) { state.modalMode = "detail"; state.moreOpen = false; state.mutationNotice = "Submission restored."; }
      state.editorDraft = null;
      persistDemoSnapshot();
      paint();
    } catch (error) {
      state.editorDraft = captureEditorDraft();
      state.mutationError = error.message;
      paint();
    }
    return;
  }
  const queueFilter = event.target.closest("[data-review-queue-filter]");
  if (queueFilter) { state.activityFilters.reviewStatus = queueFilter.dataset.reviewQueueFilter; go("pace/activity"); paint(); return; }
  const followUpAction = event.target.closest("[data-follow-up-action]");
  if (followUpAction && state.demo) {
    const activeVisit = state.visits.find(item => item.id === state.activeVisitId);
    if (!activeVisit) return;
    const note = root.querySelector("#followUpNote")?.value ?? "";
    const action = followUpAction.dataset.followUpAction;
    const actor = action === "start-review" ? "Morgan Reed — Behavior Specialist" : "Jordan Ellis — Administrator";
    try { state.followUps = applyFollowUpAction(state.followUps, activeVisit, action, { actor, date: localDateString(), note }); state.modalMode = "detail"; state.editorDraft = null; state.mutationNotice = action === "complete" ? "Follow-up completed." : "Review started."; persistDemoSnapshot(); paint(); } catch (error) { state.editorDraft = captureEditorDraft(); state.mutationError = error.message; paint(); }
    return;
  }
  if (isIntentionalModalDismissal(event.target)) { if (state.modalMode === "edit" && hasUnsavedEdit(state.visits.find(item => item.id === state.activeVisitId)) && !window.confirm("Discard unsaved correction changes?")) return; state.activeVisitId = null; state.modalMode = "detail"; state.flagOpen = false; state.noteOpen = false; state.editorDraft = null; state.mutationError = ""; state.mutationNotice = ""; paint(); return; }
  if (event.target.closest("#resetDemo")) {
    if (!window.confirm("Reset all synthetic demo edits, notes, reviews and follow-up state? This affects only this browser.")) return;
    resetDemoSnapshot(); await loadData(true); return;
  }
  const openVisit = event.target.closest("[data-open-visit]");
  if (openVisit) { state.activeVisitId = openVisit.dataset.openVisit; state.modalMode = "detail"; state.flagOpen = false; state.noteOpen = false; state.editorDraft = null; state.mutationError = ""; state.mutationNotice = ""; paint(); if (!state.demo && ADMIN_API.configured) { try { await hydrateProductionVisit(state.activeVisitId); paint(); } catch (error) { state.editorDraft = captureEditorDraft(); state.mutationError = error.message; paint(); } } return; }
  const visit = event.target.closest("[data-visit]");
  if (visit) { state.activeVisitId = visit.dataset.visit; state.modalMode = "detail"; state.flagOpen = false; state.noteOpen = false; state.editorDraft = null; state.mutationError = ""; state.mutationNotice = ""; paint(); if (!state.demo && ADMIN_API.configured) { try { await hydrateProductionVisit(state.activeVisitId); paint(); } catch (error) { state.editorDraft = captureEditorDraft(); state.mutationError = error.message; paint(); } } return; }
  const student = event.target.closest("[data-student]");
  if (student && !event.target.closest("a")) { go(`pace/students/${encodeURIComponent(student.dataset.student)}`); return; }
  const sort = event.target.closest("[data-sort]");
  if (sort) { state.studentsSort = sort.dataset.sort; paint(); return; }
  if (event.target.closest("#signIn")) { AUTH?.login(); return; }
  if (event.target.closest("#signOut")) { AUTH?.logout(); return; }
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && state.activeVisitId) {
    if (state.modalMode === "edit" && hasUnsavedEdit(state.visits.find(item => item.id === state.activeVisitId)) && !window.confirm("Discard unsaved correction changes?")) return;
    if (state.modalMode === "edit") { state.activeVisitId = null; state.modalMode = "detail"; state.editorDraft = null; state.mutationError = ""; paint(); return; }
    if (state.modalMode !== "detail") { state.modalMode = "detail"; state.editorDraft = null; state.mutationError = ""; paint(); return; }
    state.activeVisitId = null; state.modalMode = "detail"; state.editorDraft = null; paint(); return;
  }
  const viewport = event.target?.closest?.(".trend-chart-viewport");
  if (!viewport || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
  viewport.scrollLeft += event.key === "ArrowRight" ? 120 : -120;
  event.preventDefault();
});

document.addEventListener("change", async event => {
  if (event.target.id === "datePreset" || event.target.id === "rangeFrom" || event.target.id === "rangeTo") {
    const control = event.target.closest(".date-control"); state.range = rangeFromControls(control, state.range); state.activeVisitId = null; state.editorDraft = null; try { await loadData(true); } catch { root.innerHTML = renderError("PACE data could not load", "The date range could not be loaded. Please try again."); } return;
  }
  const filter = event.target.closest("[data-activity-filter]");
  if (filter) { state.activityFilters[filter.dataset.activityFilter] = filter.value; paint(); }
});

document.addEventListener("input", event => {
  if (event.target.id === "studentsSearch") { state.studentsSearch = event.target.value; paint(); }
  const filter = event.target.closest("[data-activity-filter]");
  if (filter && filter.tagName === "INPUT") { state.activityFilters[filter.dataset.activityFilter] = filter.value; paint(); }
});

window.addEventListener("hashchange", () => { state.activeVisitId = null; state.editorDraft = null; paint(); });
boot();

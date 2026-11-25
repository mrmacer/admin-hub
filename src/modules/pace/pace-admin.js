import { calculateDuration } from "./pace-analytics.js";

export const REVIEW_STATUS = {
  UNREVIEWED: "unreviewed",
  REVIEWED: "reviewed",
  NEEDS_FOLLOW_UP: "needs-follow-up"
};

export const REVIEW_STATUS_LABELS = {
  [REVIEW_STATUS.UNREVIEWED]: "Unreviewed",
  [REVIEW_STATUS.REVIEWED]: "Reviewed",
  [REVIEW_STATUS.NEEDS_FOLLOW_UP]: "Needs Follow-Up"
};

export const ADMIN_MUTATION_ACTIONS = {
  EDIT: "edit",
  REVIEW: "review",
  MARK_VIEWED: "mark-viewed",
  ADD_NOTE: "add-note",
  VOID: "void",
  RESTORE: "restore"
};

const EDITABLE_FIELDS = ["student", "date", "teacherCameFrom", "room", "specialists", "timeIn", "timeOut", "reasons", "interventions", "scmUsed", "notes", "returnStatus"];

function copy(value) { return value === undefined ? value : structuredClone(value); }

function now(context = {}) { return context.at ?? new Date().toISOString(); }

function actor(context = {}) {
  if (context.authorized !== true) throw new Error("An authorized administrator is required for this action.");
  const value = String(context.actor ?? "").trim();
  if (!value) throw new Error("An authenticated administrator is required for this action.");
  return value;
}

function reviewEntry(visitId, details = {}) {
  return {
    visitId,
    status: details.status ?? REVIEW_STATUS.UNREVIEWED,
    notes: copy(details.notes ?? []),
    followUpStatus: details.followUpStatus ?? "open",
    followUpAssignedTo: details.followUpAssignedTo ?? "",
    followUpDueDate: details.followUpDueDate ?? "",
    isVoided: details.isVoided === true,
    voidReason: details.voidReason ?? "",
    reviewedBy: details.reviewedBy ?? null,
    reviewedAt: details.reviewedAt ?? null,
    sourceVersion: details.sourceVersion ?? null,
    version: details.version ?? 1,
    history: copy(details.history ?? [])
  };
}

// Synthetic review state is intentionally in memory only. Production review
// storage is not assumed or created until the schema and permissions are approved.
export function seedAdminReviews(visits) {
  const seeded = {};
  const add = (id, details) => { if (visits.some(visit => visit.id === id)) seeded[id] = reviewEntry(id, details); };
  add("demo-001", {
    status: REVIEW_STATUS.REVIEWED,
    notes: [{ id: "demo-note-001", visitId: "demo-001", text: "Synthetic review complete; no production record is connected.", actor: "Jordan Ellis — Administrator", createdAt: "2026-10-03T10:00:00.000Z" }],
    reviewedBy: "Jordan Ellis — Administrator",
    reviewedAt: "2026-10-03T10:00:00.000Z",
    history: [{ action: ADMIN_MUTATION_ACTIONS.REVIEW, actor: "Jordan Ellis — Administrator", at: "2026-10-03T10:00:00.000Z", reason: "Synthetic demo review" }]
  });
  add("demo-002", { status: REVIEW_STATUS.NEEDS_FOLLOW_UP, notes: [{ id: "demo-note-002", visitId: "demo-002", text: "Synthetic follow-up requested.", actor: "Jordan Ellis — Administrator", createdAt: "2026-10-03T11:00:00.000Z" }], followUpStatus: "open", reviewedBy: "Jordan Ellis — Administrator", reviewedAt: "2026-10-03T11:00:00.000Z", sourceVersion: 1 });
  add("demo-003", { isVoided: true, voidReason: "Synthetic duplicate submission", history: [{ action: ADMIN_MUTATION_ACTIONS.VOID, actor: "Jordan Ellis — Administrator", at: "2026-10-03T12:00:00.000Z", reason: "Synthetic duplicate submission" }] });
  return seeded;
}

export function adminReviewFor(reviews, visitId) { return reviews?.[visitId] ?? reviewEntry(visitId); }

export function isVoided(visit, reviews) { return Boolean(visit?.id && reviews?.[visit.id]?.isVoided); }

export function activeVisits(visits, reviews, includeVoided = false) {
  return (visits ?? []).filter(visit => includeVoided || !isVoided(visit, reviews));
}

export function reviewStatusLabel(status) { return REVIEW_STATUS_LABELS[status] ?? REVIEW_STATUS_LABELS[REVIEW_STATUS.UNREVIEWED]; }

export function matchesReviewStatus(visit, reviews, filter = "") {
  const review = adminReviewFor(reviews, visit?.id);
  if (filter === "voided") return review.isVoided;
  if (review.isVoided) return false;
  if (!filter || filter === "all") return true;
  return review.status === filter;
}

export function reviewCounts(visits, reviews) {
  const rows = visits ?? [];
  return {
    unreviewed: rows.filter(visit => matchesReviewStatus(visit, reviews, REVIEW_STATUS.UNREVIEWED)).length,
    reviewed: rows.filter(visit => matchesReviewStatus(visit, reviews, REVIEW_STATUS.REVIEWED)).length,
    needsFollowUp: rows.filter(visit => matchesReviewStatus(visit, reviews, REVIEW_STATUS.NEEDS_FOLLOW_UP)).length,
    voided: rows.filter(visit => matchesReviewStatus(visit, reviews, "voided")).length
  };
}

function listValue(value) {
  if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean);
  return String(value ?? "").split(/[,;]\s*/).map(item => item.trim()).filter(Boolean);
}

export function normalizeEditDraft(draft = {}) {
  return {
    student: String(draft.student ?? "").trim(),
    date: String(draft.date ?? "").trim(),
    teacherCameFrom: String(draft.teacherCameFrom ?? "").trim(),
    room: String(draft.room ?? "").trim(),
    specialists: listValue(draft.specialists),
    timeIn: String(draft.timeIn ?? "").trim(),
    timeOut: String(draft.timeOut ?? "").trim(),
    reasons: listValue(draft.reasons),
    interventions: listValue(draft.interventions),
    scmUsed: draft.scmUsed === "" || draft.scmUsed === null || draft.scmUsed === undefined ? null : Boolean(draft.scmUsed === true || draft.scmUsed === "true" || draft.scmUsed === "yes"),
    notes: String(draft.notes ?? "").trim(),
    returnStatus: String(draft.returnStatus ?? "").trim()
  };
}

export function changedFields(visit, draft) {
  const next = normalizeEditDraft(draft);
  return EDITABLE_FIELDS.filter(field => JSON.stringify(visit?.[field] ?? null) !== JSON.stringify(next[field] ?? null));
}

export function applyDemoEdit(visits, visitId, draft, context = {}) {
  const administrator = actor(context);
  const visit = (visits ?? []).find(row => row.id === visitId);
  if (!visit) throw new Error("The PACE visit could not be found.");
  const expectedVersion = context.expectedVersion;
  const currentVersion = visit.adminVersion ?? 1;
  if (expectedVersion !== undefined && expectedVersion !== currentVersion) throw new Error("This record changed while it was open. Reload it before saving.");
  const correctionReason = String(context.reason ?? "").trim();
  const next = normalizeEditDraft(draft);
  if (!next.student) throw new Error("Student is required.");
  if (!next.reasons.length) throw new Error("At least one reason is required.");
  if (next.timeIn && next.timeOut && calculateDuration(next.timeIn, next.timeOut) === null) throw new Error("Time Out must be at or after Time In.");
  const fields = changedFields(visit, next);
  if (!fields.length) throw new Error("No changes were made.");
  if (!correctionReason) throw new Error("A correction reason is required.");
  const replacement = { ...visit, ...next, durationMinutes: next.timeIn && next.timeOut ? calculateDuration(next.timeIn, next.timeOut) : visit.durationMinutes, adminVersion: currentVersion + 1 };
  const updatedVisits = (visits ?? []).map(row => row.id === visitId ? replacement : row);
  return { visits: updatedVisits, visit: replacement, fields, previous: copy(visit), reason: correctionReason, actor: administrator, at: now(context) };
}

function updateReview(reviews, visitId, update, event) {
  const current = adminReviewFor(reviews, visitId);
  const next = reviewEntry(visitId, { ...current, ...update, version: current.version + 1, history: [...current.history, event] });
  return { ...reviews, [visitId]: next };
}

export function saveDemoReview(reviews, visitId, input = {}, context = {}) {
  const administrator = actor(context);
  if (!Object.values(REVIEW_STATUS).includes(input.status)) throw new Error("Choose a valid review status.");
  const at = now(context);
  const event = { action: ADMIN_MUTATION_ACTIONS.REVIEW, actor: administrator, at, reason: String(input.reason ?? "Review status saved").trim() || "Review status saved" };
  return updateReview(reviews, visitId, { status: input.status, followUpStatus: String(input.followUpStatus ?? "open"), followUpAssignedTo: String(input.followUpAssignedTo ?? "").trim(), followUpDueDate: String(input.followUpDueDate ?? "").trim(), reviewedBy: administrator, reviewedAt: at, sourceVersion: context.sourceVersion ?? adminReviewFor(reviews, visitId).sourceVersion }, event);
}

export function markDemoViewed(reviews, visitId, context = {}) {
  const administrator = actor(context); const at = now(context); const current = adminReviewFor(reviews, visitId);
  return updateReview(reviews, visitId, {
    status: REVIEW_STATUS.REVIEWED,
    followUpStatus: current.followUpStatus,
    followUpAssignedTo: current.followUpAssignedTo,
    followUpDueDate: current.followUpDueDate,
    reviewedBy: administrator,
    reviewedAt: at,
    sourceVersion: context.sourceVersion ?? current.sourceVersion
  }, { action: ADMIN_MUTATION_ACTIONS.MARK_VIEWED, actor: administrator, at, reason: "Marked as viewed" });
}

export function recordDemoEdit(reviews, visitId, context = {}) {
  const administrator = actor(context); const at = now(context);
  return updateReview(reviews, visitId, {}, { action: ADMIN_MUTATION_ACTIONS.EDIT, actor: administrator, at, reason: String(context.reason ?? "Synthetic correction").trim() || "Synthetic correction" });
}

export function adminNotesFor(reviews, visitId) { return copy(adminReviewFor(reviews, visitId).notes ?? []); }

export function addDemoAdminNote(reviews, visitId, text, context = {}) {
  const administrator = actor(context); const value = String(text ?? "").trim();
  if (!value) throw new Error("Administrative note text is required.");
  const at = now(context); const current = adminReviewFor(reviews, visitId);
  const note = { id: String(context.noteId ?? `demo-note-${visitId}-${at}`), visitId, text: value, actor: administrator, createdAt: at, supersedesNoteId: context.supersedesNoteId ?? null };
  return updateReview(reviews, visitId, { notes: [...(current.notes ?? []), note] }, { action: ADMIN_MUTATION_ACTIONS.ADD_NOTE, actor: administrator, at, reason: "Administrative note added", noteId: note.id });
}

export function voidDemoVisit(reviews, visitId, context = {}) {
  const administrator = actor(context); const reason = String(context.reason ?? "").trim();
  if (!reason) throw new Error("A void reason is required.");
  const at = now(context);
  return updateReview(reviews, visitId, { isVoided: true, voidReason: reason }, { action: ADMIN_MUTATION_ACTIONS.VOID, actor: administrator, at, reason });
}

export function restoreDemoVisit(reviews, visitId, context = {}) {
  const administrator = actor(context); const at = now(context);
  return updateReview(reviews, visitId, { isVoided: false, voidReason: "" }, { action: ADMIN_MUTATION_ACTIONS.RESTORE, actor: administrator, at, reason: "Submission restored" });
}

export function adminHistoryFor(reviews, visitId) { return adminReviewFor(reviews, visitId).history ?? []; }

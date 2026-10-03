import { localDateString } from "../../date-utils.js";

export const FOLLOW_UP_STATUS = {
  NEEDS_REVIEW: "needs-review",
  IN_REVIEW: "in-review",
  COMPLETE: "complete"
};

export const FOLLOW_UP_STATUS_LABELS = {
  [FOLLOW_UP_STATUS.NEEDS_REVIEW]: "Needs Review",
  [FOLLOW_UP_STATUS.IN_REVIEW]: "In Review",
  [FOLLOW_UP_STATUS.COMPLETE]: "Follow-Up Complete"
};

const DEMO_ADMIN = "Jordan Ellis — Administrator";
const DEMO_SPECIALIST = "Morgan Reed — Behavior Specialist";

function timestamp(date, hour) { return `${date}T${hour}:00`; }

function record(visit, status, details) {
  return {
    visitId: visit.id,
    status,
    flaggedBy: details.flaggedBy ?? DEMO_ADMIN,
    flaggedAt: details.flaggedAt,
    reviewedBy: details.reviewedBy ?? null,
    reviewedAt: details.reviewedAt ?? null,
    followUpNote: details.followUpNote ?? "",
    completedBy: details.completedBy ?? null,
    completedAt: details.completedAt ?? null
  };
}

// Follow-up is deliberately a separate in-memory demo layer. It is keyed by
// the immutable PACE visit id and never added to, or written back to, a visit.
export function seedFollowUps(visits, today = localDateString()) {
  const byId = id => visits.find(visit => visit.id === id);
  const seeded = {};
  const needsReview = ["demo-002", "demo-017", "demo-032", "demo-047", "demo-062", "demo-077"];
  const inReview = ["demo-003", "demo-092", "demo-107"];
  const complete = ["demo-001", "demo-122", "demo-137", "demo-152", "demo-167", "demo-176", "demo-178"];

  needsReview.map(byId).filter(Boolean).forEach((visit, index) => {
    seeded[visit.id] = record(visit, FOLLOW_UP_STATUS.NEEDS_REVIEW, {
      flaggedAt: timestamp(today, `0${9 + (index % 2)}`)
    });
  });
  inReview.map(byId).filter(Boolean).forEach((visit, index) => {
    seeded[visit.id] = record(visit, FOLLOW_UP_STATUS.IN_REVIEW, {
      flaggedAt: timestamp(today, "09"),
      reviewedBy: DEMO_SPECIALIST,
      reviewedAt: timestamp(today, `1${index + 0}`),
      followUpNote: "Demo review started; classroom context still being gathered."
    });
  });
  complete.map(byId).filter(Boolean).forEach((visit, index) => {
    seeded[visit.id] = record(visit, FOLLOW_UP_STATUS.COMPLETE, {
      flaggedAt: timestamp(today, "09"),
      reviewedBy: DEMO_SPECIALIST,
      reviewedAt: timestamp(today, "10"),
      followUpNote: index % 2 ? "Demo follow-up documented with the classroom team." : "Demo follow-up completed and next check-in noted.",
      completedBy: DEMO_ADMIN,
      completedAt: timestamp(today, "14")
    });
  });
  return seeded;
}

export function followUpFor(followUps, visitId) { return followUps?.[visitId] ?? null; }

export function followUpStatusLabel(status) { return FOLLOW_UP_STATUS_LABELS[status] ?? "No Follow-Up"; }

export function followUpEntries(visits, followUps) {
  return (visits ?? []).map(visit => ({ visit, followUp: followUpFor(followUps, visit.id) })).filter(entry => entry.followUp);
}

export function followUpCounts(visits, followUps) {
  const entries = followUpEntries(visits, followUps);
  return {
    needsReview: entries.filter(entry => entry.followUp.status === FOLLOW_UP_STATUS.NEEDS_REVIEW).length,
    inReview: entries.filter(entry => entry.followUp.status === FOLLOW_UP_STATUS.IN_REVIEW).length,
    complete: entries.filter(entry => entry.followUp.status === FOLLOW_UP_STATUS.COMPLETE).length,
    total: entries.length
  };
}

export function matchesFollowUpStatus(visit, followUps, filter) {
  if (!filter || filter === "all") return true;
  const followUp = followUpFor(followUps, visit.id);
  if (filter === "none") return !followUp;
  return followUp?.status === filter;
}

export function applyFollowUpAction(followUps, visit, action, context = {}) {
  if (!visit?.id) throw new Error("A PACE visit is required for follow-up.");
  const current = followUpFor(followUps, visit.id);
  const today = context.date ?? localDateString();
  const actor = context.actor ?? DEMO_ADMIN;
  const next = { ...(followUps ?? {}) };
  if (action === "flag" && !current) {
    next[visit.id] = record(visit, FOLLOW_UP_STATUS.NEEDS_REVIEW, { flaggedBy: actor, flaggedAt: timestamp(today, "09") });
    return next;
  }
  if (action === "start-review" && current?.status === FOLLOW_UP_STATUS.NEEDS_REVIEW) {
    next[visit.id] = { ...current, status: FOLLOW_UP_STATUS.IN_REVIEW, reviewedBy: actor, reviewedAt: timestamp(today, "10") };
    return next;
  }
  if (action === "complete" && current?.status === FOLLOW_UP_STATUS.IN_REVIEW) {
    next[visit.id] = {
      ...current,
      status: FOLLOW_UP_STATUS.COMPLETE,
      followUpNote: String(context.note ?? current.followUpNote ?? "").trim(),
      completedBy: actor,
      completedAt: timestamp(today, "14")
    };
    return next;
  }
  throw new Error(`Cannot apply follow-up action: ${action}`);
}

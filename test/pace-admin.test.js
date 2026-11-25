import test from "node:test";
import assert from "node:assert/strict";
import { makeDemoVisits } from "../src/demo-data.js";
import { normalizeVisit } from "../src/modules/pace/pace-analytics.js";
import { ADMIN_MUTATION_ACTIONS, REVIEW_STATUS, activeVisits, adminHistoryFor, applyDemoEdit, markDemoViewed, matchesReviewStatus, recordDemoEdit, reviewCounts, restoreDemoVisit, saveDemoReview, seedAdminReviews, voidDemoVisit } from "../src/modules/pace/pace-admin.js";
import { PRODUCTION_ADMIN_WRITES_ENABLED } from "../src/config.js";

const visits = makeDemoVisits("2026-10-03").map(normalizeVisit);
const context = (reason = "Synthetic test correction") => ({ authorized: true, actor: "Jordan Ellis — Administrator", reason, at: "2026-10-03T12:00:00.000Z" });

test("production administrative mutation gate is fail-closed", () => {
  assert.equal(PRODUCTION_ADMIN_WRITES_ENABLED, false);
});

test("authorized demo administrator can edit supported fields and duration recalculates", () => {
  const visit = visits[0];
  const result = applyDemoEdit(visits, visit.id, { ...visit, timeIn: "07:59", timeOut: "08:45", reasons: ["Corrected reason"] }, { ...context(), expectedVersion: 1 });
  assert.equal(result.visit.durationMinutes, 46);
  assert.deepEqual(result.fields.sort(), ["reasons", "timeIn", "timeOut"].sort());
  assert.equal(result.visit.id, visit.id);
  assert.equal(result.previous.notes, visit.notes);
});

test("unauthorized edits, missing reasons, invalid times and stale edits are rejected", () => {
  const visit = visits[0];
  assert.throws(() => applyDemoEdit(visits, visit.id, visit, { authorized: false, actor: "", reason: "x" }), /authorized administrator/);
  assert.throws(() => applyDemoEdit(visits, visit.id, { ...visit, reasons: [] }, context()), /reason is required/);
  assert.throws(() => applyDemoEdit(visits, visit.id, { ...visit, timeIn: "10:00", timeOut: "09:00" }, context()), /Time Out/);
  const changed = applyDemoEdit(visits, visit.id, { ...visit, room: "PACE Room X" }, { ...context(), expectedVersion: 1 });
  assert.throws(() => applyDemoEdit(changed.visits, visit.id, { ...changed.visit, room: "PACE Room Y" }, { ...context(), expectedVersion: 1 }), /changed while it was open/);
});

test("review notes are independent from original PACE notes and record actor/time", () => {
  const initial = seedAdminReviews(visits);
  const visit = visits.find(row => !initial[row.id]);
  const next = saveDemoReview(initial, visit.id, { status: REVIEW_STATUS.REVIEWED, adminNotes: "Independent administrative note.", reason: "Synthetic review" }, context("Synthetic review"));
  assert.equal(next[visit.id].adminNotes, "Independent administrative note.");
  assert.equal(next[visit.id].reviewedBy, "Jordan Ellis — Administrator");
  assert.equal(next[visit.id].reviewedAt, "2026-10-03T12:00:00.000Z");
  assert.notEqual(next[visit.id].adminNotes, visit.notes);
  assert.equal(adminHistoryFor(next, visit.id).at(-1).action, ADMIN_MUTATION_ACTIONS.REVIEW);
});

test("mark as viewed is a simple explicit action that preserves separate review notes", () => {
  const initial = seedAdminReviews(visits); const visit = visits.find(row => !initial[row.id]);
  const withNote = saveDemoReview(initial, visit.id, { status: REVIEW_STATUS.NEEDS_FOLLOW_UP, adminNotes: "Keep this separate.", reason: "Synthetic follow-up" }, context("Synthetic follow-up"));
  const viewed = markDemoViewed(withNote, visit.id, context("Marked as viewed"));
  assert.equal(viewed[visit.id].status, REVIEW_STATUS.REVIEWED);
  assert.equal(viewed[visit.id].adminNotes, "Keep this separate.");
  assert.equal(adminHistoryFor(viewed, visit.id).at(-1).action, ADMIN_MUTATION_ACTIONS.MARK_VIEWED);
});

test("editing a synthetic submission records the correction in administrative history", () => {
  const initial = seedAdminReviews(visits); const visit = visits.find(row => !initial[row.id]);
  const edited = applyDemoEdit(visits, visit.id, { ...visit, timeIn: "09:00", timeOut: "09:20" }, { ...context("Synthetic timing correction"), expectedVersion: visit.adminVersion ?? 1 });
  const next = recordDemoEdit(initial, visit.id, { ...context(edited.reason), at: edited.at });
  assert.equal(adminHistoryFor(next, visit.id).at(-1).action, ADMIN_MUTATION_ACTIONS.EDIT);
  assert.equal(adminHistoryFor(next, visit.id).at(-1).reason, "Synthetic timing correction");
});

test("void and restore preserve the original record and stable id", () => {
  const initial = seedAdminReviews(visits); const visit = visits.find(row => row.id === "demo-004");
  const voided = voidDemoVisit(initial, visit.id, context("Duplicate synthetic submission"));
  assert.equal(activeVisits(visits, voided).some(row => row.id === visit.id), false);
  assert.equal(visit.id, "demo-004");
  assert.equal(voided[visit.id].isVoided, true);
  assert.throws(() => voidDemoVisit(initial, visit.id, context("")), /void reason/);
  const restored = restoreDemoVisit(voided, visit.id, context("Restore synthetic submission"));
  assert.equal(restored[visit.id].isVoided, false);
  assert.equal(adminHistoryFor(restored, visit.id).at(-1).action, ADMIN_MUTATION_ACTIONS.RESTORE);
});

test("review queue counts and filters respect active, reviewed, follow-up and voided states", () => {
  const reviews = seedAdminReviews(visits); const counts = reviewCounts(visits.slice(0, 3), reviews);
  assert.deepEqual(counts, { unreviewed: 0, reviewed: 1, needsFollowUp: 1, voided: 1 });
  assert.equal(matchesReviewStatus(visits[0], reviews, REVIEW_STATUS.REVIEWED), true);
  assert.equal(matchesReviewStatus(visits[2], reviews, "voided"), true);
  assert.equal(matchesReviewStatus(visits[2], reviews, ""), false);
});

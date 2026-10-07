import test from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../src/config.js";
import { dateRangeForPreset } from "../src/date-utils.js";
import { normalizeVisit } from "../src/modules/pace/pace-analytics.js";
import { renderActivity, renderHome, renderOverview, renderStudentDetail } from "../src/modules/pace/pace-views.js";
import { FOLLOW_UP_STATUS, applyFollowUpAction, followUpCounts, matchesFollowUpStatus } from "../src/modules/pace/pace-follow-up.js";

const visits = [
  { id: "1", Student: "Alex", Date: "2026-10-03", "Time In": "08:00", "Time Out": "08:30", Duration: 30, Room: "PACE Room 1", Reason: "Break", "Intervention Used": "Calm space", "SCM Used": false, Notes: "Plan reviewed." },
  { id: "2", Student: "Alex", Date: "2026-10-02", "Time In": "10:00", "Time Out": "10:20", Duration: 20, Room: "PACE Room 2", Reason: "Transition", "Intervention Used": "Check-in", "SCM Used": true },
  { id: "3", Student: "Blair", Date: "2026-10-01", "Time In": "09:00", "Time Out": "09:15", Duration: 15, Room: "PACE Room 1", Reason: "Regulation", "Intervention Used": "Break / reset", "SCM Used": false }
].map(normalizeVisit);
const range = dateRangeForPreset("90", "2026-10-03");
const admin = "Administrator";
const specialist = "Behavior Specialist";
const flagged = applyFollowUpAction({}, visits[0], "flag", { actor: admin, date: "2026-10-03" });

test("follow-up stays off until its SharePoint list exists", () => {
  assert.equal(CONFIG.followUp.enabled, false);
  const overview = renderOverview(visits, range, {}, null);
  assert.doesNotMatch(overview, /Needs Review/);
  const modal = renderStudentDetail(visits, range, "Alex", {}, visits[0]);
  assert.match(modal, /not yet connected to SharePoint/);
  assert.doesNotMatch(modal, /data-follow-up-action/);
});

test("PACE is the only visible product focus", () => {
  const home = renderHome();
  assert.match(home, /PACE Admin Dashboard/);
  assert.doesNotMatch(home, /Discipline|Student Support|Coming Soon/);
  const overview = renderOverview(visits, range, flagged, null, true);
  assert.match(overview, /Follow-Up/);
  assert.match(overview, /Needs Review/);
});

test("a default PACE visit has no follow-up and flagging does not mutate it", () => {
  const visit = visits[1];
  const original = structuredClone(visit);
  assert.equal(flagged[visit.id], undefined);
  const next = applyFollowUpAction(flagged, visit, "flag", { actor: admin, date: "2026-10-03" });
  assert.deepEqual(visit, original);
  assert.equal(next[visit.id].status, FOLLOW_UP_STATUS.NEEDS_REVIEW);
  assert.equal(next[visit.id].flaggedBy, admin);
  assert.equal(next[visit.id].followUpNote, "");
});

test("Needs Review → In Review → Follow-Up Complete stays separate from PACE Notes", () => {
  const visit = visits[0];
  const original = structuredClone(visit);
  const reviewing = applyFollowUpAction(flagged, visit, "start-review", { actor: specialist, date: "2026-10-03" });
  const complete = applyFollowUpAction(reviewing, visit, "complete", { actor: admin, date: "2026-10-03", note: "Separate follow-up note." });
  assert.equal(complete[visit.id].status, FOLLOW_UP_STATUS.COMPLETE);
  assert.equal(complete[visit.id].reviewedBy, specialist);
  assert.equal(complete[visit.id].followUpNote, "Separate follow-up note.");
  assert.notEqual(complete[visit.id].followUpNote, visit.notes);
  assert.deepEqual(visit, original);
  assert.deepEqual(followUpCounts(visits, complete), { needsReview: 0, inReview: 0, complete: 1, total: 1 });
});

test("activity filter and student history expose event-level follow-up state", () => {
  const needsVisit = visits[0];
  assert.equal(matchesFollowUpStatus(needsVisit, flagged, "needs-review"), true);
  assert.equal(matchesFollowUpStatus(needsVisit, flagged, "none"), false);
  const activity = renderActivity(visits, range, { followUps: flagged, followUpEnabled: true, activityFilters: { followUpStatus: "needs-review" } }, null);
  assert.match(activity, /Follow-Up Status/);
  assert.match(activity, /Needs Review/);
  assert.equal((activity.match(/data-visit="/g) ?? []).length, 1);
  const history = renderStudentDetail(visits, range, needsVisit.student, flagged, null, true);
  assert.match(history, /Needs Review/);
});

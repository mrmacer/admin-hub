import test from "node:test";
import assert from "node:assert/strict";
import { dateRangeForPreset } from "../src/date-utils.js";
import { makeDemoVisits } from "../src/demo-data.js";
import { normalizeVisit } from "../src/modules/pace/pace-analytics.js";
import { renderActivity, renderHome, renderOverview, renderStudentDetail } from "../src/modules/pace/pace-views.js";
import { FOLLOW_UP_STATUS, applyFollowUpAction, followUpCounts, matchesFollowUpStatus, seedFollowUps } from "../src/modules/pace/pace-follow-up.js";

const raw = makeDemoVisits("2026-10-03");
const visits = raw.map(normalizeVisit);
const followUps = seedFollowUps(visits, "2026-10-03");
const range = dateRangeForPreset("90", "2026-10-03");

test("PACE is the only visible product focus", () => {
  const home = renderHome();
  assert.match(home, /PACE Admin Dashboard/);
  assert.doesNotMatch(home, /Discipline|Student Support|Coming Soon/);
  const overview = renderOverview(visits, range, followUps, null, true);
  assert.match(overview, /Follow-Up/);
  assert.match(overview, /Needs Review/);
});
test("seeded follow-up examples are a small minority of synthetic visits", () => {
  const counts = followUpCounts(visits, followUps);
  assert.deepEqual(counts, { needsReview: 6, inReview: 3, complete: 7, total: 16 });
  assert.equal(visits.length, 184);
  assert.equal(visits.length - counts.total, 168);
  assert.ok(Object.values(followUps).every(item => item.flaggedBy.includes("Demo") || item.flaggedBy.includes("Jordan")));
  assert.ok(Object.values(followUps).every(item => !/Melissa|Macer|Greg/i.test(JSON.stringify(item))));
});

test("a default PACE visit has no follow-up and flagging does not mutate it", () => {
  const visit = visits.find(item => !followUps[item.id]);
  const original = structuredClone(visit);
  assert.equal(followUps[visit.id], undefined);
  const next = applyFollowUpAction(followUps, visit, "flag", { actor: "Jordan Ellis — Administrator", date: "2026-10-03" });
  assert.deepEqual(visit, original);
  assert.equal(next[visit.id].status, FOLLOW_UP_STATUS.NEEDS_REVIEW);
  assert.equal(next[visit.id].followUpNote, "");
});

test("Needs Review → In Review → Follow-Up Complete stays separate from PACE Notes", () => {
  const visit = visits.find(item => !followUps[item.id]);
  const original = structuredClone(visit);
  const flagged = applyFollowUpAction(followUps, visit, "flag", { actor: "Jordan Ellis — Administrator", date: "2026-10-03" });
  const reviewing = applyFollowUpAction(flagged, visit, "start-review", { actor: "Morgan Reed — Behavior Specialist", date: "2026-10-03" });
  const complete = applyFollowUpAction(reviewing, visit, "complete", { actor: "Jordan Ellis — Administrator", date: "2026-10-03", note: "Separate demo follow-up note." });
  assert.equal(complete[visit.id].status, FOLLOW_UP_STATUS.COMPLETE);
  assert.equal(complete[visit.id].followUpNote, "Separate demo follow-up note.");
  assert.notEqual(complete[visit.id].followUpNote, visit.notes);
  assert.deepEqual(visit, original);
  assert.equal(followUpCounts([visit], complete).complete, 1);
});

test("activity filter and student history expose event-level follow-up state", () => {
  const needsVisit = visits.find(visit => followUps[visit.id]?.status === FOLLOW_UP_STATUS.NEEDS_REVIEW);
  assert.equal(matchesFollowUpStatus(needsVisit, followUps, "needs-review"), true);
  assert.equal(matchesFollowUpStatus(needsVisit, followUps, "none"), false);
  const activity = renderActivity(visits, range, { followUps, demo: true, activityFilters: { followUpStatus: "needs-review" } }, null);
  assert.match(activity, /Follow-Up Status/);
  assert.match(activity, /Needs Review/);
  assert.equal((activity.match(/data-visit="/g) ?? []).length, 6);
  const student = needsVisit.student;
  const history = renderStudentDetail(visits, range, student, followUps, null, true);
  assert.match(history, /Needs Review|In Review|Follow-Up Complete/);
});

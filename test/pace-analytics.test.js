import test from "node:test";
import assert from "node:assert/strict";
import { aggregateStudents, calculateAverageDuration, calculateSCMCount, calculateUniqueStudents, calculateVisitCount, filterVisits, groupVisitsByDate, normalizeVisit } from "../src/modules/pace/pace-analytics.js";

const rows = [
  { id: "1", Student: "Alex", Date: "2026-10-01T04:00:00Z", "Time In": "08:00", "Time Out": "08:30", Duration: 30, Reason: "Break", "Intervention Used": "Calm space", "SCM Used": true },
  { id: "2", Student: "Alex", Date: "2026-10-01", "Time In": "10:00", "Time Out": "10:10", Duration: 10, Reason: "Break", "Intervention Used": "Check-in", "SCM Used": false },
  { id: "3", Student: "Blair", Date: "2026-09-30", "Time In": "09:00", "Time Out": "", Reason: "Transition", "SCM Used": "" }
].map(normalizeVisit);

test("PACE metrics count completed visits and unique students", () => {
  assert.equal(calculateVisitCount(rows), 2);
  assert.equal(calculateUniqueStudents(rows), 1);
  assert.equal(calculateAverageDuration(rows), 20);
  assert.equal(calculateSCMCount(rows), 1);
});

test("date filtering and grouping are date-only and stable", () => {
  const selected = filterVisits(rows, { from: "2026-10-01", to: "2026-10-01" });
  assert.equal(selected.length, 2);
  assert.deepEqual(groupVisitsByDate(selected), [{ label: "2026-10-01", count: 2 }]);
});

test("student aggregation preserves total and average duration", () => {
  assert.deepEqual(aggregateStudents(rows), [{ student: "Alex", visits: 2, totalMinutes: 40, durationCount: 2, scmEvents: 1, lastVisit: "2026-10-01", averageDuration: 20 }]);
});

test("malformed partial rows are safe and duration can be derived", () => {
  const visit = normalizeVisit({ id: 7, Student: "Casey", Date: "2026-10-01", "Time In": "13:10", "Time Out": "13:35" });
  assert.equal(visit.durationMinutes, 25);
  assert.equal(visit.scmUsed, null);
  assert.deepEqual(normalizeVisit({}), { id: "", student: "", date: "", timeIn: "", timeOut: "", durationMinutes: null, room: "", specialists: [], teacherCameFrom: "", reasons: [], interventions: [], scmUsed: null, notes: "", submittedAt: "", isCompleted: false });
});

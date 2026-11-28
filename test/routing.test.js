import test from "node:test";
import assert from "node:assert/strict";

global.window = { location: { hash: "#/pace" } };
const { currentRoute } = await import("../src/router.js");

test("routing covers Home, PACE, Students, Student Detail and Activity Log", () => {
  const paths = [
    ["#/home", "home"], ["#/pace", "pace"], ["#/pace/students", "students"], ["#/pace/students/Alex%20P.", "student-detail"], ["#/pace/activity", "activity"],
    ["#/roster/students", "roster-students"], ["#/roster", "roster-students"], ["#/roster/teachers", "roster-teachers"]
  ];
  for (const [hash, page] of paths) { window.location.hash = hash; assert.equal(currentRoute().page, page); }
});

test("routing covers directory overviews and stable record detail pages", () => {
  window.location.hash = "#/roster/students/demo-student-demo-student-01";
  assert.deepEqual(currentRoute(), { page: "roster-student-detail", id: "demo-student-demo-student-01" });
  window.location.hash = "#/roster/staff/demo-staff-specialist-a-example-test";
  assert.deepEqual(currentRoute(), { page: "roster-staff-detail", id: "demo-staff-specialist-a-example-test" });
});

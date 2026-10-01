import test from "node:test";
import assert from "node:assert/strict";

global.window = { location: { hash: "#/pace" } };
const { currentRoute } = await import("../src/router.js");

test("routing covers Home, PACE, Students, Student Detail and Activity Log", () => {
  const paths = [
    ["#/home", "home"], ["#/pace", "pace"], ["#/pace/students", "students"], ["#/pace/students/Alex%20P.", "student-detail"], ["#/pace/activity", "activity"]
  ];
  for (const [hash, page] of paths) { window.location.hash = hash; assert.equal(currentRoute().page, page); }
});

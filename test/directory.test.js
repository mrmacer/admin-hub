import test from "node:test";
import assert from "node:assert/strict";
import { createDemoDirectory, addDirectoryRecord, normalizeDirectory, recordDirectoryChange, directoryCounts } from "../src/modules/directory/directory-data.js";
import { renderDirectory } from "../src/modules/directory/directory-views.js";
import { stableDirectoryId, studentDuplicateMatches, staffDuplicateMatches, validateStaffDraft, validateStudentDraft } from "../src/modules/directory/directory-model.js";

const visits = [
  { id: "visit-1", student: "Demo Student 01", teacherCameFrom: "Classroom Alpha", date: "2026-11-01", timeIn: "09:00", specialists: ["Specialist A"], reasons: ["Break request"], room: "PACE Room 1" },
  { id: "visit-2", student: "Demo Student 02", teacherCameFrom: "Classroom Beta", date: "2026-11-01", timeIn: "10:00", specialists: ["Specialist B"], reasons: ["Transition support"], room: "PACE Room 2" }
];

test("synthetic directory seeds from PACE names and preserves stable identifiers", () => {
  const directory = createDemoDirectory(visits);
  assert.deepEqual(directory.students.map(item => item.name), ["Demo Student 01", "Demo Student 02"]);
  assert.equal(directory.students[0].id, stableDirectoryId("student", "Demo Student 01"));
  assert.equal(directory.students[0].classroom, "Classroom Alpha");
  assert.equal(directory.staff.length, 7);
  assert.equal(directoryCounts(directory).students.total, 2);
});

test("directory migration keeps existing records and supplies deterministic history ids", () => {
  const migrated = normalizeDirectory({ students: [{ id: "student-1", name: "Existing Student", history: [{ action: "Created" }] }], staff: [] }, visits);
  assert.equal(migrated.students[0].name, "Existing Student");
  assert.equal(migrated.students[0].history[0].id, "history-0");
  assert.equal(migrated.staff.length, 7);
  const legacy = normalizeDirectory({ students: [{ id: "student-2", name: "Legacy Student" }], staff: [] }, visits);
  assert.equal(legacy.students[0].history[0].id, "history-created");
});

test("directory validation and duplicate checks protect required identity fields", () => {
  assert.deepEqual(validateStudentDraft({ firstName: "", lastName: "" }).errors, ["First name is required.", "Last name is required."]);
  assert.match(validateStaffDraft({ name: "Staff", email: "bad", roles: [] }).errors.join(" "), /valid email|at least one/);
  const directory = createDemoDirectory(visits);
  assert.equal(studentDuplicateMatches(directory.students, " demo   student 01 ").length, 1);
  assert.equal(staffDuplicateMatches(directory.staff, "SPECIALIST.A@EXAMPLE.TEST").length, 1);
});

test("directory edits, lifecycle changes and additions append history without changing PACE visits", () => {
  const directory = createDemoDirectory(visits);
  const originalVisit = JSON.stringify(visits);
  const student = directory.students[0];
  const edited = recordDirectoryChange(directory, "student", student.id, { action: "Updated", reason: "Roster correction", previous: { classroom: "Classroom Alpha" }, current: { classroom: "Classroom Gamma" } });
  const deactivated = recordDirectoryChange(edited, "student", student.id, { action: "Deactivated", reason: "No longer active", current: { active: false } });
  const added = addDirectoryRecord(deactivated, "staff", { name: "Demo Coordinator", email: "coordinator@example.test", roles: ["Teacher"], active: true, classroom: "Classroom Alpha", program: "Student Services" });
  assert.equal(added.students[0].classroom, "Classroom Gamma");
  assert.equal(added.students[0].active, false);
  assert.equal(added.students[0].history.length, 3);
  assert.equal(added.staff.length, 8);
  assert.equal(JSON.stringify(visits), originalVisit);
});

test("directory views expose synthetic workflows and a production guard", () => {
  const directory = createDemoDirectory(visits);
  const ui = { search: "", status: "", role: "", sortField: "name", sortDirection: "asc", task: null, draft: null, notice: null, duplicate: "", allowDuplicate: false };
  const students = renderDirectory({ page: "roster-students" }, directory, visits, ui, true);
  const studentProfile = renderDirectory({ page: "roster-student-detail", id: directory.students[0].id }, directory, visits, ui, true);
  const staff = renderDirectory({ page: "roster-teachers" }, directory, visits, ui, true);
  assert.match(students, /Student Roster/);
  assert.match(students, /data-directory-action="open-add-student"/);
  assert.match(studentProfile, /Directory change history/);
  assert.match(staff, /Teachers &amp; Staff overview/);
  assert.match(renderDirectory({ page: "roster-students" }, directory, visits, ui, false), /synthetic demo only/);
});

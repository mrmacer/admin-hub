import test from "node:test";
import assert from "node:assert/strict";
import { GRAPH, buildSchema, encodeField } from "../src/graph.js";
import { ROSTER } from "../src/modules/roster/roster-data.js";
import { findDuplicateStudents, normalizeStaff, normalizeStudent, teacherOptions } from "../src/modules/roster/roster-model.js";

const text = (name, displayName, extra = {}) => ({ name, displayName, text: { maxLength: 255 }, ...extra });
const choice = (name, displayName, choices, extra = {}) => ({ name, displayName, choice: { choices, displayAs: "dropDownMenu" }, ...extra });
const COLUMNS = {
  stu: [text("Title", "Student First Name"), { name: "LinkTitle", displayName: "Student First Name", readOnly: true }, text("field_2", "Student Last Name"), text("Teacher", "Teacher"), text("Classroom", "Classroom"), { name: "Active", displayName: "Active", boolean: {} }, choice("PACE", "PACE Enabled", ["Yes", "No"]), text("Pulse", "Daily Pulse Enabled")],
  usr: [text("Title", "Title"), text("field_1", "Name"), choice("field_2", "Role", ["Administrator", "Teacher"]), choice("field_3", "Active", ["Yes", "No"]), text("Email", "Email")]
};

// A fake IEP_Skook site. `onSend` can replace what a POST does.
function fakeSite({ onSend } = {}) {
  const items = { stu: [{ id: "1", fields: { Title: "Amy", field_2: "Ruiz", Teacher: "Bossons, A", Active: true, PACE: "Yes", Pulse: "No" } }], usr: [{ id: "7", fields: { Title: "teacher-bossons", field_1: "Bossons, Amber", field_2: "Teacher", field_3: "Yes", Email: "bossa@iu29.org" } }, { id: "8", fields: { field_1: "Lead, Pat", field_2: "Administrator", field_3: "Yes", Email: "leadp@iu29.org" } }] };
  const sent = [];
  const graph = { ...GRAPH, siteIds: new Map(), lists: new Map(), schemas: new Map(), columns: new Map(), sent, items,
    async get(path) {
      if (!path.includes("/lists")) return { id: "site" };
      if (path.endsWith("$select=id,name,displayName")) return { value: [{ id: "stu", name: "IEP_Students_2026_27" }, { id: "usr", name: "IEP_Users2" }] };
      const [, list, rest] = path.match(/lists\/(\w+)\/(.*)$/);
      if (rest.startsWith("columns")) return { value: COLUMNS[list] };
      const one = rest.match(/^items\/(\w+)\?/);
      if (one) return items[list].find(item => item.id === one[1]);
      return { value: items[list] };
    },
    async send(method, path, body) {
      sent.push(body.fields);
      if (onSend) return onSend(body, items);
      const list = path.match(/lists\/(\w+)\//)[1]; const id = String(100 + sent.length);
      items[list].push({ id, fields: body.fields });
      return { id };
    }
  };
  window.GRAPH = graph;
  return graph;
}

async function freshRoster(options) {
  const site = fakeSite(options);
  Object.assign(ROSTER, { students: [], staff: [], loaded: false, loading: false, error: null, pending: null, writeAllowed: true });
  await ROSTER.load();
  return site;
}

const jane = { first: "Jane", last: "Doe", teacher: "Bossons, A", classroom: "", active: true, paceEnabled: false, dailyPulseEnabled: false };
global.window = {};

test("the writable Title column wins a display name shared with computed LinkTitle", () => {
  assert.equal(buildSchema(COLUMNS.stu)["Student First Name"], "Title");
  assert.equal(buildSchema([...COLUMNS.stu].reverse())["Student First Name"], "Title");
});

test("values are encoded for each column's real type, or refused before sending", () => {
  assert.deepEqual(encodeField({ name: "A", boolean: {} }, true), { A: true });
  assert.deepEqual(encodeField(choice("P", "PACE Enabled", ["Yes", "No"]), false), { P: "No" });
  assert.deepEqual(encodeField(text("T", "Pulse"), true), { T: "Yes" });
  assert.deepEqual(encodeField({ name: "R", choice: { choices: ["Teacher"], displayAs: "checkBoxes" } }, "Teacher"), { "R@odata.type": "Collection(Edm.String)", R: ["Teacher"] });
  assert.throws(() => encodeField(choice("R", "Role", ["Administrator"]), "Teacher"), /does not offer "Teacher"/);
  assert.throws(() => encodeField(text("N", "Name", { text: { maxLength: 3 } }), "Long name"), /at most 3/);
  assert.throws(() => encodeField({ name: "L", displayName: "Owner", lookup: {} }, "x"), /lookup column/);
});

test("teacher choices reuse the roster's exact teacher value and list only active teachers", () => {
  const students = [normalizeStudent({ id: "1", "Student First Name": "Amy", "Student Last Name": "Ruiz", Teacher: "Bossons, A" })];
  const staff = [{ id: "7", Name: "Bossons, Amber", Role: "Teacher", Active: "Yes" }, { id: "8", Name: "Smith, John", Role: "Teacher; Behavior Specialist", Active: true }, { id: "9", Name: "Gone, Old", Role: "Teacher", Active: "No" }, { id: "10", Name: "Lead, Pat", Role: "Administrator", Active: "Yes" }].map(normalizeStaff);
  assert.deepEqual(teacherOptions(staff, students), [{ label: "Bossons, Amber", value: "Bossons, A" }, { label: "Smith, John", value: "Smith, J" }]);
});

test("duplicate names are found ignoring case and spacing, inactive students included", () => {
  const students = [{ id: "1", name: "Jane  Doe", active: false }, { id: "2", name: "Jan Doe", active: true }];
  assert.deepEqual(findDuplicateStudents(students, " jane", "DOE ").map(student => student.id), ["1"]);
});

test("adding a student sends typed values, reads the record back by id and reloads the roster", async () => {
  const site = await freshRoster();
  assert.equal(ROSTER.students[0].name, "Amy Ruiz");
  const result = await ROSTER.addStudent(jane);
  assert.equal(result.status, "verified");
  assert.deepEqual(site.sent, [{ Title: "Jane", field_2: "Doe", Teacher: "Bossons, A", Active: true, PACE: "No", Pulse: "No" }]);
  assert.ok(ROSTER.students.some(student => student.name === "Jane Doe"));
});

test("nothing is sent without Admin Hub access or a complete roster", async () => {
  const site = await freshRoster();
  ROSTER.writeAllowed = false;
  assert.equal((await ROSTER.addStudent(jane)).status, "failed");
  ROSTER.writeAllowed = true; ROSTER.error = "page 2 failed";
  assert.match((await ROSTER.addStudent(jane)).error, /not fully loaded/);
  assert.equal(site.sent.length, 0);
});

test("a refusal is a safe failure, but a dropped connection is uncertain and never retried", async () => {
  await freshRoster({ onSend: () => { throw Object.assign(new Error("Graph 400"), { graphStatus: 400 }); } });
  assert.equal((await ROSTER.addStudent(jane)).status, "failed");
  const site = await freshRoster({ onSend: () => { throw new TypeError("Failed to fetch"); } });
  assert.equal((await ROSTER.addStudent(jane)).status, "uncertain");
  assert.equal(site.sent.length, 1);
});

test("values SharePoint did not keep are reported instead of a success", async () => {
  await freshRoster({ onSend: (body, items) => { items.stu.push({ id: "55", fields: { ...body.fields, Teacher: "" } }); return { id: "55" }; } });
  const result = await ROSTER.addStudent(jane);
  assert.equal(result.status, "mismatch");
  assert.deepEqual(result.problems, ["teacher"]);
});

test("adding a teacher always creates an active Teacher with a generated user id", async () => {
  const site = await freshRoster();
  const result = await ROSTER.addTeacher({ name: "Smith, John", email: "smithj@iu29.org" });
  assert.equal(result.status, "verified");
  const [fields] = site.sent;
  assert.match(fields.Title, /^teacher-smith-john-/);
  assert.deepEqual({ ...fields, Title: undefined }, { Title: undefined, field_1: "Smith, John", field_2: "Teacher", Email: "smithj@iu29.org", field_3: "Yes" });
});

test("a required column the form does not fill blocks the save", async () => {
  const site = await freshRoster();
  COLUMNS.stu.push(text("Grade", "Grade", { required: true }));
  try {
    const result = await ROSTER.addStudent(jane);
    assert.equal(result.status, "failed");
    assert.match(result.error, /requires "Grade"/);
    assert.equal(site.sent.length, 0);
  } finally { COLUMNS.stu.pop(); }
});

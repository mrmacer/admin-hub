import { CONFIG } from "../../config.js";
import { EMAIL_FIELDS } from "../../auth.js";
import { compareStudent, compareTeacher, createStaffUserId, normalizeStaff, normalizeStudent } from "./roster-model.js";

const LISTS = CONFIG.lists;
const colKey = label => String(label ?? "").replace(/_x([0-9a-f]{4})_/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16))).toLowerCase().replace(/[^a-z0-9]/g, "");

// The list's real display name for one of `candidates`, ignoring case, spacing
// and punctuation, so a name is never saved to a column that does not exist.
export function findColumn(schema, candidates) {
  const exact = candidates.find(candidate => candidate in schema);
  if (exact) return exact;
  const wanted = candidates.map(colKey);
  return Object.keys(schema).find(key => wanted.includes(colKey(key))) ?? null;
}

const validId = value => (typeof value === "number" && Number.isFinite(value)) || (typeof value === "string" && value.trim()) ? String(value).trim() : "";

// Students (IEP_Students_2026_27) and staff (IEP_Users2), loaded whole or not
// at all. Adding is the only write, and each add reports one of:
//   verified   - read back by its item id and every value matches
//   mismatch   - created, but SharePoint kept different values
//   unverified - accepted, but no id came back or it could not be read back
//   uncertain  - the connection failed mid-save; never retried
//   failed     - nothing was written, so trying again is safe
export const ROSTER = {
  students: [], staff: [], loaded: false, loading: false, error: null, pending: null,
  // Set from the Admin Hub authorization decision; starts closed.
  writeAllowed: false,
  get complete() { return this.loaded && !this.loading && !this.error; },

  ensureLoaded() { return this.pending ?? (this.loaded ? Promise.resolve() : this.load()); },
  // A failed load keeps the last complete copy but sets error, which blocks adding.
  async load() {
    if (this.pending) await this.pending;
    this.loading = true; this.error = null;
    this.pending = (async () => {
      try {
        const [studentRows, staffRows] = await Promise.all([window.GRAPH.getListItems(LISTS.students), window.GRAPH.getListItems(LISTS.users)]);
        this.students = studentRows.map(normalizeStudent).filter(Boolean);
        this.staff = staffRows.map(normalizeStaff);
        this.loaded = true;
      } catch (error) {
        console.error("Roster load failed:", error?.message);
        this.error = error?.message || "The roster could not be loaded.";
      } finally { this.loading = false; this.pending = null; }
    })();
    return this.pending;
  },

  requireWrite() {
    if (!this.writeAllowed) throw new Error("Admin Hub access is required to add to the roster.");
    if (!this.complete) throw new Error("The roster is not fully loaded, so duplicates can't be ruled out. Reload it and try again.");
  },

  addStudent(values) {
    return this.commit(LISTS.students, async () => {
      const schema = await window.GRAPH.getSchema(LISTS.students);
      const first = findColumn(schema, ["Student First Name", "First Name"]); const last = findColumn(schema, ["Student Last Name", "Last Name"]);
      if (!first || !last) throw new Error(`${LISTS.students} has no column for the student's ${[!first && "first name", !last && "last name"].filter(Boolean).join(" or ")}. Columns found: ${Object.keys(schema).join(", ") || "none"}.`);
      // A blank classroom is simply not sent.
      return { [first]: values.first, [last]: values.last, Teacher: values.teacher, ...(values.classroom ? { Classroom: values.classroom } : {}), Active: values.active, "PACE Enabled": values.paceEnabled, "Daily Pulse Enabled": values.dailyPulseEnabled };
    }, async id => compareStudent(values, normalizeStudent(await window.GRAPH.getListItem(LISTS.students, id))));
  },

  // Always Role = Teacher and Active; Admin Hub cannot create any other kind of user.
  addTeacher(values) {
    return this.commit(LISTS.users, async () => {
      const [schema, columns] = await Promise.all([window.GRAPH.getSchema(LISTS.users), window.GRAPH.getColumns(LISTS.users)]);
      const email = EMAIL_FIELDS.find(field => field in schema) ?? "Email";
      const fields = { Name: values.name, Role: CONFIG.roster.teacherRole, [email]: values.email, Active: true };
      // Title holds a generated user id, as MAC-Walkthrough's Add User does.
      const title = columns.find(column => column.name === "Title")?.displayName;
      return title && !(title in fields) && schema[title] === "Title" ? { [title]: createStaffUserId(values.name), ...fields } : fields;
    }, async id => compareTeacher(values, normalizeStaff(await window.GRAPH.getListItem(LISTS.users, id))));
  },

  async commit(listName, buildValues, verify) {
    // 1. Prepare: reads only, so any problem here means nothing was sent.
    let fields;
    try { this.requireWrite(); fields = await window.GRAPH.prepareFields(listName, await buildValues()); }
    catch (error) { return { status: "failed", error: error.message }; }
    // 2. Write.
    let created;
    try { created = await window.GRAPH.createListItem(listName, fields); }
    catch (error) {
      if (error.graphStatus || error.notSent) return { status: "failed", error: error.message };
      await this.load();
      return { status: "uncertain", error: error.message };
    }
    // 3. Verify by the exact item id, then reload so duplicate checks see the new row.
    const id = validId(created?.id); let result;
    if (!id) result = { status: "unverified", reason: "no-id" };
    else {
      try { const problems = await verify(id); result = problems.length ? { status: "mismatch", id, problems } : { status: "verified", id }; }
      catch (error) { result = { status: "unverified", id, reason: "read-back-failed", error: error.message }; }
    }
    await this.load();
    return result;
  }
};

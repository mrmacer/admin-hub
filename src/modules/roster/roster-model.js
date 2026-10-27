import { EMAIL_FIELDS, normalizeEmail } from "../../auth.js";

// Same rules MAC-Walkthrough uses for IEP_Students_2026_27 and IEP_Users2, so a
// student or teacher added here reads the same way in MAC, PACE and Daily Pulse.

const text = value => String(value ?? "").trim();
const firstOf = (row, keys) => text(keys.map(key => row?.[key]).find(value => text(value)));
const clean = value => String(value ?? "").replace(/\s+/g, " ").trim();

// A Yes/No column; `fallback` applies only when the value is blank.
export function rosterBool(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  return ["yes", "true", "1"].includes(String(value).trim().toLowerCase());
}

// Role may be a string ("Teacher; Behavior Specialist"), an array, or Graph's {results: []}.
export function roleTokens(value) {
  const raw = Array.isArray(value?.results) ? value.results : value;
  return (Array.isArray(raw) ? raw : String(raw ?? "").split(/[;,]/)).map(token => text(token).toLowerCase()).filter(Boolean);
}
export function isTeacherRole(value) { return roleTokens(value).includes("teacher"); }

// The production list has first/last name columns and no ID column; the
// SharePoint item id is the student's id. PACE and Daily Pulse start off when blank.
export function normalizeStudent(row) {
  const firstName = firstOf(row, ["Student First Name", "First Name", "StudentFirstName", "FirstName"]);
  const lastName = firstOf(row, ["Student Last Name", "Last Name", "StudentLastName", "LastName"]);
  const name = firstName || lastName ? `${firstName} ${lastName}`.trim() : firstOf(row, ["Student Name", "StudentName", "Name"]);
  if (!name) return null;
  return { id: text(row.id), firstName, lastName, name, teacherName: firstOf(row, ["Teacher", "TeacherName"]), classroom: firstOf(row, ["Classroom"]), active: rosterBool(row.Active, true), paceEnabled: rosterBool(row["PACE Enabled"], false), dailyPulseEnabled: rosterBool(row["Daily Pulse Enabled"], false) };
}

export function normalizeStaff(row) {
  const roles = roleTokens(row?.Role ?? row?.field_2);
  return { id: text(row?.id), name: firstOf(row, ["field_1", "Name", "Title"]), roles, role: roles.join(", "), email: firstOf(row, EMAIL_FIELDS), active: rosterBool(row?.Active ?? row?.field_3, false) };
}

export function splitNameParts(fullName) {
  const raw = text(fullName);
  if (raw.includes(",")) { const [last, first] = raw.split(","); return { first: text(first), last: text(last) }; }
  const parts = raw.split(/\s+/).filter(Boolean);
  return { first: parts[0] ?? "", last: parts.at(-1) ?? "" };
}

// Students store their teacher as the exact string Daily Pulse and PACE match
// on (e.g. "Bossons, A"), not the IEP_Users2 display name. Reuse the value an
// existing student already has for this teacher (by surname, then first
// initial); only a teacher with no students yet gets a built "Last, F".
export function resolveCanonicalTeacherValue(displayName, students) {
  const { first, last } = splitNameParts(displayName);
  if (!last) return displayName;
  const candidates = [...new Set((students ?? []).map(student => student.teacherName).filter(Boolean).filter(value => splitNameParts(value).last.toLowerCase() === last.toLowerCase()))];
  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1 && first) {
    const narrowed = candidates.filter(value => splitNameParts(value).first.charAt(0).toLowerCase() === first.charAt(0).toLowerCase());
    if (narrowed.length === 1) return narrowed[0];
  }
  return first ? `${last}, ${first.charAt(0).toUpperCase()}` : last;
}

export function activeTeachers(staff) {
  const seen = new Set();
  return staff.filter(person => person.active && isTeacherRole(person.roles) && person.name).filter(person => { const key = person.name.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; }).sort((a, b) => a.name.localeCompare(b.name));
}

export function teacherOptions(staff, students) {
  return activeTeachers(staff).map(person => ({ label: person.name, value: resolveCanonicalTeacherValue(person.name, students) }));
}

export function nameKey(name) { return clean(name).toLowerCase(); }

// Matches across every record, inactive included, so a deactivated student is
// flagged instead of quietly added a second time.
export function findDuplicateStudents(students, firstName, lastName) {
  const key = nameKey(`${firstName} ${lastName}`);
  return key ? students.filter(student => nameKey(student.name) === key) : [];
}

export function findStaffByEmail(staff, email) {
  const wanted = normalizeEmail(email);
  return wanted ? staff.filter(person => normalizeEmail(person.email) === wanted) : [];
}

export function isValidEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(value)); }

export function createStaffUserId(name, now = Date.now()) {
  const slug = text(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `teacher-${slug}-${now.toString(36)}`;
}

export function cleanStudentDraft(draft) {
  return { first: clean(draft.first), last: clean(draft.last), teacher: draft.teacher ?? "", classroom: clean(draft.classroom), active: Boolean(draft.active), paceEnabled: Boolean(draft.paceEnabled), dailyPulseEnabled: Boolean(draft.dailyPulseEnabled) };
}

// Labels of every submitted value that did not read back the same.
export function compareStudent(values, saved) {
  const record = saved ?? {};
  const checks = [["first", "first name", record.firstName ?? ""], ["last", "last name", record.lastName ?? ""], ["teacher", "teacher", record.teacherName ?? ""], ["classroom", "classroom", record.classroom ?? ""], ["active", "Active", record.active], ["paceEnabled", "PACE Enabled", record.paceEnabled], ["dailyPulseEnabled", "Daily Pulse Enabled", record.dailyPulseEnabled]];
  return checks.filter(([key, , readBack]) => key in values && values[key] !== readBack).map(([, label]) => label);
}

export function compareTeacher(values, saved) {
  const record = saved ?? {};
  return [["name", record.name === values.name], ["email", normalizeEmail(record.email) === normalizeEmail(values.email)], ["Teacher role", isTeacherRole(record.roles)], ["Active", record.active === true]].filter(([, ok]) => !ok).map(([label]) => label);
}

// One plain-language message per save outcome.
export function describeResult(result, label, noun) {
  switch (result.status) {
    case "verified": return { ok: true, text: `${noun} ${label} added.` };
    case "failed": return { ok: false, text: `Nothing was saved. ${result.error}` };
    case "mismatch": return { ok: false, text: `${label} was created, but SharePoint did not keep: ${result.problems.join(", ")}. It was not counted as saved. Correct it in MAC-Walkthrough or SharePoint rather than adding it again.` };
    case "unverified": return { ok: false, text: result.reason === "no-id" ? `NOT VERIFIED: SharePoint accepted ${label} but returned no item ID, so it could not be checked. It may have been created. Check the list below before adding it again.` : `NOT VERIFIED: ${label} was sent to SharePoint but could not be read back to confirm it. Check the list below before adding it again.` };
    default: return { ok: false, text: `UNCERTAIN: the connection failed while saving ${label}, so it is unknown whether it was saved. It was not retried. Check the list below before adding it again.` };
  }
}

import { stableDirectoryId, normalizeHistory, normalizeStaffRecord, normalizeStudentRecord, splitName } from "./directory-model.js";

const SEED_DATE = "2026-11-01T09:00:00.000Z";
const STAFF_SEED = [
  { name: "Specialist A", email: "specialist.a@example.test", roles: ["Behavior Specialist"], active: true, program: "PACE" },
  { name: "Specialist B", email: "specialist.b@example.test", roles: ["Behavior Specialist"], active: true, program: "PACE" },
  { name: "Specialist C", email: "specialist.c@example.test", roles: ["Behavior Specialist"], active: true, program: "PACE" },
  { name: "Specialist D", email: "specialist.d@example.test", roles: ["Behavior Specialist"], active: true, program: "PACE" },
  { name: "Demo Administrator", email: "administrator@example.test", roles: ["Administrator"], active: true, program: "Admin Hub" },
  { name: "Demo Teacher A", email: "teacher.a@example.test", roles: ["Teacher"], active: true, classroom: "Classroom Alpha" },
  { name: "Demo Teacher B", email: "teacher.b@example.test", roles: ["Teacher"], active: false, classroom: "Classroom Beta" }
];

function historyEntry(action, actor = "Demo Administrator", reason = "", previous = null, current = null, index = 0) {
  return { id: `history-${action.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${index}`, action, actor, at: SEED_DATE, reason, previous, current };
}

function firstVisitFor(visits, name) { return visits.find(visit => visit.student === name); }

export function createDemoDirectory(visits = []) {
  const names = [...new Set(visits.map(visit => visit.student).filter(Boolean))];
  const students = names.map((name, index) => {
    const visit = firstVisitFor(visits, name); const parts = splitName(name);
    const value = { id: stableDirectoryId("student", name), firstName: parts.first, lastName: parts.last, name, classroom: visit?.teacherCameFrom || "", teacherName: "", active: true, paceEnabled: true, dailyPulseEnabled: false, createdAt: SEED_DATE, updatedAt: SEED_DATE };
    return { ...value, history: [historyEntry("Created", "Demo Administrator", "Synthetic roster seed", null, value, index)] };
  });
  const staff = STAFF_SEED.map((seed, index) => {
    const value = { ...seed, id: stableDirectoryId("staff", seed.email), createdAt: SEED_DATE, updatedAt: SEED_DATE };
    return { ...value, history: [historyEntry("Created", "Demo Administrator", "Synthetic directory seed", null, value, index)] };
  });
  return { students, staff, migratedFrom: null };
}

function normalizeRecordHistory(record) {
  const history = normalizeHistory(record.history);
  if (history.length) return { ...record, history };
  const { history: ignored, ...current } = record;
  return { ...record, history: [{ id: "history-created", action: "Created", actor: "Demo Administrator", at: record.createdAt || SEED_DATE, reason: "Synthetic directory record preserved during migration", previous: null, current }] };
}

export function normalizeDirectory(raw, visits = []) {
  const seed = createDemoDirectory(visits);
  if (!raw || typeof raw !== "object") return seed;
  const students = Array.isArray(raw.students) ? raw.students.map(normalizeStudentRecord).filter(Boolean).map(normalizeRecordHistory) : seed.students;
  const staff = Array.isArray(raw.staff) ? raw.staff.map(normalizeStaffRecord).filter(Boolean).map(normalizeRecordHistory) : seed.staff;
  return { students: students.length ? students : seed.students, staff: staff.length ? staff : seed.staff, migratedFrom: raw.migratedFrom ?? "v1.3" };
}

export function directorySnapshot(directory) {
  return { students: directory.students, staff: directory.staff, migratedFrom: directory.migratedFrom ?? null };
}

export function recordDirectoryChange(directory, kind, id, change) {
  const collection = kind === "student" ? "students" : "staff";
  const record = directory[collection].find(item => item.id === id);
  if (!record) throw new Error("The directory record could not be found.");
  const now = change.at || new Date().toISOString();
  const history = [...(record.history ?? []), { id: `history-${kind}-${id}-${Date.now()}`, action: change.action, actor: change.actor || "Demo Administrator", at: now, reason: change.reason || "", previous: change.previous ?? null, current: change.current ?? null }];
  const next = { ...record, ...change.current, updatedAt: now, history };
  return { ...directory, [collection]: directory[collection].map(item => item.id === id ? next : item) };
}

export function addDirectoryRecord(directory, kind, value, actor = "Demo Administrator") {
  const collection = kind === "student" ? "students" : "staff";
  const baseId = stableDirectoryId(kind, kind === "student" ? value.name : value.email);
  const existing = directory[collection].some(item => item.id === baseId);
  const id = existing ? `${baseId}-${Date.now().toString(36)}` : baseId;
  const now = new Date().toISOString();
  const record = { ...value, id, createdAt: now, updatedAt: now, history: [{ id: `history-${kind}-${id}-${Date.now()}`, action: "Created", actor, at: now, reason: "Directory record created", previous: null, current: value }] };
  return { ...directory, [collection]: [...directory[collection], record] };
}

export function directoryCounts(directory) {
  const count = values => ({ total: values.length, active: values.filter(item => item.active).length, inactive: values.filter(item => !item.active).length });
  return { students: count(directory.students), staff: count(directory.staff), roles: directory.staff.reduce((all, item) => item.roles.reduce((roles, role) => { roles[role] = (roles[role] ?? 0) + 1; return roles; }, all), {}) };
}

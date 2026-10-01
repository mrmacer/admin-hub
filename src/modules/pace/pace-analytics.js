import { parseDateOnly } from "../../date-utils.js";

export const FIELD_ALIASES = {
  student: ["Student", "Student Name", "StudentName", "studentName"],
  date: ["Date", "Visit Date", "date"],
  timeIn: ["Time In", "TimeIn", "timeIn"],
  timeOut: ["Time Out", "TimeOut", "timeOut"],
  duration: ["Duration", "Duration Minutes", "DurationMinutes", "durationMinutes"],
  room: ["Room", "PACE Room", "Pace Room", "paceRoom"],
  specialist: ["Behavior Specialist", "Staff Member", "Submitted By", "submittedByName"],
  teacher: ["Teacher Came From", "Teacher", "teacherCameFrom"],
  reason: ["Reason", "Behavior", "Behaviors", "behaviors"],
  intervention: ["Intervention Used", "Interventions", "Support", "Supports", "interventions"],
  scm: ["SCM Used", "SCM", "scmUsed"],
  notes: ["Notes", "Visit Notes", "notes"],
  submittedAt: ["Submitted At", "Created", "createdAt", "timestamp"]
};

function first(row, aliases) {
  for (const key of aliases) if (Object.prototype.hasOwnProperty.call(row ?? {}, key) && row[key] !== null && row[key] !== undefined && row[key] !== "") return row[key];
  return null;
}

export function text(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return String(value.displayName ?? value.DisplayName ?? value.LookupValue ?? value.title ?? value.name ?? "").trim();
  return String(value).trim();
}

export function list(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return text(value).split(/[,;]\s*/).map(item => item.trim()).filter(Boolean);
}

export function booleanOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  const normalized = String(value).trim().toLowerCase();
  if (["yes", "true", "1"].includes(normalized)) return true;
  if (["no", "false", "0"].includes(normalized)) return false;
  return null;
}

export function calculateDuration(timeIn, timeOut) {
  const clock = value => String(value ?? "").match(/^(\d{1,2}):(\d{2})/);
  const start = clock(timeIn); const end = clock(timeOut);
  if (!start || !end) return null;
  const minutes = Number(end[1]) * 60 + Number(end[2]) - Number(start[1]) * 60 - Number(start[2]);
  return Number.isFinite(minutes) && minutes >= 0 ? minutes : null;
}

function duration(value, timeIn, timeOut) {
  if (value !== null && value !== undefined && value !== "") {
    const number = Number(value);
    if (Number.isFinite(number) && number >= 0) return Math.round(number);
  }
  return calculateDuration(timeIn, timeOut);
}

export function normalizeVisit(row = {}) {
  const timeIn = text(first(row, FIELD_ALIASES.timeIn));
  const timeOut = text(first(row, FIELD_ALIASES.timeOut));
  return {
    id: text(row.id ?? row.ID),
    student: text(first(row, FIELD_ALIASES.student)),
    date: parseDateOnly(first(row, FIELD_ALIASES.date)),
    timeIn, timeOut,
    durationMinutes: duration(first(row, FIELD_ALIASES.duration), timeIn, timeOut),
    room: text(first(row, FIELD_ALIASES.room)),
    specialists: list(first(row, FIELD_ALIASES.specialist)),
    teacherCameFrom: text(first(row, FIELD_ALIASES.teacher)),
    reasons: list(first(row, FIELD_ALIASES.reason)),
    interventions: list(first(row, FIELD_ALIASES.intervention)),
    scmUsed: booleanOrNull(first(row, FIELD_ALIASES.scm)),
    notes: text(first(row, FIELD_ALIASES.notes)),
    submittedAt: text(first(row, FIELD_ALIASES.submittedAt)),
    isCompleted: Boolean(timeOut)
  };
}

export function inRange(visit, from, to) {
  return Boolean(visit?.date) && (!from || visit.date >= from) && (!to || visit.date <= to);
}

export function filterVisits(visits, filters = {}) {
  const search = String(filters.search ?? "").trim().toLowerCase();
  return (visits ?? []).filter(visit => {
    if (!inRange(visit, filters.from, filters.to)) return false;
    if (filters.student && visit.student !== filters.student) return false;
    if (filters.specialist && !visit.specialists.includes(filters.specialist)) return false;
    if (filters.room && visit.room !== filters.room) return false;
    if (filters.reason && !visit.reasons.includes(filters.reason)) return false;
    if (filters.scm === "yes" && visit.scmUsed !== true) return false;
    if (filters.scm === "no" && visit.scmUsed !== false) return false;
    if (search) {
      const haystack = [visit.student, visit.room, visit.teacherCameFrom, visit.timeIn, visit.timeOut, visit.notes, ...visit.specialists, ...visit.reasons, ...visit.interventions].join(" ").toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

export function completed(visits) { return (visits ?? []).filter(visit => visit.isCompleted); }
export function calculateVisitCount(visits) { return completed(visits).length; }
export function calculateUniqueStudents(visits) { return new Set(completed(visits).map(v => v.student).filter(Boolean)).size; }

export function calculateAverageDuration(visits) {
  const rows = completed(visits).filter(v => Number.isFinite(v.durationMinutes));
  return rows.length ? Math.round(rows.reduce((sum, v) => sum + v.durationMinutes, 0) / rows.length) : null;
}

export function calculateTotalDuration(visits) {
  const rows = completed(visits).filter(v => Number.isFinite(v.durationMinutes));
  return rows.length ? rows.reduce((sum, v) => sum + v.durationMinutes, 0) : null;
}

export function calculateSCMCount(visits) {
  const rows = completed(visits).filter(v => v.scmUsed !== null);
  return rows.length ? rows.filter(v => v.scmUsed === true).length : null;
}

function groupBy(visits, values) {
  const counts = new Map();
  for (const visit of completed(visits)) for (const value of values(visit)) if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function groupVisitsByDate(visits) { return groupBy(visits, v => [v.date]); }
export function groupVisitsByReason(visits) { return groupBy(visits, v => v.reasons); }
export function groupVisitsByIntervention(visits) { return groupBy(visits, v => v.interventions); }
export function groupVisitsByRoom(visits) { return groupBy(visits, v => [v.room]); }

export function groupVisitsByTimeOfDay(visits) {
  const buckets = ["Morning", "Midday", "Afternoon"];
  const counts = new Map(buckets.map(label => [label, 0]));
  for (const visit of completed(visits)) {
    const hour = Number(String(visit.timeIn).split(":")[0]);
    if (!Number.isFinite(hour)) continue;
    counts.set(hour < 11 ? "Morning" : hour < 13 ? "Midday" : "Afternoon", counts.get(hour < 11 ? "Morning" : hour < 13 ? "Midday" : "Afternoon") + 1);
  }
  return [...counts.entries()].map(([label, count]) => ({ label, count }));
}

export function sortNewest(a, b) {
  return `${b.date}|${b.timeIn}|${b.submittedAt}`.localeCompare(`${a.date}|${a.timeIn}|${a.submittedAt}`);
}

export function aggregateStudents(visits) {
  const map = new Map();
  for (const visit of completed(visits)) {
    if (!visit.student) continue;
    const entry = map.get(visit.student) ?? { student: visit.student, visits: 0, totalMinutes: 0, durationCount: 0, scmEvents: 0, lastVisit: "", averageDuration: null };
    entry.visits += 1;
    if (Number.isFinite(visit.durationMinutes)) { entry.totalMinutes += visit.durationMinutes; entry.durationCount += 1; }
    if (visit.scmUsed === true) entry.scmEvents += 1;
    if (!entry.lastVisit || `${visit.date}|${visit.timeIn}` > `${entry.lastVisit}|${entry.lastTime ?? ""}`) { entry.lastVisit = visit.date; entry.lastTime = visit.timeIn; }
    map.set(visit.student, entry);
  }
  return [...map.values()].map(entry => { const { lastTime, ...publicEntry } = entry; return { ...publicEntry, totalMinutes: entry.durationCount ? entry.totalMinutes : null, averageDuration: entry.durationCount ? Math.round(entry.totalMinutes / entry.durationCount) : null }; }).sort((a, b) => b.visits - a.visits || a.student.localeCompare(b.student));
}

export function summarize(visits, range) {
  const selected = filterVisits(visits, range);
  const done = completed(selected);
  return {
    visits: done.length,
    uniqueStudents: calculateUniqueStudents(selected),
    averageDuration: calculateAverageDuration(selected),
    totalMinutes: calculateTotalDuration(selected),
    scmEvents: calculateSCMCount(selected),
    currentlyInPace: selected.filter(v => v.date === range?.to && !v.isCompleted).length,
    records: selected
  };
}

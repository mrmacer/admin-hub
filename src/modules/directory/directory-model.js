const text = value => String(value ?? "").replace(/\s+/g, " ").trim();

export function normalizeEmail(value) { return text(value).toLowerCase(); }
export function nameKey(value) { return text(value).toLowerCase(); }
export function slugify(value) { return text(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "record"; }

export function splitName(value) {
  const name = text(value);
  if (name.includes(",")) {
    const [last, ...rest] = name.split(",");
    return { first: text(rest.join(" ")), last: text(last) };
  }
  const parts = name.split(" ").filter(Boolean);
  return { first: parts.slice(0, -1).join(" "), last: parts.at(-1) ?? "" };
}

export function stableDirectoryId(kind, value) { return `demo-${kind}-${slugify(value)}`; }

export function directoryRoles(value) {
  const values = Array.isArray(value) ? value : String(value ?? "").split(/[;,]/);
  return values.map(text).filter(Boolean);
}

export function normalizeStudentRecord(record) {
  if (!record?.id || !text(record.name)) return null;
  const parts = splitName(record.name);
  return {
    id: text(record.id),
    firstName: text(record.firstName) || parts.first,
    lastName: text(record.lastName) || parts.last,
    name: text(record.name),
    classroom: text(record.classroom),
    teacherName: text(record.teacherName),
    active: record.active !== false,
    paceEnabled: record.paceEnabled !== false,
    dailyPulseEnabled: Boolean(record.dailyPulseEnabled),
    createdAt: record.createdAt || "2026-11-01T09:00:00.000Z",
    updatedAt: record.updatedAt || record.createdAt || "2026-11-01T09:00:00.000Z",
    history: record.history
  };
}

export function normalizeStaffRecord(record) {
  if (!record?.id || !text(record.name)) return null;
  return {
    id: text(record.id),
    name: text(record.name),
    email: normalizeEmail(record.email),
    roles: directoryRoles(record.roles ?? record.role),
    active: record.active !== false,
    classroom: text(record.classroom),
    program: text(record.program),
    createdAt: record.createdAt || "2026-11-01T09:00:00.000Z",
    updatedAt: record.updatedAt || record.createdAt || "2026-11-01T09:00:00.000Z",
    history: record.history
  };
}

export function normalizeHistory(history) {
  return Array.isArray(history) ? history.filter(item => item && item.action).map((item, index) => ({
    id: text(item.id) || `history-${index}`,
    action: text(item.action),
    actor: text(item.actor) || "Demo Administrator",
    at: item.at || "2026-11-01T09:00:00.000Z",
    reason: text(item.reason),
    previous: item.previous && typeof item.previous === "object" ? item.previous : null,
    current: item.current && typeof item.current === "object" ? item.current : null
  })) : [];
}

export function validateStudentDraft(draft) {
  const first = text(draft.firstName); const last = text(draft.lastName);
  const errors = [];
  if (!first) errors.push("First name is required.");
  if (!last) errors.push("Last name is required.");
  return { errors, value: { firstName: first, lastName: last, name: `${first} ${last}`.trim(), classroom: text(draft.classroom), teacherName: text(draft.teacherName), active: Boolean(draft.active), paceEnabled: Boolean(draft.paceEnabled), dailyPulseEnabled: Boolean(draft.dailyPulseEnabled) } };
}

export function validateStaffDraft(draft) {
  const name = text(draft.name); const email = normalizeEmail(draft.email); const roles = directoryRoles(draft.roles);
  const errors = [];
  if (!name) errors.push("Display name is required.");
  if (!email) errors.push("Email is required for synthetic staff identity.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("Enter a valid email address.");
  if (!roles.length) errors.push("Choose at least one directory role.");
  return { errors, value: { name, email, roles, active: Boolean(draft.active), classroom: text(draft.classroom), program: text(draft.program) } };
}

export function studentDuplicateMatches(students, value, excludeId = "") {
  const key = nameKey(value);
  return students.filter(item => item.id !== excludeId && nameKey(item.name) === key);
}

export function staffDuplicateMatches(staff, email, excludeId = "") {
  const key = normalizeEmail(email);
  return staff.filter(item => item.id !== excludeId && normalizeEmail(item.email) === key);
}

export function sortDirectoryRecords(records, field = "name", direction = "asc") {
  const multiplier = direction === "desc" ? -1 : 1;
  return [...records].sort((a, b) => String(a[field] ?? "").localeCompare(String(b[field] ?? ""), undefined, { sensitivity: "base" }) * multiplier);
}

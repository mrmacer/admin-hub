export function pad(value) { return String(value).padStart(2, "0"); }

export function localDateString(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseDateOnly(value) {
  const match = String(value ?? "").match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
}

export function addDays(dateString, amount) {
  const [year, month, day] = String(dateString).split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() + amount);
  return localDateString(date);
}

export function dateRangeForPreset(preset, today = localDateString()) {
  if (preset === "today") return { preset, from: today, to: today, label: "Today" };
  if (preset === "7") return { preset, from: addDays(today, -6), to: today, label: "7 Days" };
  if (preset === "30") return { preset, from: addDays(today, -29), to: today, label: "30 Days" };
  if (preset === "90") return { preset, from: addDays(today, -89), to: today, label: "90 Days" };
  return { preset: "custom", from: addDays(today, -29), to: today, label: "Custom" };
}

export function formatDate(value, options = { month: "short", day: "numeric", year: "numeric" }) {
  const date = parseDateOnly(value);
  if (!date) return "—";
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", options).format(new Date(year, month - 1, day, 12));
}

export function formatDateRange(range) {
  if (!range?.from || !range?.to) return "";
  return range.from === range.to ? formatDate(range.from) : `${formatDate(range.from, { month: "short", day: "numeric" })} – ${formatDate(range.to, { month: "short", day: "numeric", year: "numeric" })}`;
}

export function toGraphUtcBoundary(dateString, end = false) {
  const [year, month, day] = String(dateString).split("-").map(Number);
  const date = new Date(year, month - 1, day + (end ? 1 : 0), 0, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

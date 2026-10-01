export function esc(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
export function emptyState(title, text) { return `<div class="empty-state"><div class="empty-icon">○</div><h3>${esc(title)}</h3><p>${esc(text)}</p></div>`; }
export function metricCard(label, value, detail = "") { return `<article class="metric-card"><div class="metric-label">${esc(label)}</div><div class="metric-value">${esc(value)}</div><div class="metric-detail">${esc(detail)}</div></article>`; }
export function pill(value, tone = "neutral") { return value ? `<span class="pill pill-${tone}">${esc(value)}</span>` : `<span class="muted">—</span>`; }
export function formatMinutes(value) { return value === null || value === undefined ? "—" : `${value} min`; }

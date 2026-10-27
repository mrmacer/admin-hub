import { CONFIG } from "../../config.js";
import { emptyState, esc, pill } from "../../components/html.js";
import { activeTeachers, teacherOptions } from "./roster-model.js";

function header(title, subtitle, section) {
  return `<div class="page-header"><div><div class="eyebrow">Roster / ${esc(section)}</div><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div></div>`;
}

function notice(item) {
  return item ? `<div class="notice notice-${esc(item.tone)}" role="${item.tone === "error" ? "alert" : "status"}">${esc(item.text)}</div>` : "";
}

// Nothing is listed or added until the whole roster has loaded: a partial list
// could hide a duplicate or misrepresent SharePoint.
function rosterUnavailable(roster) {
  if (roster.error) return `<section class="panel"><div class="notice notice-error" role="alert"><strong>The roster could not be loaded.</strong> ${esc(roster.error)} Nothing can be added until the whole roster has loaded.</div><button class="button secondary compact-button" data-roster-action="reload">Try again</button></section>`;
  if (!roster.loaded) return `<section class="panel"><div class="center-state roster-loading"><div class="spinner"></div><p>Loading the roster from SharePoint…</p></div></section>`;
  return "";
}

function field(label, control, wide = false) { return `<label class="filter-field${wide ? " wide" : ""}"><span>${esc(label)}</span>${control}</label>`; }
function input(id, path, value, placeholder, disabled, extra = "") { return `<input id="${id}" type="text" data-roster-field="${path}" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off" maxlength="80"${extra}${disabled ? " disabled" : ""}>`; }
function checkbox(path, label, checked, disabled) { return `<label><input type="checkbox" data-roster-field="${path}"${checked ? " checked" : ""}${disabled ? " disabled" : ""}> ${esc(label)}</label>`; }

function duplicateWarning(matches, saving) {
  if (!matches?.length) return "";
  return `<div class="notice notice-warning" role="alert"><strong>This student may already be on the roster.</strong><ul>${matches.map(match => `<li>${esc(match.name)} — ${esc(match.teacherName || "no teacher")} · ${match.active ? "Active" : "Inactive"}</li>`).join("")}</ul><div class="form-actions"><button type="button" class="button secondary" data-roster-action="add-anyway"${saving ? " disabled" : ""}>Add as a separate student</button><button type="button" class="button secondary" data-roster-action="dismiss-duplicates"${saving ? " disabled" : ""}>Go back</button></div></div>`;
}

function studentForm(roster, ui) {
  const draft = ui.student; const options = teacherOptions(roster.staff, roster.students); const off = ui.saving;
  return `<section class="panel"><div class="panel-heading"><div><h2>Add a student</h2><p>Saved to ${esc(CONFIG.lists.students)}, the roster MAC-Walkthrough, PACE and Daily Pulse read.</p></div></div>${notice(ui.notice)}${duplicateWarning(ui.duplicates, off)}<form class="roster-form" data-roster-form="student" novalidate><div class="form-grid">${field("First name *", input("rosterFirst", "student.first", draft.first, "First name", off))}${field("Last name *", input("rosterLast", "student.last", draft.last, "Last name", off))}${field("Teacher *", `<select data-roster-field="student.teacher"${off ? " disabled" : ""}><option value="">Select teacher</option>${options.map(option => `<option value="${esc(option.value)}"${option.value === draft.teacher ? " selected" : ""}>${esc(option.label)}</option>`).join("")}</select>`)}${field("Classroom (optional)", input("rosterClassroom", "student.classroom", draft.classroom, "e.g. Room 12", off))}</div>${options.length ? "" : `<p class="form-help">No active teachers were found in ${esc(CONFIG.lists.users)}. Add one on the Teachers page first.</p>`}<div class="check-row">${checkbox("student.active", "Active", draft.active, off)}${checkbox("student.paceEnabled", "PACE Enabled", draft.paceEnabled, off)}${checkbox("student.dailyPulseEnabled", "Daily Pulse Enabled", draft.dailyPulseEnabled, off)}</div><p class="form-help">PACE and Daily Pulse start off. Turn them on only for students who take part.</p><div class="form-actions"><button type="submit" class="button primary"${off ? " disabled" : ""}>${off ? "Saving…" : "Add student"}</button></div></form></section>`;
}

function studentList(roster, ui) {
  const all = [...roster.students].sort((a, b) => (a.lastName || a.name).localeCompare(b.lastName || b.name) || a.firstName.localeCompare(b.firstName));
  const query = (ui.search ?? "").trim().toLowerCase();
  const rows = query ? all.filter(student => `${student.name} ${student.teacherName} ${student.classroom}`.toLowerCase().includes(query)) : all;
  const body = rows.map(student => `<tr class="${student.active ? "" : "row-inactive"}"><td><strong>${esc(student.name)}</strong></td><td>${esc(student.teacherName || "—")}</td><td>${esc(student.classroom || "—")}</td><td><span class="pill-row">${pill(student.active ? "Active" : "Inactive", student.active ? "accent" : "neutral")}${student.paceEnabled ? pill("PACE", "accent") : ""}${student.dailyPulseEnabled ? pill("Daily Pulse", "accent") : ""}</span></td></tr>`).join("");
  return `<section class="panel"><div class="table-toolbar"><div><h2>Students on the roster</h2><p>${query ? `${rows.length} of ${all.length}` : `${all.length} student${all.length === 1 ? "" : "s"}`} · Changes to existing students are made in MAC-Walkthrough</p></div><label class="search-field"><span>Search</span><input id="rosterSearch" type="search" placeholder="Student, teacher, classroom" value="${esc(ui.search ?? "")}"></label></div>${rows.length ? `<div class="table-scroll"><table class="roster-table"><thead><tr><th>Student</th><th>Teacher</th><th>Classroom</th><th>Status</th></tr></thead><tbody>${body}</tbody></table></div>` : emptyState(all.length ? "No students match" : "No students yet", all.length ? "Try a different search." : "Use Add a student to create the first one.")}</section>`;
}

export function renderRosterStudents(roster, ui) {
  const top = header("Student Roster", "Add students so they can be chosen in MAC-Walkthrough, PACE and Daily Pulse.", "Students");
  const unavailable = rosterUnavailable(roster);
  // A save's result stays visible even if the reload after it failed.
  return top + (unavailable ? notice(ui.notice) + unavailable : `<div class="roster-columns">${studentForm(roster, ui)}${studentList(roster, ui)}</div>`);
}

function teacherForm(ui) {
  const draft = ui.teacher; const off = ui.saving;
  return `<section class="panel"><div class="panel-heading"><div><h2>Add a teacher</h2><p>Saved to ${esc(CONFIG.lists.users)} as an active ${esc(CONFIG.roster.teacherRole)}.</p></div></div>${notice(ui.notice)}<form class="roster-form" data-roster-form="teacher" novalidate><div class="form-grid single">${field("Name *", input("rosterTeacherName", "teacher.name", draft.name, "Last, First", off))}${field("Email *", input("rosterTeacherEmail", "teacher.email", draft.email, "name@iu29.org", off, ' inputmode="email" maxlength="120"'))}${field("Role", `<span class="fixed-value">${esc(CONFIG.roster.teacherRole)}</span>`)}</div><p class="form-help">The teacher can then be picked for students here and in MAC-Walkthrough, and can sign in to the IEP Skook apps with this email. Adding a teacher does not give them access to Admin Hub.</p><div class="form-actions"><button type="submit" class="button primary"${off ? " disabled" : ""}>${off ? "Saving…" : "Add teacher"}</button></div></form></section>`;
}

function teacherList(roster) {
  const teachers = activeTeachers(roster.staff);
  return `<section class="panel"><div class="panel-heading"><div><h2>Active teachers</h2><p>${teachers.length} teacher${teachers.length === 1 ? "" : "s"} · Active users whose role includes Teacher</p></div></div>${teachers.length ? `<div class="table-scroll"><table class="roster-table"><thead><tr><th>Name</th><th>Email</th></tr></thead><tbody>${teachers.map(person => `<tr><td><strong>${esc(person.name)}</strong></td><td>${esc(person.email || "—")}</td></tr>`).join("")}</tbody></table></div>` : emptyState("No teachers yet", "Use Add a teacher to create the first one.")}</section>`;
}

export function renderRosterTeachers(roster, ui) {
  const top = header("Teachers", "Add teachers so students can be assigned to them.", "Teachers");
  const unavailable = rosterUnavailable(roster);
  return top + (unavailable ? notice(ui.notice) + unavailable : `<div class="roster-columns">${teacherForm(ui)}${teacherList(roster)}</div>`);
}

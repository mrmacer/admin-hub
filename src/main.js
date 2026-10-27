import { CONFIG } from "./config.js";
import { dateRangeForPreset } from "./date-utils.js";
import { PACE_DATA } from "./modules/pace/pace-data.js";
import { renderApp, renderError, renderLoading, renderLogin, renderUnauthorized } from "./app-shell.js";
import { currentRoute, go } from "./router.js";
import { rangeFromControls } from "./components/date-range.js";
import { applyFollowUpAction } from "./modules/pace/pace-follow-up.js";
import { localDateString } from "./date-utils.js";
import { esc } from "./components/html.js";
import { ROSTER } from "./modules/roster/roster-data.js";
import { cleanStudentDraft, describeResult, findDuplicateStudents, findStaffByEmail, isValidEmail } from "./modules/roster/roster-model.js";

const root = document.querySelector("#app");
let AUTH = null; let GRAPH = null; let APP_USERS = null;
const newStudent = () => ({ first: "", last: "", teacher: "", classroom: "", ...CONFIG.roster.studentDefaults });
const state = { followUpEnabled: CONFIG.followUp.enabled, range: dateRangeForPreset("today"), visits: [], followUps: {}, userName: "", studentsSearch: "", studentsSort: "visits", activityFilters: {}, activeVisitId: null, roster: { student: newStudent(), teacher: { name: "", email: "" }, search: "", saving: false, notice: null, duplicates: null } };

// Re-rendering replaces every element, including the search box being typed
// in, so put the cursor back where it was afterwards.
function paint() {
  const active = document.activeElement;
  const typing = active?.tagName === "INPUT" && ["search", "text"].includes(active.type);
  const selector = !typing ? null : active.id ? `#${active.id}` : active.dataset.activityFilter ? `[data-activity-filter="${active.dataset.activityFilter}"]` : null;
  const { selectionStart, selectionEnd } = active ?? {};
  root.innerHTML = renderApp(state);
  const next = selector && root.querySelector(selector);
  if (next) { next.focus(); next.setSelectionRange(selectionStart, selectionEnd); }
}

async function loadMsal() {
  if (window.msal) return;
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/@azure/msal-browser@2/lib/msal-browser.min.js";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Microsoft sign-in library could not load."));
    document.head.appendChild(script);
  });
}

async function loadData(force = false) {
  const result = await PACE_DATA.load(state.range, force); state.visits = result.visits;
  paint();
}

// The roster is only read once someone opens a roster page.
async function showRoute() {
  state.activeVisitId = null; state.roster.notice = null; state.roster.duplicates = null;
  paint();
  if (currentRoute().page.startsWith("roster-") && !ROSTER.loaded) { await ROSTER.ensureLoaded(); paint(); }
}

async function reloadRoster() { const loading = ROSTER.load(); paint(); await loading; paint(); }

function rosterNotice(tone, text) { state.roster.notice = { tone, text }; state.roster.duplicates = null; paint(); }

async function saveToRoster(save, label, noun, onSaved) {
  const ui = state.roster;
  ui.saving = true; ui.notice = null; ui.duplicates = null; paint();
  const result = await save();
  ui.saving = false;
  const message = describeResult(result, label, noun);
  if (message.ok) onSaved();
  rosterNotice(message.ok ? "success" : "error", message.text);
}

async function addStudent(allowDuplicate = false) {
  const ui = state.roster;
  if (ui.saving) return;
  const draft = cleanStudentDraft(ui.student);
  if (!draft.first || !draft.last) return rosterNotice("error", "Enter the student's first and last name.");
  if (!draft.teacher) return rosterNotice("error", "Choose a teacher.");
  if (!ROSTER.complete) return rosterNotice("error", "The roster is not fully loaded, so duplicates can't be ruled out. Reload it and try again.");
  if (!allowDuplicate) {
    const matches = findDuplicateStudents(ROSTER.students, draft.first, draft.last);
    if (matches.length) { ui.notice = null; ui.duplicates = matches; paint(); return; }
  }
  // Teacher, classroom and the switches stay filled in for the next student in the same class.
  await saveToRoster(() => ROSTER.addStudent(draft), `"${draft.first} ${draft.last}"`, "Student", () => { ui.student = { ...ui.student, first: "", last: "" }; });
  root.querySelector("#rosterFirst")?.focus();
}

async function addTeacher() {
  const ui = state.roster;
  if (ui.saving) return;
  const draft = { name: ui.teacher.name.replace(/\s+/g, " ").trim(), email: ui.teacher.email.trim() };
  if (!draft.name) return rosterNotice("error", "Enter the teacher's name as Last, First.");
  if (!isValidEmail(draft.email)) return rosterNotice("error", "Enter the teacher's full email address.");
  if (!ROSTER.complete) return rosterNotice("error", "The roster is not fully loaded, so duplicates can't be ruled out. Reload it and try again.");
  // Sign-in looks people up by email, so a second row for the same email is never added.
  const [existing] = findStaffByEmail(ROSTER.staff, draft.email);
  if (existing) return rosterNotice("error", `${draft.email} is already in ${CONFIG.lists.users} as ${existing.name || "an unnamed user"} (${existing.role || "no role"}, ${existing.active ? "active" : "inactive"}). Nothing was added. Changes to existing users are made in MAC-Walkthrough Setup.`);
  await saveToRoster(() => ROSTER.addTeacher(draft), `"${draft.name}"`, "Teacher", () => { ui.teacher = { name: "", email: "" }; });
}

function setRosterField(target) {
  const [form, key] = target.dataset.rosterField.split(".");
  state.roster[form][key] = target.type === "checkbox" ? target.checked : target.value;
}

async function boot() {
  root.innerHTML = renderLoading();
  try {
    await loadMsal();
    const [{ AUTH: auth }, { GRAPH: graph }, { APP_USERS: appUsers }] = await Promise.all([import("./auth.js"), import("./graph.js"), import("./authorization.js")]);
    AUTH = auth; GRAPH = graph; APP_USERS = appUsers; window.AUTH = AUTH; window.GRAPH = GRAPH;
    await AUTH.init();
    if (!AUTH.account) { root.innerHTML = renderLogin(AUTH.signInError); return; }
    if (!AUTH.isAuthenticated) { root.innerHTML = renderUnauthorized(AUTH.error || "Your account is not approved for Admin Hub."); return; }
    const decision = await APP_USERS.authorize();
    if (!decision.allowed) { root.innerHTML = renderUnauthorized("Your account is not authorized for Admin Hub.", APP_USERS.error ? "Permission verification failed. Please try again later." : APP_USERS.authorizationNote); return; }
    state.userName = AUTH.displayName;
    ROSTER.writeAllowed = decision.allowed;
    await loadData();
    if (currentRoute().page.startsWith("roster-")) await showRoute();
  } catch (error) {
    console.error(error); root.innerHTML = renderError("Admin Hub could not load", `We could not load the workspace right now. ${esc(error?.message || "Check your connection and try again.")}`);
  }
}

document.addEventListener("click", event => {
  const followUpAction = event.target.closest("[data-follow-up-action]");
  if (followUpAction && state.followUpEnabled) {
    const activeVisit = state.visits.find(item => item.id === state.activeVisitId);
    if (!activeVisit) return;
    const note = root.querySelector("#followUpNote")?.value ?? "";
    const action = followUpAction.dataset.followUpAction;
    const actor = state.userName;
    try { state.followUps = applyFollowUpAction(state.followUps, activeVisit, action, { actor, date: localDateString(), note }); paint(); } catch (error) { console.error(error); }
    return;
  }
  const rosterAction = event.target.closest("[data-roster-action]")?.dataset.rosterAction;
  if (rosterAction === "reload") { reloadRoster(); return; }
  if (rosterAction === "add-anyway") { addStudent(true); return; }
  if (rosterAction === "dismiss-duplicates") { state.roster.duplicates = null; paint(); return; }
  const close = event.target.closest("[data-close-modal]");
  if (close) { state.activeVisitId = null; paint(); return; }
  const visit = event.target.closest("[data-visit]");
  if (visit) { state.activeVisitId = visit.dataset.visit; paint(); return; }
  const student = event.target.closest("[data-student]");
  if (student && !event.target.closest("a")) { go(`pace/students/${encodeURIComponent(student.dataset.student)}`); return; }
  const sort = event.target.closest("[data-sort]");
  if (sort) { state.studentsSort = sort.dataset.sort; paint(); return; }
  if (event.target.closest("#signIn")) { AUTH?.login(); return; }
  if (event.target.closest("#signOut")) { AUTH?.logout(); return; }
});

document.addEventListener("change", async event => {
  if (event.target.id === "datePreset" || event.target.id === "rangeFrom" || event.target.id === "rangeTo") {
    const control = event.target.closest(".date-control"); state.range = rangeFromControls(control, state.range); state.activeVisitId = null; try { await loadData(true); } catch { root.innerHTML = renderError("PACE data could not load", "The date range could not be loaded. Please try again."); } return;
  }
  if (event.target.dataset.rosterField && event.target.type !== "text") { setRosterField(event.target); return; }
  // Text boxes are handled on "input". Chrome also fires "change" when a redraw
  // removes the box being typed in, and repainting then would drop the cursor.
  const filter = event.target.closest("[data-activity-filter]");
  if (filter && filter.tagName !== "INPUT") { state.activityFilters[filter.dataset.activityFilter] = filter.value; paint(); }
});

document.addEventListener("input", event => {
  if (event.target.id === "studentsSearch") { state.studentsSearch = event.target.value; paint(); }
  if (event.target.id === "rosterSearch") { state.roster.search = event.target.value; paint(); }
  // Form fields only record what was typed; nothing needs redrawing until a save.
  if (event.target.dataset.rosterField && event.target.type === "text") setRosterField(event.target);
  const filter = event.target.closest("[data-activity-filter]");
  if (filter && filter.tagName === "INPUT") { state.activityFilters[filter.dataset.activityFilter] = filter.value; paint(); }
});

document.addEventListener("submit", event => {
  const form = event.target.closest("[data-roster-form]");
  if (!form) return;
  event.preventDefault();
  if (form.dataset.rosterForm === "student") addStudent(); else addTeacher();
});

window.addEventListener("hashchange", showRoute);
boot();

import { APP_ENV } from "./environment.js";
import { dateRangeForPreset } from "./date-utils.js";
import { PACE_DATA } from "./modules/pace/pace-data.js";
import { renderApp, renderError, renderLoading, renderLogin, renderUnauthorized } from "./app-shell.js";
import { currentRoute, go } from "./router.js";
import { rangeFromControls } from "./components/date-range.js";
import { applyFollowUpAction, seedFollowUps } from "./modules/pace/pace-follow-up.js";
import { localDateString } from "./date-utils.js";

const root = document.querySelector("#app");
let AUTH = null; let GRAPH = null; let APP_USERS = null;
const state = { demo: APP_ENV === "demo", range: dateRangeForPreset("today"), visits: [], followUps: {}, followUpsSeeded: false, userName: "", studentsSearch: "", studentsSort: "visits", activityFilters: {}, activeVisitId: null };

function paint() { root.innerHTML = renderApp(state); }

async function loadMsalForProduction() {
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
  if (state.demo && !state.followUpsSeeded) { state.followUps = seedFollowUps(state.visits); state.followUpsSeeded = true; }
  paint();
}

async function boot() {
  root.innerHTML = renderLoading();
  try {
    if (APP_ENV === "invalid") { root.innerHTML = renderError("Admin Hub environment is invalid", "This build was stopped safely. Rebuild with an explicit demo or production environment."); return; }
    if (APP_ENV === "production") {
      await loadMsalForProduction();
      const [{ AUTH: auth }, { GRAPH: graph }, { APP_USERS: appUsers }] = await Promise.all([import("./auth.js"), import("./graph.js"), import("./authorization.js")]);
      AUTH = auth; GRAPH = graph; APP_USERS = appUsers; window.AUTH = AUTH; window.GRAPH = GRAPH;
      await AUTH.init();
      if (!AUTH.account) { root.innerHTML = renderLogin(); return; }
      if (!AUTH.isAuthenticated) { root.innerHTML = renderUnauthorized(AUTH.error || "Your account is not approved for Admin Hub."); return; }
      const decision = await APP_USERS.authorize();
      if (!decision.allowed) { root.innerHTML = renderUnauthorized("Your account is not authorized for Admin Hub.", APP_USERS.error ? "Permission verification failed. Please try again later." : APP_USERS.authorizationNote); return; }
      state.userName = AUTH.displayName;
    } else {
      state.userName = "Demo Administrator";
    }
    await loadData();
  } catch (error) {
    console.error(error); root.innerHTML = renderError("Admin Hub could not load", "We could not load the workspace right now. Check your connection or open demo mode for a local review.");
  }
}

document.addEventListener("click", event => {
  const followUpAction = event.target.closest("[data-follow-up-action]");
  if (followUpAction && state.demo) {
    const activeVisit = state.visits.find(item => item.id === state.activeVisitId);
    if (!activeVisit) return;
    const note = root.querySelector("#followUpNote")?.value ?? "";
    const action = followUpAction.dataset.followUpAction;
    const actor = action === "start-review" ? "Morgan Reed — Behavior Specialist" : "Jordan Ellis — Administrator";
    try { state.followUps = applyFollowUpAction(state.followUps, activeVisit, action, { actor, date: localDateString(), note }); paint(); } catch (error) { console.error(error); }
    return;
  }
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
  const filter = event.target.closest("[data-activity-filter]");
  if (filter) { state.activityFilters[filter.dataset.activityFilter] = filter.value; paint(); }
});

document.addEventListener("input", event => {
  if (event.target.id === "studentsSearch") { state.studentsSearch = event.target.value; paint(); }
  const filter = event.target.closest("[data-activity-filter]");
  if (filter && filter.tagName === "INPUT") { state.activityFilters[filter.dataset.activityFilter] = filter.value; paint(); }
});

window.addEventListener("hashchange", () => { state.activeVisitId = null; paint(); });
boot();

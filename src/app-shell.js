import { currentRoute } from "./router.js";
import { renderActivity, renderHome, renderOverview, renderStudentDetail, renderStudents } from "./modules/pace/pace-views.js";

const nav = [{ page: "home", label: "Home", icon: "⌂" }, { page: "pace", label: "PACE Overview", icon: "P" }, { page: "students", label: "Students", icon: "S" }, { page: "activity", label: "Activity Log", icon: "≡" }];

function shell(state, content) {
  const route = currentRoute();
  return `<div class="app-frame"><aside class="sidebar"><div class="brand"><div class="brand-mark">IU</div><div><strong>Admin Hub</strong><span>PACE dashboard</span></div></div><nav aria-label="Main navigation"><div class="nav-label">PACE workspace</div>${nav.map(item => `<a class="nav-item ${route.page === item.page || (item.page === "pace" && ["student-detail"].includes(route.page)) ? "active" : ""}" href="#/${item.page === "home" ? "home" : item.page === "pace" ? "pace" : `pace/${item.page}`}" data-nav>${`<span class="nav-icon">${item.icon}</span>${item.label}`}</a>`).join("")}</nav><div class="sidebar-footer"><span class="status-dot"></span><span>Connected</span></div></aside><main class="main-content"><header class="topbar"><div class="mobile-brand"><div class="brand-mark">IU</div><strong>Admin Hub</strong></div><div class="topbar-spacer"></div><div class="user-menu"><span class="user-avatar">${(state.userName || "A").slice(0, 1).toUpperCase()}</span><span>${state.userName || "Administrator"}</span><button id="signOut" class="text-button">Sign out</button></div></header><div class="content-wrap">${content}</div></main></div>`;
}

export function renderApp(state) {
  const route = currentRoute(); const activeVisit = state.activeVisitId ? state.visits.find(visit => visit.id === state.activeVisitId) : null;
  let content = renderHome();
  if (route.page === "pace") content = renderOverview(state.visits, state.range, state.followUps, activeVisit, state.followUpEnabled);
  if (route.page === "students") content = renderStudents(state.visits, state.range, state, activeVisit);
  if (route.page === "student-detail") content = renderStudentDetail(state.visits, state.range, route.student, state.followUps, activeVisit, state.followUpEnabled);
  if (route.page === "activity") content = renderActivity(state.visits, state.range, state, activeVisit);
  return shell(state, content);
}

export function renderLoading(message = "Loading Admin Hub…") { return `<div class="center-state"><div class="spinner"></div><h1>${message}</h1><p>Connecting to the administrative workspace.</p></div>`; }
export function renderError(title, message) { return `<div class="center-state error-state"><div class="error-mark">!</div><h1>${title}</h1><p>${message}</p></div>`; }
export function renderLogin() { return `<div class="center-state login-state"><div class="brand-mark large">IU</div><div class="eyebrow">IU29 ADMINISTRATIVE SYSTEMS</div><h1>Admin Hub</h1><p>Sign in with your IU29 Microsoft account to view administrative operational data.</p><button id="signIn" class="button primary">Sign in with Microsoft</button><p class="login-note">This is the controlled production environment.</p></div>`; }
export function renderUnauthorized(message, note = "") { return `<div class="center-state error-state"><div class="lock-mark">⌑</div><h1>Admin Hub access required</h1><p>${message}</p>${note ? `<p class="auth-note">${note}</p>` : ""}<p class="login-note">Access is controlled separately from MAC Admin Panel permission.</p><button id="signOut" class="button secondary">Sign out</button></div>`; }

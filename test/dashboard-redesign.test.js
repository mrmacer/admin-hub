import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { makeDemoVisits } from "../src/demo-data.js";
import { dateRangeForPreset } from "../src/date-utils.js";
import { normalizeVisit } from "../src/modules/pace/pace-analytics.js";
import { renderHome } from "../src/modules/pace/pace-views.js";

const root = new URL("../", import.meta.url);

async function readProjectFile(path) {
  return readFile(new URL(path, root), "utf8");
}

test("Admin Hub reuses the IU29 logo and keeps the existing PACE navigation", async () => {
  const shell = await readProjectFile("src/app-shell.js");
  const logo = await readFile(new URL("assets/iu29-logo.png", root));

  assert.deepEqual([...logo.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.match(shell, /assets\/iu29-logo\.png/);
  for (const label of ["Home", "PACE Overview", "Students", "Activity Log", "Student Roster", "Teachers"]) assert.match(shell, new RegExp(label));
  assert.match(shell, /disabled-nav/);
  assert.match(shell, /Admin Hub/);
  assert.match(shell, /PACE Operations &amp; Insights/);
});

test("Admin Hub uses the distinct teal operational theme", async () => {
  const css = await readProjectFile("styles.css");
  for (const token of ["#0f766e", "#115e59", "#102a43", "#f3f6fa", "#172b4d", "#64748b"]) {
    assert.match(css.toLowerCase(), new RegExp(token));
  }
  assert.match(css, /\.sidebar\s*\{[^}]*width:\s*240px/s);
  assert.match(css, /\.topbar-heading\s*\{/);
});

test("Admin Dashboard home is the compact PACE operational view", () => {
  const visits = makeDemoVisits("2026-11-12").map(normalizeVisit);
  const html = renderHome(visits, dateRangeForPreset("30", "2026-11-12"), {}, null, true);

  assert.match(html, /<h1>Admin Dashboard<\/h1>/);
  assert.match(html, /PACE Operations &amp; Insights/);
  assert.match(html, /PACE visits/);
  assert.match(html, /Visits over time/);
  assert.doesNotMatch(html, /home-hero/);
  assert.match(html, /trend-chart-viewport/);
});

test("demo shell keeps the synthetic-data notice and confines chart scrolling", async () => {
  const shell = await readProjectFile("src/app-shell.js");
  const css = await readProjectFile("styles.css");

  assert.match(shell, /DEMO_MODE_NOTICE/);
  assert.match(shell, /state\.demo \? `?<div class="demo-banner"/);
  assert.match(css, /\.trend-chart-viewport\s*\{[^}]*overflow-x:\s*auto/s);
  assert.match(css, /\.trend-chart-viewport\s*\{[^}]*overflow-y:\s*hidden/s);
  assert.match(css, /\.trend-chart\s*\{[^}]*width:\s*max-content/s);
  assert.match(css, /\.trend-chart-viewport:focus-visible/);
  assert.match(css, /\.main-content\s*\{[^}]*min-width:\s*0/s);
  assert.match(css, /\.overview-grid\s*\{[^}]*min-width:\s*0/s);
  assert.match(css, /@media\s*\(max-width:\s*850px\)[\s\S]*?\.date-control\s*\{[^}]*width:\s*100%/);
});

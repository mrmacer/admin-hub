import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DEFAULT_PACE_RANGE_PRESET } from "../src/config.js";
import { dateRangeForPreset, formatDateRange } from "../src/date-utils.js";
import { makeDemoVisits } from "../src/demo-data.js";
import { calculateVisitCount, normalizeVisit, summarize } from "../src/modules/pace/pace-analytics.js";
import { renderActivity, renderOverview } from "../src/modules/pace/pace-views.js";
import { rangeFromControls } from "../src/components/date-range.js";

const visits = makeDemoVisits("2026-11-12").map(normalizeVisit);

test("PACE Overview defaults to 30 Days without changing date filtering", () => {
  assert.equal(DEFAULT_PACE_RANGE_PRESET, "30");
  const initialRange = dateRangeForPreset(DEFAULT_PACE_RANGE_PRESET, "2026-11-12");
  assert.equal(initialRange.preset, "30");
  assert.equal(initialRange.from, "2026-10-14");
  assert.equal(initialRange.to, "2026-11-12");
  assert.equal(summarize(visits, initialRange).visits, calculateVisitCount(visits.filter(visit => visit.date >= initialRange.from && visit.date <= initialRange.to)));
});
test("historical activity keeps editing available outside the default analytics window", () => {
  const historicalRange = { preset: "custom", from: "2026-01-01", to: "2026-12-31", label: "Custom" };
  const html = renderActivity(visits, historicalRange, { demo: true, followUps: {}, adminReviews: {}, activityFilters: {} }, null);
  assert.match(html, /Custom range/);
  assert.match(html, /data-open-visit="/);
  assert.match(html, /Edit Submission/);
});

test("a source change after review is visibly marked for re-review", () => {
  const visit = { ...visits[0], adminVersion: 2 };
  const html = renderOverview([visit], dateRangeForPreset("30", "2026-11-12"), {}, visit, true, {}, { [visit.id]: { status: "reviewed", sourceVersion: 1, notes: [], followUpStatus: "open", history: [] } });
  assert.match(html, /changed after it was reviewed/);
});

test("explicitly selected ranges remain supported", () => {
  const sevenDays = dateRangeForPreset("7", "2026-11-12");
  const fakeControl = { querySelector(selector) { return selector === "#datePreset" ? { value: "7" } : null; } };
  assert.equal(rangeFromControls(fakeControl, dateRangeForPreset("30", "2026-11-12")).preset, "7");
  assert.equal(sevenDays.from, "2026-11-06");
  assert.equal(sevenDays.to, "2026-11-12");
});

test("selected range synchronizes overview metrics and all 30 date buckets stay accessible", async () => {
  const range = dateRangeForPreset("30", "2026-11-12");
  const html = renderOverview(visits, range, {}, null, false);
  const selected = summarize(visits, range);
  assert.match(html, new RegExp(`${selected.visits} completed`));
  assert.match(html, new RegExp(formatDateRange(range).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(html, /class="trend-chart-viewport"[^>]*role="region"/);
  assert.match(html, /style="--trend-min-width:1320px"/);
  assert.equal((html.match(/class="trend-column"/g) ?? []).length, 30);

  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(css, /\.trend-chart-viewport[^\{]*\{[^}]*overflow-x:\s*auto/s);
  assert.match(css, /\.trend-chart-viewport[^\{]*\{[^}]*min-width:\s*0/s);
  assert.match(css, /\.overview-grid[^\{]*\{[^}]*min-width:\s*0/s);
  assert.match(css, /\.trend-panel[^\{]*\{[^}]*min-width:\s*0/s);
});

test("narrow layout keeps the page contained while the chart owns horizontal scrolling", async () => {
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(css, /\.trend-chart-viewport[^\{]*\{[^}]*max-width:\s*100%/s);
  assert.match(css, /\.trend-chart[^\{]*\{[^}]*width:\s*max-content/s);
  assert.match(css, /\.trend-column[^\{]*\{[^}]*flex:\s*0\s+0\s+36px/s);
  assert.match(css, /\.main-content[^\{]*\{[^}]*min-width:\s*0/s);
  assert.match(css, /\.panel[^\{]*\{[^}]*min-width:\s*0/s);
  assert.match(css, /@media\s*\(max-width:\s*850px\)[\s\S]*?\.date-control\s*\{[^}]*width:\s*100%/);
  assert.match(css, /\.trend-chart-viewport:focus-visible/);
});

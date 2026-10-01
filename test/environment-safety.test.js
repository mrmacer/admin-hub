import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { APP_ENV, normalizeEnvironment } from "../src/environment.js";
import { AUTH } from "../src/auth.js";
import { GRAPH } from "../src/graph.js";
import { APP_USERS } from "../src/authorization.js";
import { PACE_DATA } from "../src/modules/pace/pace-data.js";
import { DEMO_DATASET_META, makeDemoVisits } from "../src/demo-data.js";
import { dateRangeForPreset } from "../src/date-utils.js";
import { filterVisits, normalizeVisit, summarize } from "../src/modules/pace/pace-analytics.js";

test("the checked-in build is demo and URL/storage cannot switch it", () => {
  assert.equal(APP_ENV, "demo");
  global.window = { location: { search: "?production=1" } };
  global.localStorage = { getItem: () => "production" };
  global.sessionStorage = { getItem: () => "production" };
  assert.equal(APP_ENV, "demo");
});

test("unknown environment values fail closed", () => {
  assert.throws(() => normalizeEnvironment("staging"), /Unknown Admin Hub environment/);
});

test("demo boot skips MSAL, login, Graph, SharePoint, and IEP_App_Users", async () => {
  let msalConstructed = false; let graphRequested = false;
  global.window = { msal: { PublicClientApplication: class { constructor() { msalConstructed = true; } } }, AUTH: { acquireGraphToken: () => { graphRequested = true; } } };
  await AUTH.init();
  AUTH.login();
  assert.equal(msalConstructed, false);
  assert.equal(graphRequested, false);
  await assert.rejects(() => AUTH.acquireGraphToken(), /disabled outside production/);
  await assert.rejects(() => GRAPH.getSiteId(), /Demo environment safety block/);
  await assert.rejects(() => GRAPH.getListItems("IEP_Pace_Visits"), /Demo environment safety block/);
  const decision = await APP_USERS.authorize();
  assert.equal(decision.allowed, true);
  assert.equal(decision.reason, "demo-environment");
  const data = await PACE_DATA.load(dateRangeForPreset("today", "2026-10-01"), true);
  assert.equal(data.visits.length, 184);
});

test("synthetic dataset is fictional, complete, and useful across all ranges", () => {
  const raw = makeDemoVisits("2026-10-01");
  assert.equal(raw.length, 184);
  assert.equal(new Set(raw.map(row => row.Student)).size, DEMO_DATASET_META.studentCount);
  assert.ok(raw.every(row => row.id.startsWith("demo-") && row.Student.startsWith("Demo Student ")));
  assert.ok(raw.every(row => row["Behavior Specialist"].startsWith("Specialist ")));
  assert.ok(raw.every(row => row["Teacher Came From"].startsWith("Classroom ")));
  assert.ok(raw.every(row => row.Date && row["Time In"] && Object.hasOwn(row, "Time Out") && Object.hasOwn(row, "Duration") && Object.hasOwn(row, "SCM Used")));
  const visits = raw.map(normalizeVisit);
  for (const preset of ["today", "7", "30", "90"]) {
    const selected = filterVisits(visits, dateRangeForPreset(preset, "2026-10-01"));
    assert.ok(selected.length > 0, `${preset} should have synthetic visits`);
    assert.ok(summarize(visits, dateRangeForPreset(preset, "2026-10-01")).visits > 0, `${preset} should have completed visits`);
  }
  assert.ok(visits.some(visit => !visit.isCompleted), "demo includes an open visit");
  assert.ok(visits.some(visit => visit.scmUsed === true), "demo includes SCM events");
});

test("demo environment source has no query or browser-storage switch", async () => {
  const source = await readFile(new URL("../src/environment.js", import.meta.url), "utf8");
  const index = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.doesNotMatch(source, /location\.search|localStorage|sessionStorage/);
  assert.doesNotMatch(index, /msal-browser/);
});

import { APP_ENV, CONFIG } from "../../config.js";
import { makeDemoVisits } from "../../demo-data.js";
import { normalizeVisit } from "./pace-analytics.js";

export const PACE_DATA = {
  cache: new Map(),
  async load(range, force = false) {
    const key = `${range.from}:${range.to}`;
    if (!force && this.cache.has(key)) return this.cache.get(key);
    if (APP_ENV !== "demo" && APP_ENV !== "production") throw new Error("PACE data is unavailable because the environment is invalid.");
    const raw = APP_ENV === "demo" ? makeDemoVisits() : await window.GRAPH.getPaceVisits(range);
    const visits = raw.map(normalizeVisit).filter(visit => visit.date);
    const value = { visits, loadedAt: new Date() };
    this.cache.set(key, value); return value;
  },
  clear() { this.cache.clear(); },
  sourceLabel: APP_ENV === "demo" ? "Synthetic demo data" : `${CONFIG.lists.paceVisits} via Microsoft Graph`
};

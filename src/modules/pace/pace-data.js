import { CONFIG } from "../../config.js";
import { normalizeVisit } from "./pace-analytics.js";

export const PACE_DATA = {
  cache: new Map(),
  async load(range, force = false) {
    const key = `${range.from}:${range.to}`;
    if (!force && this.cache.has(key)) return this.cache.get(key);
    const raw = await window.GRAPH.getPaceVisits(range);
    const visits = raw.map(normalizeVisit).filter(visit => visit.date);
    const value = { visits, loadedAt: new Date() };
    this.cache.set(key, value); return value;
  },
  clear() { this.cache.clear(); },
  sourceLabel: `${CONFIG.lists.paceVisits} via Microsoft Graph`
};

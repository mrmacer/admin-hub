import { APP_ENV as GENERATED_ENV } from "./generated-environment.js";

export function normalizeEnvironment(value) {
  if (value === "demo" || value === "production") return value;
  throw new Error(`Unknown Admin Hub environment: ${String(value || "(empty)")}`);
}

// An invalid generated value is represented as an invalid environment so the
// application can show a safe error instead of guessing production.
export const APP_ENV = (() => {
  try { return normalizeEnvironment(GENERATED_ENV); } catch { return "invalid"; }
})();

export const IS_DEMO = APP_ENV === "demo";
export const IS_PRODUCTION = APP_ENV === "production";

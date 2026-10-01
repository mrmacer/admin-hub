import { dateRangeForPreset, formatDateRange } from "../date-utils.js";
import { esc } from "./html.js";

export function dateRangeControl(range) {
  const preset = range.preset ?? "today";
  return `<div class="date-control"><label>Range <select id="datePreset"><option value="today" ${preset === "today" ? "selected" : ""}>Today</option><option value="7" ${preset === "7" ? "selected" : ""}>7 Days</option><option value="30" ${preset === "30" ? "selected" : ""}>30 Days</option><option value="90" ${preset === "90" ? "selected" : ""}>90 Days</option><option value="custom" ${preset === "custom" ? "selected" : ""}>Custom</option></select></label>${preset === "custom" ? `<label>From <input id="rangeFrom" type="date" value="${esc(range.from)}"></label><label>To <input id="rangeTo" type="date" value="${esc(range.to)}"></label>` : ""}<span class="range-label">${esc(formatDateRange(range))}</span></div>`;
}

export function rangeFromControls(root, current) {
  const preset = root.querySelector("#datePreset")?.value ?? current.preset;
  if (preset !== "custom") return dateRangeForPreset(preset);
  return { preset: "custom", from: root.querySelector("#rangeFrom")?.value || current.from, to: root.querySelector("#rangeTo")?.value || current.to, label: "Custom" };
}

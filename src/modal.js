// Modal dismissal is intentionally limited to the close control or the
// backdrop itself. A modal's form controls are descendants of the backdrop,
// so matching any [data-close-modal] ancestor would close the editor on every
// input, select, date, or time interaction.
export function isIntentionalModalDismissal(target) {
  if (!target) return false;
  if (typeof target.closest === "function" && target.closest(".modal-close")) return true;
  return Boolean(target.classList?.contains?.("modal-backdrop"));
}

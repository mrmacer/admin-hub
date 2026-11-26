import test from "node:test";
import assert from "node:assert/strict";
import { isIntentionalModalDismissal } from "../src/modal.js";

function target({ closest = null, classes = [] } = {}) {
  return { closest: selector => selector === ".modal-close" ? closest : null, classList: { contains: name => classes.includes(name) } };
}

test("modal controls do not count as backdrop dismissal", () => {
  assert.equal(isIntentionalModalDismissal(target()), false);
  assert.equal(isIntentionalModalDismissal(target({ classes: ["modal"] })), false);
});

test("only the close control or backdrop dismisses the modal", () => {
  assert.equal(isIntentionalModalDismissal(target({ closest: target() })), true);
  assert.equal(isIntentionalModalDismissal(target({ classes: ["modal-backdrop"] })), true);
});

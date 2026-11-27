import { test, expect } from "@playwright/test";

async function openDetail(page, index = 1) {
  await page.goto("/#/pace/activity");
  await page.evaluate(() => localStorage.removeItem("adminHubPaceDemoData"));
  await page.reload();
  const visit = page.locator("[data-open-visit]").nth(index);
  await expect(visit).toBeVisible();
  await visit.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

test("read-only detail stays interactive through refresh and preserves a failed-save draft", async ({ page }) => {
  const dialog = await openDetail(page);
  await expect(dialog.locator("#adminStudent")).toHaveCount(0);
  await expect(dialog.locator('[data-modal-action="edit"]')).toBeVisible();
  await dialog.locator('[data-modal-action="edit"]').click();
  await dialog.locator("#adminNotesSource").fill("Browser regression draft");
  await dialog.locator("#adminScm").selectOption("true");
  await dialog.locator("#adminDate").fill("2026-11-24");
  await dialog.locator("#adminTimeOut").fill("12:30");
  await page.waitForTimeout(30000);
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("#adminNotesSource")).toHaveValue("Browser regression draft");
  await expect(dialog.locator("#adminScm")).toHaveValue("true");
  await expect(dialog.locator("#adminDate")).toHaveValue("2026-11-24");
  await expect(dialog.locator("#adminTimeOut")).toHaveValue("12:30");

  await dialog.locator("#adminTimeOut").fill("not-a-time");
  await dialog.locator("#adminCorrectionReason").fill("Keep failed draft");
  await dialog.locator('[data-admin-action="edit"]').click();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("#adminTimeOut")).toHaveValue("not-a-time");
  await expect(dialog.locator("#adminCorrectionReason")).toHaveValue("Keep failed draft");
  await expect(dialog.locator(".admin-error")).toContainText("Time Out");
});

test("editor supports mobile interaction, intentional Escape dismissal, and a successful save", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const dialog = await openDetail(page);
  await dialog.locator('[data-modal-action="edit"]').click();
  await dialog.locator("#adminTimeOut").fill("12:30");
  await dialog.locator("#adminScm").selectOption("true");
  await dialog.locator("#adminCorrectionReason").fill("Mobile browser regression");
  page.once("dialog", dialogEvent => dialogEvent.accept());
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  const reopened = await openDetail(page);
  await reopened.locator('[data-modal-action="edit"]').click();
  await reopened.locator("#adminTimeOut").fill("12:30");
  await reopened.locator("#adminCorrectionReason").fill("Mobile successful save");
  await reopened.locator('[data-admin-action="edit"]').click();
  await expect(page.getByRole("dialog").locator("#adminStudent")).toHaveCount(0);
  await expect(page.locator(".edited-indicator")).toBeVisible();
  await expect(page.locator(".admin-error")).toHaveCount(0);
});

test("detail actions support review flags and separate administrative notes", async ({ page }) => {
  const dialog = await openDetail(page);
  await dialog.locator('[data-modal-action="flag"]').click();
  await dialog.locator("#adminReviewReason").fill("Browser review flag");
  await dialog.locator("#adminFollowUpAssignedTo").fill("Morgan Reed");
  await dialog.locator("#adminFollowUpDueDate").fill("2026-11-30");
  await dialog.locator('[data-admin-action="save-flag"]').click();
  await expect(dialog.locator(".modal-statuses")).toContainText("Needs Review");
  await expect(dialog.locator(".follow-up-summary")).toContainText("Needs Review");

  await dialog.locator('[data-modal-action="add-note"]').click();
  await dialog.locator("#adminNoteText").fill("Browser administrative note");
  await dialog.locator('[data-admin-action="add-note"]').click();
  await expect(dialog.locator(".admin-note-row").filter({ hasText: "Browser administrative note" })).toBeVisible();
});

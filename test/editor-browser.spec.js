import { test, expect } from "@playwright/test";

async function openEditor(page) {
  await page.goto("/#/pace/activity");
  await page.evaluate(() => localStorage.removeItem("adminHubPaceDemoData"));
  await page.reload();
  const edit = page.locator("[data-open-visit]").first();
  await expect(edit).toBeVisible();
  await edit.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

test("editor remains interactive through refresh and preserves a failed-save draft", async ({ page }) => {
  const dialog = await openEditor(page);
  await dialog.locator("#adminNotesSource").fill("Browser regression draft");
  await dialog.locator("#adminReviewStatus").selectOption("reviewed");
  await dialog.locator("#adminDate").fill("2026-11-24");
  await dialog.locator("#adminTimeOut").fill("12:30");
  await page.waitForTimeout(30000);
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("#adminNotesSource")).toHaveValue("Browser regression draft");
  await expect(dialog.locator("#adminReviewStatus")).toHaveValue("reviewed");
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
  const dialog = await openEditor(page);
  await dialog.locator("#adminTimeOut").fill("12:30");
  await dialog.locator("#adminScm").selectOption("true");
  await dialog.locator("#adminCorrectionReason").fill("Mobile browser regression");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  const reopened = await openEditor(page);
  await reopened.locator("#adminTimeOut").fill("12:30");
  await reopened.locator("#adminCorrectionReason").fill("Mobile successful save");
  await reopened.locator('[data-admin-action="edit"]').click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator(".admin-error")).toHaveCount(0);
});

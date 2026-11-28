import { test, expect } from "@playwright/test";

const reviewDir = "docs/visual-review";

async function resetDirectoryDemo(page, path = "/#/roster/students") {
  await page.goto(path);
  await page.evaluate(() => localStorage.removeItem("adminHubPaceDemoData"));
  await page.reload();
  await expect(page.locator(".directory-panel")).toBeVisible();
}

test("student directory supports overview, profile, add, edit and preserved history", async ({ page }) => {
  await resetDirectoryDemo(page);
  await page.screenshot({ path: `${reviewDir}/admin-hub-v14-student-roster.png`, fullPage: false });

  await page.locator("[data-directory-open='student']").first().click();
  await expect(page.locator(".profile-card")).toBeVisible();
  await page.screenshot({ path: `${reviewDir}/admin-hub-v14-student-profile.png`, fullPage: false });

  await page.getByRole("button", { name: "Edit student information" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.screenshot({ path: `${reviewDir}/admin-hub-v14-student-edit.png`, fullPage: false });
  await page.locator("#directoryStudentClassroom").fill("Classroom Gamma");
  await page.getByRole("button", { name: "Save student" }).click();
  await expect(page.getByRole("status")).toContainText("updated successfully");
  await expect(page.locator(".directory-history-list li")).toHaveCount(2);
  await page.screenshot({ path: `${reviewDir}/admin-hub-v14-student-history.png`, fullPage: false });

  await page.getByRole("link", { name: /Back to Student Roster/ }).click();
  await page.getByRole("button", { name: "Add Student" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.screenshot({ path: `${reviewDir}/admin-hub-v14-student-add.png`, fullPage: false });
  await page.locator("#directoryStudentFirst").fill("Demo");
  await page.locator("#directoryStudentLast").fill("New Student");
  await page.getByRole("button", { name: "Add student", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("added successfully");
});

test("staff directory supports profile, edit, lifecycle controls and mobile layout", async ({ page }) => {
  await resetDirectoryDemo(page, "/#/roster/teachers");
  await page.screenshot({ path: `${reviewDir}/admin-hub-v14-staff-overview.png`, fullPage: false });

  await page.locator("[data-directory-open='staff']").first().click();
  await expect(page.locator(".profile-card")).toBeVisible();
  await page.screenshot({ path: `${reviewDir}/admin-hub-v14-staff-profile.png`, fullPage: false });

  await page.getByRole("button", { name: "Edit staff information" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.screenshot({ path: `${reviewDir}/admin-hub-v14-staff-edit.png`, fullPage: false });
  await page.locator("#directoryStaffProgram").fill("Student Services");
  await page.getByRole("button", { name: "Save staff member" }).click();
  await expect(page.getByRole("status")).toContainText("updated successfully");
  await expect(page.locator(".directory-history-list li")).toHaveCount(2);

  await page.getByRole("button", { name: "Deactivate staff member" }).click();
  await expect(page.getByRole("dialog")).toContainText("Deactivate staff member");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/roster/students");
  await expect(page.locator(".directory-panel")).toBeVisible();
  await expect(page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).resolves.toBe(true);
  await page.screenshot({ path: `${reviewDir}/admin-hub-v14-directory-mobile.png`, fullPage: false });
});

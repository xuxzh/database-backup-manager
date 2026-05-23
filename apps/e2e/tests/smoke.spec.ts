import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.locator('input[name="username"]').fill("admin");
  await page.locator('input[name="password"]').fill("admin123");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.getByRole("navigation")).toContainText("仪表盘");
});

test("opens the primary application sections", async ({ page }) => {
  await page.getByRole("button", { name: "数据源" }).click();
  await expect(page.getByRole("main")).toContainText("数据源列表");

  await page.getByRole("button", { name: "备份目标" }).click();
  await expect(page.getByRole("main")).toContainText("备份目标列表");

  await page.getByRole("button", { name: "备份任务" }).click();
  await expect(page.getByRole("main")).toContainText("备份任务列表");

  await page.getByRole("button", { name: "运行记录" }).click();
  await expect(page.getByRole("main")).toContainText("运行记录");
});

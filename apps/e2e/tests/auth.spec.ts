import { expect, test } from "@playwright/test";

test("logs in with the default admin account", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[name="username"]').fill("admin");
  await page.locator('input[name="password"]').fill("admin123");
  await page.getByRole("button", { name: "登录" }).click();

  await expect(page.getByRole("navigation")).toContainText("仪表盘");
  await expect(page.getByRole("main")).toContainText("数据源");
});

test("shows an error for invalid credentials", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[name="username"]').fill("admin");
  await page.locator('input[name="password"]').fill("wrong-password");
  await page.getByRole("button", { name: "登录" }).click();

  await expect(page.getByText("用户名或密码错误")).toBeVisible();
});

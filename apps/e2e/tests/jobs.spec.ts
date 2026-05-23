import { expect, test } from "@playwright/test";
import { createSource, createTarget, login } from "../support/api";

test("creates, edits, and deletes a backup job through the UI", async ({ page, request }, testInfo) => {
  const suffix = `${Date.now()}-${testInfo.workerIndex}`;
  const token = await login(request);
  const source = await createSource(request, token, `e2e-source-${suffix}`);
  const target = await createTarget(request, token, `e2e-target-${suffix}`);
  const jobName = `e2e-job-${suffix}`;
  const editedJobName = `${jobName}-edited`;

  await page.goto("/");
  await page.locator('input[name="username"]').fill("admin");
  await page.locator('input[name="password"]').fill("admin123");
  await page.getByRole("button", { name: "登录" }).click();
  await page.getByRole("button", { name: "备份任务" }).click();

  await page.getByRole("button", { name: "新建备份任务" }).click();
  await expect(page.getByRole("dialog")).toContainText("新建备份任务");
  await page.locator('input[name="name"]').fill(jobName);

  await page.getByRole("combobox", { name: "数据源" }).click();
  await page.getByRole("option", { name: source.name }).click();
  await expect(page.locator('input[name="databaseName"]')).toHaveValue(source.databaseName);

  await page.getByRole("combobox", { name: "备份目标" }).click();
  await page.getByRole("option", { name: target.name }).click();
  await page.locator('input[name="schedule"]').fill("0 0 2 * * *");
  await page.locator('input[name="remoteRetentionDays"]').fill("14");
  await page.locator('input[name="localRetentionDays"]').fill("3");
  await page.getByRole("button", { name: "保存" }).click();

  await expect(page.getByRole("main")).toContainText(jobName);
  await expect(page.getByRole("main")).toContainText(source.name);
  await expect(page.getByRole("main")).toContainText(target.name);

  await page.getByRole("button", { name: "编辑备份任务" }).click();
  await page.locator('input[name="name"]').fill(editedJobName);
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByRole("main")).toContainText(editedJobName);

  await page.getByRole("button", { name: "删除备份任务" }).click();
  await expect(page.getByRole("dialog")).toContainText("确认删除");
  await page.getByRole("button", { name: "删除" }).click();
  await expect(page.getByRole("main")).not.toContainText(editedJobName);
});

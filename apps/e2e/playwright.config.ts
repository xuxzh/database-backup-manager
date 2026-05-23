import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(appDir, "../..");
const testDataDir = path.join(appDir, ".test-data");
const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:18080";
const localhostNoProxy = "127.0.0.1,localhost";

process.env.NO_PROXY = mergeNoProxy(process.env.NO_PROXY, localhostNoProxy);
process.env.no_proxy = mergeNoProxy(process.env.no_proxy, localhostNoProxy);

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: {
    command: "pnpm -C apps/web build && cargo run -p backup-manager",
    cwd: repoRoot,
    env: {
      PATH: process.env.PATH || "",
      HOME: process.env.HOME || "",
      BIND_ADDR: "127.0.0.1:18080",
      DATA_DIR: path.join(testDataDir, "data"),
      DATABASE_PATH: path.join(testDataDir, "data", "backup-manager.db"),
      BACKUPS_DIR: path.join(testDataDir, "backups"),
      ADMIN_USERNAME: "admin",
      ADMIN_PASSWORD: "admin123",
      APP_SECRET: "e2e-test-secret-change-me",
      NO_PROXY: process.env.NO_PROXY,
      no_proxy: process.env.no_proxy,
    },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: `${baseURL}/api/health`,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});

function mergeNoProxy(current: string | undefined, required: string): string {
  if (!current) return required;
  const entries = new Set(
    current
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
  for (const entry of required.split(",")) {
    entries.add(entry);
  }
  return Array.from(entries).join(",");
}

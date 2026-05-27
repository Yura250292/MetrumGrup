import { defineConfig, devices } from "@playwright/test";

/**
 * Beta smoke pack — golden-path scenarios for Closed Beta release gate.
 * Targets:
 *   - local: `npm run dev` on http://localhost:3000
 *   - CI: spin up `npm start` after build, override BASE_URL env.
 *
 * Add tests under e2e/. Each spec runs against a deterministic seed; see
 * prisma/seed-e2e.ts (TODO) for the test data layer.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: process.env.CI
    ? {
        command: "npm run start",
        port: 3000,
        reuseExistingServer: false,
        timeout: 120_000,
      }
    : undefined,
});

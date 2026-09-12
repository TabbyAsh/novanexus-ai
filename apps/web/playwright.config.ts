import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for production UI smoke tests.
 * Run with: npx playwright test
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  webServer:
    process.env.CONTRAST_START_SERVER === "1"
      ? {
          command: "npm run start",
          url: "http://127.0.0.1:4000/lab/contrast",
          reuseExistingServer: !process.env.CI,
          timeout: 60000,
        }
      : undefined,

  use: {
    // Base URL for production testing
    baseURL: process.env.PROD_WEB_URL || "https://novanexus-ai.com",
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});

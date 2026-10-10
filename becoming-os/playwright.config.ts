import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

// Runs against the Vite dev server with no backend: each test opens fresh
// browser contexts, so the app starts in device mode with empty IndexedDB.
// An already-running server on 8080 is reused; set E2E_BASE_URL to test a
// different build instead. Set PW_CHROMIUM to use a preinstalled browser.
const executablePath = process.env.PW_CHROMIUM ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:8080",
    trace: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
    screenshot: "only-on-failure",
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [{ name: "mobile", use: { ...devices["iPhone 13"], browserName: "chromium", defaultBrowserType: "chromium" } }],
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: "npx vite --port 8080 --strictPort",
    url: "http://localhost:8080",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});

import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Pick up E2E_BASE_URL from the same file the app reads.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  fullyParallel: false,
  use: { baseURL, trace: "retain-on-failure" },
  // Runs against an app that is already up (`npm run dev`, or a deployed test build).
  // E2E_CHANNEL=msedge (or chrome) uses an installed browser instead of `npx playwright install`.
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: process.env.E2E_CHANNEL } }],
});

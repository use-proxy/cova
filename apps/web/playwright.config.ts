import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";
import { resolve } from "path";

// Load .env.local so test helpers can access SUPABASE_SERVICE_ROLE_KEY,
// REPLICATE_API_TOKEN, E2E_TEST_PASSWORD, etc.
config({ path: resolve(__dirname, ".env.local"), override: true });

const PORT = process.env.E2E_PORT ?? "3001";
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  // Search both API contract tests and the e2e suite. Each project filters
  // down to its own files via testMatch below.
  testDir: "./tests",
  timeout: 240_000,
  // Zero tolerance: no .only(), no retries (a flake here is a real bug),
  // single worker (real APIs have rate limits and the render pipeline is
  // serialized).
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { outputFolder: "docs/test-reports", open: "never" }],
    ["json", { outputFile: "docs/test-results.json" }],
  ],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "api-contracts",
      testMatch: "api/**/*.test.ts",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // Full E2E suite. Depends on api-contracts so a contract failure
      // short-circuits the slower UI run.
      name: "e2e",
      testMatch: "e2e/**/*.spec.ts",
      testIgnore: "e2e/webhook-smoke.spec.ts",
      dependencies: ["api-contracts"],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // Smoke test — direct pipeline trigger, no browser UI needed.
      // No dependency on api-contracts, no global setup required.
      name: "smoke",
      testMatch: "e2e/webhook-smoke.spec.ts",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Block until the production server responds. Uses `next start` so all JS
  // chunks are pre-compiled — no lazy compilation MIME issues, no React
  // hydration races. Run `npm run build` before invoking playwright.
  globalSetup: "./tests/e2e/global-setup.ts",
  webServer: {
    command: `npm run start -- -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "ignore",
  },
});

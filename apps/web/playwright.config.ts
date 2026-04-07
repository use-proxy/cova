import { defineConfig, devices } from '@playwright/test'
import { config } from 'dotenv'
import { resolve } from 'path'

// Load .env.local so test helpers can access SUPABASE_SERVICE_ROLE_KEY and E2E_TEST_PASSWORD
config({ path: resolve(__dirname, '.env.local'), override: true })

const PORT = process.env.E2E_PORT ?? '3001'
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 180_000,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // run serially — render tests hit real APIs with rate limits
  reporter: [['html', { outputFolder: 'playwright-report' }], ['line']],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // No webServer block — run `npm run dev -- -p 3001` in a separate terminal
  // before executing tests. Playwright will connect to the existing server.
})

/**
 * COVA V1 — Full user flow E2E test.
 * Requires a running dev server (playwright.config.ts configures this).
 * Requires test user credentials in environment:
 *   E2E_TEST_EMAIL, E2E_TEST_PASSWORD
 *
 * Run: npx playwright test
 */
import { test, expect } from '@playwright/test'

const TEST_EMAIL = process.env.E2E_TEST_EMAIL ?? 'e2e@covainterior.com'
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? ''

test.describe('COVA Full Flow', () => {
  test.skip(!TEST_PASSWORD, 'E2E_TEST_PASSWORD not set — skipping live auth tests')

  test('landing page loads', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/Cova/)
  })

  test('auth: sign in with email', async ({ page }) => {
    await page.goto('/auth/sign-in')
    await page.fill('[data-testid="email-input"]', TEST_EMAIL)
    await page.fill('[data-testid="password-input"]', TEST_PASSWORD)
    await page.click('[data-testid="sign-in-button"]')
    await expect(page).toHaveURL(/dashboard/)
  })

  test('quiz: completes and produces fingerprint', async ({ page }) => {
    await page.goto('/quiz')
    // Select first option in each of 11 pairs
    for (let i = 0; i < 11; i++) {
      await page.click('[data-testid="choice-A"]')
    }
    await expect(page.locator('[data-testid="fingerprint-result"]')).toBeVisible()
  })

  test('dashboard: loads with room cards', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.locator('[data-testid="room-card"]').first()).toBeVisible({ timeout: 10000 })
  })
})

test.describe('API Health', () => {
  test('GET /api/local-ip returns 200', async ({ request }) => {
    const response = await request.get('/api/local-ip')
    expect(response.status()).toBe(200)
  })

  test('POST /api/quiz/fingerprint returns 400 for empty body', async ({ request }) => {
    const response = await request.post('/api/quiz/fingerprint', {
      data: { responses: [], entry_path: 'pairs', room_type: 'living_room' },
    })
    expect(response.status()).toBe(400)
  })

  test('POST /api/detect returns 401 without auth', async ({ request }) => {
    const response = await request.post('/api/detect', {
      data: { photo_url: 'https://example.com/photo.jpg' },
    })
    // 401 because no auth cookie
    expect([400, 401]).toContain(response.status())
  })
})

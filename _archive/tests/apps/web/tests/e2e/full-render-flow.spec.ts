/**
 * Full Render Flow E2E — Upload → Step-7c → Masks → Render
 *
 * Simulates a real user going from room upload through step-7c keep/remove
 * decisions, mask generation, and triggering a redesign render.
 *
 * Requires:
 *   - Production build running at BASE_URL (npm run build && npm run start)
 *   - E2E_TEST_EMAIL and E2E_TEST_PASSWORD in .env.local
 *   - Valid SUPABASE_SERVICE_ROLE_KEY, FAL_KEY, REDESIGN_PIPELINE_WEBHOOK_URL
 *
 * Cost per run: ~$1.50–$2.50 (fal.ai + Modal pipeline + Anthropic)
 * Runtime: ~5–10 minutes wall clock
 */

import { test, expect, type Page } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const BASE_URL = `http://localhost:${process.env.E2E_PORT ?? "3001"}`;
const TEST_PHOTO_PATH = path.join(__dirname, "../fixtures/test-room.jpg");
const OUTPUTS_DIR = path.join(__dirname, "outputs");

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function ensureFixture() {
  if (fs.existsSync(TEST_PHOTO_PATH)) return;
  console.log("[fixture] downloading test-room.jpg");
  const res = await fetch(
    "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=1024",
  );
  if (!res.ok) throw new Error(`Fixture download failed: ${res.status}`);
  fs.mkdirSync(path.dirname(TEST_PHOTO_PATH), { recursive: true });
  fs.writeFileSync(TEST_PHOTO_PATH, Buffer.from(await res.arrayBuffer()));
}

async function snap(page: Page, name: string) {
  fs.mkdirSync(OUTPUTS_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(OUTPUTS_DIR, `${name}.png`),
    fullPage: false,
  });
  console.log(`[shot] ${name}.png`);
}

/**
 * Poll a Supabase column until it meets a condition, with timeout.
 */
async function pollColumn<T>(
  admin: ReturnType<typeof adminClient>,
  table: string,
  id: string,
  column: string,
  predicate: (val: T) => boolean,
  timeoutMs: number,
  intervalMs = 5000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastVal: T | null = null;
  while (Date.now() < deadline) {
    const { data } = await admin
      .from(table)
      .select(column)
      .eq("id", id)
      .single();
    lastVal = data?.[column] as T;
    if (predicate(lastVal!)) return lastVal!;
    console.log(
      `[poll] ${column} = ${typeof lastVal === "string" ? lastVal?.substring(0, 60) : lastVal} (${Math.round((deadline - Date.now()) / 1000)}s remaining)`,
    );
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(
    `Timeout waiting for ${table}.${column} — last value: ${lastVal}`,
  );
}

test.describe("Full Render Flow", () => {
  test("upload → step-7c keep/remove → masks → render", async ({
    browser,
  }) => {
    test.setTimeout(600_000); // 10 minutes

    await ensureFixture();
    const admin = adminClient();

    // ── Auth context ──────────────────────────────────────────────────────
    const context = await browser.newContext();
    await injectTestAuth(context);
    const page = await context.newPage();

    // ── 1. Navigate to landing ────────────────────────────────────────────
    await page.goto(BASE_URL, { waitUntil: "networkidle" });
    await snap(page, "flow-00-landing");

    // ── 2. Step 1 — room type + budget ────────────────────────────────────
    await page.goto(`${BASE_URL}/design/step-1`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);

    const bedroomBtn = page.locator("button", { hasText: "Bedroom" }).first();
    await expect(bedroomBtn).toBeVisible({ timeout: 10_000 });
    await bedroomBtn.click();
    await page.waitForTimeout(200);

    const midRangeBtn = page
      .locator("button", { hasText: /Mid-Range|\$500|500.*2,?000/i })
      .first();
    await expect(midRangeBtn).toBeVisible();
    await midRangeBtn.click();
    await page.waitForTimeout(200);

    const startBtn = page
      .locator("button", { hasText: /Start Designing/i })
      .first();
    await expect(startBtn).toBeEnabled();
    await startBtn.click();
    await snap(page, "flow-01-step1-done");

    // ── 3. Step 2 — photo upload ──────────────────────────────────────────
    await page.waitForURL("**/design/step-2", { timeout: 15_000 });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    const fileInputs = page.locator('input[type="file"]');
    await expect(fileInputs.first()).toBeAttached({ timeout: 10_000 });
    await fileInputs.last().setInputFiles(TEST_PHOTO_PATH);
    await snap(page, "flow-02-photo-uploaded");

    // Step 2 auto-navigates to step-3 after upload
    await page.waitForURL("**/design/step-3", { timeout: 30_000 });

    // ── 4. Step 3 — quiz (Phase A: 3 rounds, Phase B: pairwise) ──────────
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(800);

    const cardSelector = 'img[alt*="Interior" i]';

    // Phase A — 3 rounds, pick 3 cards each
    for (let round = 1; round <= 3; round++) {
      await page.waitForTimeout(500);
      const cards = page.locator(cardSelector);
      const cardCount = await cards.count();
      console.log(`[quiz] Phase A round ${round}: ${cardCount} cards`);
      if (cardCount === 0) break;

      for (let i = 0; i < Math.min(3, cardCount); i++) {
        await cards.nth(i).click({ force: true });
        await page.waitForTimeout(250);
      }

      const advanceBtn = page
        .locator("button", { hasText: /Next Round|Continue/i })
        .first();
      await expect(advanceBtn).toBeEnabled({ timeout: 5_000 });
      await advanceBtn.click();
      await page.waitForTimeout(1500);
    }

    // Transition to Phase B
    await page.waitForTimeout(2_000);

    // Phase B — up to 14 pairwise comparisons
    const phaseBVisible = await page
      .getByText(/Which feels more like you|Pair \d+ of 12/i)
      .first()
      .isVisible({ timeout: 8_000 })
      .catch(() => false);

    if (phaseBVisible) {
      for (let pair = 1; pair <= 14; pair++) {
        const pairImages = page.locator(cardSelector);
        try {
          await pairImages
            .first()
            .waitFor({ state: "visible", timeout: 8_000 });
        } catch {
          break;
        }
        await pairImages.first().click({ force: true }).catch(() => {});
        await page.waitForTimeout(700);

        const inPhaseC = await page
          .getByText(/Almost done|Who uses this space/i)
          .first()
          .isVisible()
          .catch(() => false);
        if (inPhaseC) break;
      }
    }

    // Phase C — household
    await page.waitForTimeout(1_000);
    const soloBtn = page.locator("button", { hasText: /^Solo$/ }).first();
    if (await soloBtn.isVisible().catch(() => false)) {
      await soloBtn.click();
      await page.waitForTimeout(200);
    }

    // See My Style → fires fingerprint
    const seeMyStyleBtn = page
      .locator("button", { hasText: /See My Style/i })
      .first();
    await expect(seeMyStyleBtn).toBeVisible({ timeout: 10_000 });
    await expect(seeMyStyleBtn).toBeEnabled({ timeout: 5_000 });
    await seeMyStyleBtn.click();
    await snap(page, "flow-03-quiz-done");

    // ── 5. Step 4 — fingerprint reveal ────────────────────────────────────
    await page.waitForURL("**/design/step-4", { timeout: 15_000 });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2_500);
    await snap(page, "flow-04-fingerprint");

    // Skip auth if panel appears
    const skipAuth = page.getByText(/Continue without saving|Skip/i).first();
    if (await skipAuth.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await skipAuth.click();
      await page.waitForTimeout(400);
    }

    // Advance past step 4
    const dmRoomBtn = page
      .locator("button, a", { hasText: /Design My Room/i })
      .first();
    if (await dmRoomBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await dmRoomBtn.click();
    }

    // ── 6. Step 5 — budget ────────────────────────────────────────────────
    await page.waitForURL("**/design/step-5", { timeout: 15_000 });
    await page.waitForLoadState("networkidle");
    await snap(page, "flow-05-budget");

    // Select Medium room size if visible
    const mediumBtn = page.locator("button", { hasText: /^Medium$/ }).first();
    if (await mediumBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await mediumBtn.click();
    }

    // Click Design My Room
    const designBtn = page
      .locator("button", { hasText: /Design My Room/i })
      .last();
    await expect(designBtn).toBeVisible({ timeout: 10_000 });
    await expect(designBtn).toBeEnabled({ timeout: 10_000 });
    await designBtn.click();

    // ── 7. Step 6 — photo upload/processing ───────────────────────────────
    await page.waitForURL("**/design/step-6", { timeout: 15_000 });
    await page.waitForLoadState("networkidle");
    await snap(page, "flow-06-processing");

    // If step-6 auto-navigates to step-7 (pre-detection), follow it
    await page.waitForURL("**/design/step-7**", { timeout: 60_000 });
    await page.waitForLoadState("networkidle");
    await snap(page, "flow-07-pre-detect");

    // ── 8. Wait for pre-detection ─────────────────────────────────────────
    // Step 7 polls for detection results. Wait until items appear.
    const detectionDeadline = Date.now() + 120_000;
    while (Date.now() < detectionDeadline) {
      const stillAnalyzing = await page
        .getByText(/Analyzing|Detecting|Scanning/i)
        .first()
        .isVisible()
        .catch(() => false);
      if (!stillAnalyzing) break;
      await page.waitForTimeout(3_000);
    }
    await snap(page, "flow-07-detected");

    // Navigate through step-7b (constraints) if present
    const currentUrl = page.url();
    if (currentUrl.includes("step-7b") || currentUrl.includes("step-7")) {
      const continueBtn = page
        .locator("button", { hasText: /Continue|Next|Proceed/i })
        .first();
      if (await continueBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await continueBtn.click();
        await page.waitForTimeout(1_000);
      }
    }

    // ── 9. Step 7c — keep/remove decisions ────────────────────────────────
    // Navigate directly if not auto-routed
    if (!page.url().includes("step-7c")) {
      await page.goto(`${BASE_URL}/design/step-7c`, {
        waitUntil: "networkidle",
      });
    }
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1_000);
    await snap(page, "flow-08-step7c");

    // Find all item rows/cards. Structural items (ceiling, walls, windows)
    // should be auto-kept. Furniture items should be toggled to "remove".
    // The UI shows detected items with keep/remove toggles.
    const itemElements = page.locator(
      '[data-testid="room-item"], .room-item, [class*="item-row"], [class*="ItemRow"]',
    );
    const itemCount = await itemElements.count();
    console.log(`[step-7c] detected ${itemCount} items in UI`);

    // If items are visible, try to interact with remove buttons for furniture
    const removeButtons = page.locator(
      'button:has-text("Remove"), button:has-text("remove"), [aria-label*="remove" i]',
    );
    const removeCount = await removeButtons.count();
    console.log(`[step-7c] found ${removeCount} remove buttons`);

    // Click all remove buttons for furniture items
    for (let i = 0; i < removeCount; i++) {
      await removeButtons.nth(i).click().catch(() => {});
      await page.waitForTimeout(200);
    }

    await snap(page, "flow-08-step7c-decisions");

    // Click Continue/Confirm to save decisions
    const confirmBtn = page
      .locator("button", {
        hasText: /Continue|Confirm|Next|Design My Room/i,
      })
      .last();
    if (await confirmBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await confirmBtn.click();
      await page.waitForTimeout(1_000);
    }

    // ── 10. Step 7d — personalization + trigger render ────────────────────
    if (!page.url().includes("step-7d")) {
      await page.goto(`${BASE_URL}/design/step-7d`, {
        waitUntil: "networkidle",
      });
    }
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1_000);
    await snap(page, "flow-09-step7d");

    // The "Design My Room" CTA triggers the redesign pipeline
    const designMyRoomBtn = page
      .locator("button", { hasText: /Design My Room/i })
      .first();
    if (
      await designMyRoomBtn.isVisible({ timeout: 10_000 }).catch(() => false)
    ) {
      // Intercept the redesign POST
      const redesignRespPromise = page.waitForResponse(
        (res) =>
          res.url().includes("/api/pipeline/redesign") &&
          res.request().method() === "POST",
        { timeout: 30_000 },
      );

      await designMyRoomBtn.click();

      const redesignResp = await redesignRespPromise.catch(() => null);
      if (redesignResp) {
        console.log(`[render] Redesign API status: ${redesignResp.status()}`);
        if (redesignResp.ok()) {
          const data = (await redesignResp.json()) as {
            status: string;
            redesigned_pano_url?: string;
          };
          console.log(`[render] Pipeline status: ${data.status}`);
        }
      }
    }

    // ── 11. Poll for render completion ────────────────────────────────────
    // Get the room_id from the URL or page context
    // The rooms table gets a redesign_pano_url when the render completes.
    // We need the room_id — extract from the page's zustand store or URL.

    // Try to extract room_id from URL params or page state
    let roomId: string | null = null;

    // Check URL for roomId param
    const urlParams = new URL(page.url()).searchParams;
    roomId = urlParams.get("roomId") ?? urlParams.get("room_id") ?? null;

    // If not in URL, try to get from page evaluation
    if (!roomId) {
      roomId = await page
        .evaluate(() => {
          // Check zustand store
          const store = (window as Record<string, unknown>).__area2Store as
            | { getState?: () => { roomId?: string } }
            | undefined;
          if (store?.getState) return store.getState()?.roomId ?? null;
          // Check localStorage fallback (shouldn't exist per CLAUDE.md but just in case)
          return null;
        })
        .catch(() => null);
    }

    // If still no room_id, query the most recent room for this user
    if (!roomId) {
      const email =
        process.env.E2E_TEST_EMAIL ?? "daksh_parikh@berkeley.edu";
      const { data: userRow } = await admin
        .from("users")
        .select("id")
        .eq("email", email)
        .single();
      if (userRow) {
        const { data: recentRoom } = await admin
          .from("rooms")
          .select("id")
          .eq("user_id", userRow.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();
        roomId = recentRoom?.id ?? null;
      }
    }

    expect(roomId, "room_id must be found").toBeTruthy();
    console.log(`[render] Room ID: ${roomId}`);

    // Poll redesign_pano_url until it populates
    console.log("[render] Polling for render completion (up to 5 minutes)...");
    const renderUrl = await pollColumn<string | null>(
      admin,
      "rooms",
      roomId!,
      "redesign_pano_url",
      (val) => typeof val === "string" && val.startsWith("https://"),
      300_000, // 5 min timeout
      10_000, // poll every 10s
    );

    console.log(`[render] Render URL: ${renderUrl}`);

    // ── 12. Download and verify the render ────────────────────────────────
    const renderResponse = await fetch(renderUrl!);
    expect(renderResponse.status).toBe(200);

    const renderBuffer = Buffer.from(await renderResponse.arrayBuffer());
    expect(renderBuffer.byteLength).toBeGreaterThan(100 * 1024); // > 100KB

    // Save the render
    fs.mkdirSync(OUTPUTS_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(OUTPUTS_DIR, "latest_render.jpg"),
      renderBuffer,
    );
    console.log(
      `[render] Saved to tests/e2e/outputs/latest_render.jpg (${(renderBuffer.byteLength / 1024).toFixed(0)} KB)`,
    );

    // Final screenshot
    await snap(page, "flow-10-render-complete");

    // ── Summary ───────────────────────────────────────────────────────────
    console.log("\n=== FULL RENDER FLOW PASSED ===");
    console.log(`Render URL: ${renderUrl}`);
    console.log(
      `File size: ${(renderBuffer.byteLength / 1024).toFixed(0)} KB`,
    );

    await context.close();
  });
});

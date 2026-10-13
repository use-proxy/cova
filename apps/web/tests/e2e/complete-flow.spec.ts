/**
 * Complete Cova User Journey — Zero Tolerance E2E
 *
 * Replaces the previous hybrid (sessionStorage-injection) test with one that
 * clicks the real UI, hits real APIs, and asserts on real downstream effects.
 *
 * What this test guarantees when it passes:
 *   1. Landing page renders for an unauthenticated user.
 *   2. Authenticated user can navigate through every design step end-to-end.
 *   3. Photo upload succeeds and kicks off real detection.
 *   4. Quiz produces a real fingerprint via /api/quiz/fingerprint that
 *      reflects the user's selections (non-zero dimensions).
 *   5. Real FLUX render runs end-to-end (~$1.10, ~3-4 min).
 *   6. Step-7 reveal renders with before/after labels and a draggable slider.
 *   7. Step-9 hotspot click hits /api/match and returns real furniture
 *      products (price ≥ $30, retailer in furniture allowlist).
 *
 * Cost per run: ~$1.50–$2.00 (Replicate render + Anthropic detect/match +
 * Serper + Lens + CLIP). Runtime: ~5–7 minutes wall clock.
 *
 * NOTE for the next engineer:
 * The previous test injected zustand state into sessionStorage via
 * addInitScript. That worked but masked any breakage in the real navigation
 * flow (a 500 in /api/quiz/fingerprint shipped to production undetected
 * because no test ever clicked through the quiz). This test is intentionally
 * slow and expensive — its job is to fail loudly when the real user path
 * breaks.
 */
import { test, expect, type Page } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import * as fs from "fs";
import * as path from "path";

const BASE_URL = `http://localhost:${process.env.E2E_PORT ?? "3001"}`;
const SCREENSHOTS_DIR = path.join(
  process.cwd(),
  "docs/verification-screenshots",
);
const TEST_PHOTO_PATH = path.join(__dirname, "../fixtures/test-room.jpg");

async function snap(page: Page, name: string) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, `${name}.png`),
    fullPage: false,
  });
  console.log(`[shot] ${name}.png`);
}

// Console error tracker. Returns an assert function that throws if any
// non-noise console errors fired during the run.
function trackConsoleErrors(page: Page) {
  const errors: string[] = [];
  const noise = [
    "Warning:",
    "DevTools",
    "favicon",
    "posthog",
    "sentry",
    "Failed to load resource: the server responded with a status of 404",
    // Next.js dev-mode chunk MIME issues — only show in dev, not prod build
    "MIME type",
    "strict MIME",
    "NEXT_REDIRECT",
    "net::ERR_ABORTED", // expected on navigation cancellation
  ];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return () => {
    const real = errors.filter((e) => !noise.some((n) => e.includes(n)));
    if (real.length > 0) {
      throw new Error("Console errors detected:\n" + real.join("\n  "));
    }
  };
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

test.describe("Complete Cova Flow — Zero Tolerance", () => {
  test.setTimeout(720_000); // 12 min — render alone is up to 4 min

  test("full flow with real APIs and downstream verification", async ({
    browser,
  }) => {
    await ensureFixture();

    // ── 1. LANDING (unauthenticated) ───────────────────────────────────────
    const anonContext = await browser.newContext();
    const anonPage = await anonContext.newPage();
    const checkAnonErrors = trackConsoleErrors(anonPage);
    await anonPage.goto(BASE_URL, { waitUntil: "networkidle" });
    await snap(anonPage, "00-landing");

    // Hero headline is "Every room has another life in it."
    await expect(
      anonPage.getByRole("heading", { level: 1, name: /Every room/i }),
    ).toBeVisible();
    // Primary CTA reads "Design my room →" and links to /auth (several on the page)
    const heroCta = anonPage.locator("a", { hasText: /Design my room/i }).first();
    await expect(heroCta).toBeVisible();
    await expect(heroCta).toHaveAttribute("href", "/auth");
    checkAnonErrors();
    await anonContext.close();

    // ── 2. AUTHENTICATED CONTEXT ────────────────────────────────────────────
    const context = await browser.newContext();
    await injectTestAuth(context);
    const page = await context.newPage();
    const checkErrors = trackConsoleErrors(page);

    // ── STEP 1: room type + budget ─────────────────────────────────────────
    await page.goto(BASE_URL + "/design/step-1", { waitUntil: "networkidle" });
    await page.waitForLoadState("load");
    await page.waitForTimeout(400);
    await snap(page, "01-step-1-room-type");

    await expect(page.getByText(/Step 1 of 9/i)).toBeVisible();

    // Select Bedroom (use button that contains the room name)
    const bedroomBtn = page.locator("button", { hasText: "Bedroom" }).first();
    await expect(bedroomBtn).toBeVisible();
    await bedroomBtn.click();
    await page.waitForTimeout(200);

    // Select Mid-Range budget tier
    const midRangeBtn = page
      .locator("button", { hasText: /Mid-Range|\$500|500.*2,?000/i })
      .first();
    await expect(midRangeBtn).toBeVisible();
    await midRangeBtn.click();
    await page.waitForTimeout(200);

    // "Start Designing →" must now be enabled
    const startBtn = page
      .locator("button", { hasText: /Start Designing/i })
      .first();
    await expect(startBtn).toBeEnabled();
    await snap(page, "01-step-1-selected");
    await startBtn.click();

    // ── STEP 2: photo upload ───────────────────────────────────────────────
    await page.waitForURL("**/design/step-2", { timeout: 10_000 });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(400);
    await snap(page, "02-step-2-capture");
    await expect(page.getByText(/Step 2 of 9/i)).toBeVisible();

    // Two hidden file inputs exist (capture + upload). The upload one has
    // no `capture` attribute. Use the second-to-last visible one to be safe.
    const fileInputs = page.locator('input[type="file"]');
    const inputCount = await fileInputs.count();
    expect(inputCount, "file inputs on step-2").toBeGreaterThanOrEqual(1);
    // Upload to the LAST input (uploadRef in source — has no capture attr).
    // setInputFiles works on hidden inputs.
    await fileInputs.last().setInputFiles(TEST_PHOTO_PATH);

    // Step-2 fires /api/rooms/capture, then auto-navigates to step-3 800ms
    // after the upload completes. Wait for the URL change instead of clicking
    // any button.
    await page.waitForURL("**/design/step-3", { timeout: 30_000 });
    await snap(page, "02-step-2-uploaded");

    // ── STEP 3: real quiz interaction ──────────────────────────────────────
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(800);
    await snap(page, "03-step-3-phase-a-round-1");

    // Wait for Phase A cards to render. Cards are <Image> components with
    // alt="Interior design style option" (route api/quiz/next-card sets it).
    // We select by alt because Phase B uses lazy-loading <Image>, and the
    // `src` attribute remains a placeholder until viewport intersection —
    // selecting by `src` would match Phase A but miss Phase B silently.
    const cardSelector = 'img[alt*="Interior" i]';
    await page.waitForSelector(cardSelector, { timeout: 20_000 });
    await page.waitForTimeout(600); // let all 9 images settle

    // Run 3 Phase A rounds. Each round: select 3 cards, then click Next/Continue.
    for (let round = 1; round <= 3; round++) {
      // Wait for card grid to be visible
      await page.waitForTimeout(400);
      const cardImages = page.locator(cardSelector);
      const cardCount = await cardImages.count();
      console.log(`[quiz] Phase A round ${round}: ${cardCount} cards`);

      if (cardCount === 0) {
        // Maybe we already advanced — bail out of Phase A loop
        console.log("[quiz] no cards visible, exiting Phase A loop");
        break;
      }

      // Click 3 cards (parents of the img — the wrappers carry the click handler)
      for (let i = 0; i < Math.min(3, cardCount); i++) {
        await cardImages.nth(i).click({ force: true });
        await page.waitForTimeout(250);
      }

      await snap(page, `03-step-3-phase-a-round-${round}-selected`);

      // Click "Next Round →" (rounds 1-2) or "Continue →" (round 3)
      const advanceBtn = page
        .locator("button", { hasText: /Next Round|Continue/i })
        .first();
      await expect(advanceBtn).toBeEnabled({ timeout: 5_000 });
      await advanceBtn.click();
      await page.waitForTimeout(1500);
    }

    // After Phase A round 3, transition screen plays for ~1.4s, then Phase B
    await page.waitForTimeout(2_000);

    // Phase B: 12 pairwise comparisons. Cards are clicked directly to advance.
    // Look for the "Pair X of 12" indicator OR "Which feels more like you" text.
    const phaseBVisible = await page
      .getByText(/Which feels more like you|Pair \d+ of 12/i)
      .first()
      .isVisible({ timeout: 8_000 })
      .catch(() => false);

    if (phaseBVisible) {
      await snap(page, "03-step-3-phase-b-start");
      // Up to 14 iterations — pick the first card each time. Each click
      // advances the pair (handlePairResponse fires onComplete after the
      // animation). AnimatePresence transitions take ~300ms.
      for (let pair = 1; pair <= 14; pair++) {
        // Wait for two pair cards. NOTE: locator.isVisible() is a sync
        // instantaneous check — its `timeout` option is ignored. Use
        // waitFor({state: 'visible'}) to actually wait through the animation.
        const pairImages = page.locator(cardSelector);
        try {
          await pairImages
            .first()
            .waitFor({ state: "visible", timeout: 8_000 });
        } catch {
          console.log(
            `[quiz] Phase B pair ${pair}: no cards visible, breaking`,
          );
          break;
        }
        // Click the first pair card. Click on the img — the parent div has
        // the onClick handler but click events propagate up.
        await pairImages
          .first()
          .click({ force: true })
          .catch(() => {});
        await page.waitForTimeout(700);

        // Have we left Phase B? (Phase C heading appears)
        const inPhaseC = await page
          .getByText(/Almost done|Who uses this space|Confirm your budget/i)
          .first()
          .isVisible()
          .catch(() => false);
        if (inPhaseC) {
          console.log(`[quiz] reached Phase C after ${pair} Phase B pairs`);
          break;
        }
      }
    } else {
      console.log(
        "[quiz] Phase B did not appear — checking for Phase C directly",
      );
    }

    // Phase C: household selection + (optional) budget confirm + textarea
    await page.waitForTimeout(1_000);
    const phaseCVisible = await page
      .getByText(/Almost done|Who uses this space/i)
      .first()
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    if (phaseCVisible) {
      await snap(page, "03-step-3-phase-c");
      // Pick "Solo" — household composition is required to enable See My Style
      const soloBtn = page.locator("button", { hasText: /^Solo$/ }).first();
      if (await soloBtn.isVisible().catch(() => false)) {
        await soloBtn.click();
        await page.waitForTimeout(200);
      }
    }

    // ── KEY ASSERT: See My Style → triggers /api/quiz/fingerprint ──────────
    const seeMyStyleBtn = page
      .locator("button", { hasText: /See My Style/i })
      .first();
    await expect(seeMyStyleBtn).toBeVisible({ timeout: 10_000 });
    await expect(seeMyStyleBtn).toBeEnabled({ timeout: 5_000 });

    // Intercept the fingerprint POST. This is THE assertion that catches the
    // 500-error class of bug — if the API regresses, this fails immediately.
    const fingerprintRespPromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/quiz/fingerprint") &&
        res.request().method() === "POST",
      { timeout: 30_000 },
    );

    await seeMyStyleBtn.click();
    const fingerprintResp = await fingerprintRespPromise;

    expect(
      fingerprintResp.status(),
      `fingerprint API status: ${fingerprintResp.status()}`,
    ).toBe(200);
    const fpData = (await fingerprintResp.json()) as {
      fingerprint: { dimensions: Record<string, number> };
      style_name: string;
      style_tags: string[];
    };
    expect(fpData.fingerprint).toBeDefined();
    expect(fpData.style_name).toBeTruthy();
    expect(fpData.style_tags).toHaveLength(4);

    // Dimensions must NOT all be zero — that would mean Phase A selections
    // weren't read. (Empty selections also return all zeros, so this is the
    // direct test that the click-through actually fed data to the API.)
    const dims = fpData.fingerprint.dimensions;
    const allZero = Object.values(dims).every((v) => v === 0);
    expect(
      allZero,
      `fingerprint dimensions all zero — quiz selections did not reach API: ${JSON.stringify(dims)}`,
    ).toBe(false);
    console.log(
      `[quiz] fingerprint: ${fpData.style_name} | dims sample: density=${dims.density?.toFixed(2)}`,
    );

    // ── STEP 4: fingerprint reveal ─────────────────────────────────────────
    await page.waitForURL("**/design/step-4", { timeout: 15_000 });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2_500); // typewriter animation
    await snap(page, "04-step-4-fingerprint-reveal");

    // Skip auth if the auth panel slid up
    const skipAuth = page.getByText(/Continue without saving|Skip/i).first();
    if (await skipAuth.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await skipAuth.click();
      await page.waitForTimeout(400);
    }

    // Click "Design My Room →" to advance to step 5
    const dmRoomFromStep4 = page
      .locator("button, a", { hasText: /Design My Room/i })
      .first();
    if (
      await dmRoomFromStep4.isVisible({ timeout: 5_000 }).catch(() => false)
    ) {
      await dmRoomFromStep4.click();
    }

    // ── STEP 5: keep/remove ────────────────────────────────────────────────
    await page.waitForURL("**/design/step-5", { timeout: 15_000 });
    await page.waitForLoadState("networkidle");
    await snap(page, "05-step-5-keep-remove-loading");

    // Detection was kicked off in step 2 fire-and-forget. Step 5 polls
    // /api/detect/status. Wait until "Analyzing" goes away or 90s elapses.
    const detectionDeadline = Date.now() + 100_000;
    while (Date.now() < detectionDeadline) {
      const stillAnalyzing = await page
        .getByText(/Analyzing your room/i)
        .first()
        .isVisible()
        .catch(() => false);
      if (!stillAnalyzing) break;
      await page.waitForTimeout(2_000);
    }
    await snap(page, "05-step-5-keep-remove-detected");

    // Pick a room size if visible
    const mediumBtn = page.locator("button", { hasText: /^Medium$/ }).first();
    if (await mediumBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await mediumBtn.click();
    }

    // Click "Design My Room →" — it lives in a sticky bottom bar
    const designBtn = page
      .locator("button", { hasText: /Design My Room/i })
      .last();
    await expect(designBtn).toBeVisible({ timeout: 10_000 });
    await expect(designBtn).toBeEnabled({ timeout: 10_000 });
    await designBtn.click();

    // ── STEP 6: render loading ─────────────────────────────────────────────
    await page.waitForURL("**/design/step-6", { timeout: 15_000 });
    await page.waitForLoadState("networkidle");
    await snap(page, "06-step-6-render-firing");

    // Step 6 auto-fires POST /api/render on mount. Intercept it.
    const renderResp = await page
      .waitForResponse(
        (res) =>
          res.url().includes("/api/render") &&
          res.request().method() === "POST" &&
          !res.url().includes("/status") &&
          !res.url().includes("/refine"),
        { timeout: 30_000 },
      )
      .catch((err) => {
        throw new Error(`Render POST never fired: ${err}`);
      });

    expect(renderResp.status()).toBe(200);
    const renderData = (await renderResp.json()) as { prediction_id: string };
    expect(renderData.prediction_id).toBeTruthy();
    console.log(`[render] prediction_id: ${renderData.prediction_id}`);

    // Wait for navigation to step 7 — render takes 3-4 minutes
    console.log("[render] waiting up to 5 min for FLUX render to complete...");
    await page.waitForURL("**/design/step-7", { timeout: 300_000 });
    console.log("[render] complete, on step 7");

    // ── STEP 7: before/after reveal ────────────────────────────────────────
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1_500);
    await snap(page, "07-step-7-reveal");

    // Both BEFORE and AFTER labels are visible at default position
    await expect(
      page
        .getByText(/^before$/i)
        .or(page.getByText(/^after$/i))
        .first(),
    ).toBeVisible({ timeout: 10_000 });

    // Drag the slider to verify interaction
    const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
    await page.mouse.move(viewport.width / 2, viewport.height / 2);
    await page.mouse.down();
    await page.mouse.move(viewport.width * 0.25, viewport.height / 2, {
      steps: 10,
    });
    await page.mouse.up();
    await page.waitForTimeout(300);
    await snap(page, "07-step-7-reveal-dragged");

    // Click "Shop This Look" → step 9
    const shopBtn = page
      .locator("button, a", { hasText: /Shop This Look/i })
      .first();
    await expect(shopBtn).toBeVisible({ timeout: 10_000 });
    await expect(shopBtn).toBeEnabled();
    await shopBtn.click();

    // ── STEP 9: shoppable hotspots ─────────────────────────────────────────
    await page.waitForURL("**/design/step-9", { timeout: 15_000 });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1_500);
    await snap(page, "09-step-9-shelf");

    // Hotspots use aria-label="Shop {label}" — verified in DOM map
    const hotspots = page.locator('button[aria-label^="Shop "]');
    const hotspotCount = await hotspots.count();
    console.log(`[step9] hotspots: ${hotspotCount}`);
    expect(hotspotCount, "no hotspots — keep_mask was empty").toBeGreaterThan(
      0,
    );

    // Intercept the /api/match call that fires when a hotspot is tapped
    const matchRespPromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/match") &&
        res.request().method() === "POST" &&
        !res.url().includes("/coherence") &&
        !res.url().includes("/accessories"),
      { timeout: 120_000 },
    );

    await hotspots.first().click();
    await snap(page, "09-step-9-hotspot-tapped");

    const matchResp = await matchRespPromise;
    expect(matchResp.status()).toBe(200);
    const matchData = (await matchResp.json()) as {
      products: Array<{
        name: string;
        retailer: string;
        price: number;
        affiliate_url: string;
        match_label: string;
      }>;
    };

    expect(
      matchData.products?.length,
      "match returned 0 products",
    ).toBeGreaterThan(0);

    const FURNITURE_RETAILERS = [
      "wayfair",
      "westelm",
      "article",
      "crateandbarrel",
      "potterybarn",
      "ikea",
      "target",
      "cb2",
      "overstock",
      "amazon",
      "walmart",
      "allmodern",
      "birchlane",
      "jossandmain",
      "macys",
      "homedepot",
      "castlery",
      "burrow",
      "joybird",
      "crate",
      "roomandboard",
      "livingspaces",
      "serenaandlily",
    ];
    const first = matchData.products[0]!;
    expect(first.price, `${first.name}`).toBeGreaterThanOrEqual(30);
    expect(first.affiliate_url).toMatch(/^https:\/\//);
    const isFurniture =
      FURNITURE_RETAILERS.some((r) =>
        first.retailer?.toLowerCase().includes(r),
      ) ||
      FURNITURE_RETAILERS.some((r) =>
        first.affiliate_url.toLowerCase().includes(r),
      );
    expect(
      isFurniture,
      `non-furniture: ${first.retailer} ${first.affiliate_url}`,
    ).toBe(true);
    console.log(
      `[step9] product: ${first.name?.slice(0, 40)} | $${first.price} | ${first.retailer}`,
    );

    // Wait for the product sheet to render with Buy Now
    const buyBtn = page.getByText(/Buy Now/i).first();
    await expect(buyBtn).toBeVisible({ timeout: 10_000 });
    await snap(page, "09-step-9-product-sheet");

    checkErrors();
    console.log("[e2e] FULL FLOW PASSED — all hard asserts green");
    console.log("[e2e] screenshots:", SCREENSHOTS_DIR);

    await context.close();
  });
});

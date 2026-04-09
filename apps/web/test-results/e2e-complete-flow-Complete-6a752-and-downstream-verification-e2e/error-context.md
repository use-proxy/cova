# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e/complete-flow.spec.ts >> Complete Cova Flow — Zero Tolerance >> full flow with real APIs and downstream verification
- Location: tests/e2e/complete-flow.spec.ts:90:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText(/Buy Now/i).first()
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByText(/Buy Now/i).first()

```

# Page snapshot

```yaml
- generic:
  - generic [ref=e1]:
    - generic [ref=e2]:
      - img "Your redesigned room" [ref=e4]
      - img "Your original room" [ref=e7]
      - generic [ref=e8]: Before
      - generic [ref=e9]: After
      - generic [ref=e11]:
        - img [ref=e12]
        - img [ref=e14]
    - generic [ref=e17]:
      - generic [ref=e18]:
        - button "Shop This Look" [ref=e19] [cursor=pointer]
        - button "Refine →" [ref=e20] [cursor=pointer]
      - generic [ref=e21]:
        - button "Share" [ref=e22] [cursor=pointer]:
          - img [ref=e23]
          - text: Share
        - button "View in Dashboard →" [ref=e29] [cursor=pointer]
  - region "Notifications alt+T" [active]
  - alert [ref=e30]
```

# Test source

```ts
  386 |       )
  387 |       .catch((err) => {
  388 |         throw new Error(`Render POST never fired: ${err}`)
  389 |       })
  390 | 
  391 |     expect(renderResp.status()).toBe(200)
  392 |     const renderData = (await renderResp.json()) as { prediction_id: string }
  393 |     expect(renderData.prediction_id).toBeTruthy()
  394 |     console.log(`[render] prediction_id: ${renderData.prediction_id}`)
  395 | 
  396 |     // Wait for navigation to step 7 — render takes 3-4 minutes
  397 |     console.log('[render] waiting up to 5 min for FLUX render to complete...')
  398 |     await page.waitForURL('**/design/step-7', { timeout: 300_000 })
  399 |     console.log('[render] complete, on step 7')
  400 | 
  401 |     // ── STEP 7: before/after reveal ────────────────────────────────────────
  402 |     await page.waitForLoadState('networkidle')
  403 |     await page.waitForTimeout(1_500)
  404 |     await snap(page, '07-step-7-reveal')
  405 | 
  406 |     // Both BEFORE and AFTER labels are visible at default position
  407 |     await expect(
  408 |       page.getByText(/^before$/i).or(page.getByText(/^after$/i)).first()
  409 |     ).toBeVisible({ timeout: 10_000 })
  410 | 
  411 |     // Drag the slider to verify interaction
  412 |     const viewport = page.viewportSize() ?? { width: 1280, height: 720 }
  413 |     await page.mouse.move(viewport.width / 2, viewport.height / 2)
  414 |     await page.mouse.down()
  415 |     await page.mouse.move(viewport.width * 0.25, viewport.height / 2, { steps: 10 })
  416 |     await page.mouse.up()
  417 |     await page.waitForTimeout(300)
  418 |     await snap(page, '07-step-7-reveal-dragged')
  419 | 
  420 |     // Click "Shop This Look" → step 9
  421 |     const shopBtn = page
  422 |       .locator('button, a', { hasText: /Shop This Look/i })
  423 |       .first()
  424 |     await expect(shopBtn).toBeVisible({ timeout: 10_000 })
  425 |     await expect(shopBtn).toBeEnabled()
  426 |     await shopBtn.click()
  427 | 
  428 |     // ── STEP 9: shoppable hotspots ─────────────────────────────────────────
  429 |     await page.waitForURL('**/design/step-9', { timeout: 15_000 })
  430 |     await page.waitForLoadState('networkidle')
  431 |     await page.waitForTimeout(1_500)
  432 |     await snap(page, '09-step-9-shelf')
  433 | 
  434 |     // Hotspots use aria-label="Shop {label}" — verified in DOM map
  435 |     const hotspots = page.locator('button[aria-label^="Shop "]')
  436 |     const hotspotCount = await hotspots.count()
  437 |     console.log(`[step9] hotspots: ${hotspotCount}`)
  438 |     expect(hotspotCount, 'no hotspots — keep_mask was empty').toBeGreaterThan(0)
  439 | 
  440 |     // Intercept the /api/match call that fires when a hotspot is tapped
  441 |     const matchRespPromise = page.waitForResponse(
  442 |       (res) =>
  443 |         res.url().includes('/api/match') &&
  444 |         res.request().method() === 'POST' &&
  445 |         !res.url().includes('/coherence') &&
  446 |         !res.url().includes('/accessories'),
  447 |       { timeout: 120_000 }
  448 |     )
  449 | 
  450 |     await hotspots.first().click()
  451 |     await snap(page, '09-step-9-hotspot-tapped')
  452 | 
  453 |     const matchResp = await matchRespPromise
  454 |     expect(matchResp.status()).toBe(200)
  455 |     const matchData = (await matchResp.json()) as {
  456 |       products: Array<{
  457 |         name: string
  458 |         retailer: string
  459 |         price: number
  460 |         affiliate_url: string
  461 |         match_label: string
  462 |       }>
  463 |     }
  464 | 
  465 |     expect(matchData.products?.length, 'match returned 0 products').toBeGreaterThan(0)
  466 | 
  467 |     const FURNITURE_RETAILERS = [
  468 |       'wayfair', 'westelm', 'article', 'crateandbarrel', 'potterybarn', 'ikea',
  469 |       'target', 'cb2', 'overstock', 'amazon', 'walmart', 'allmodern',
  470 |       'birchlane', 'jossandmain', 'macys', 'homedepot', 'castlery', 'burrow',
  471 |       'joybird', 'crate', 'roomandboard', 'livingspaces', 'serenaandlily',
  472 |     ]
  473 |     const first = matchData.products[0]!
  474 |     expect(first.price, `${first.name}`).toBeGreaterThanOrEqual(30)
  475 |     expect(first.affiliate_url).toMatch(/^https:\/\//)
  476 |     const isFurniture =
  477 |       FURNITURE_RETAILERS.some((r) => first.retailer?.toLowerCase().includes(r)) ||
  478 |       FURNITURE_RETAILERS.some((r) => first.affiliate_url.toLowerCase().includes(r))
  479 |     expect(isFurniture, `non-furniture: ${first.retailer} ${first.affiliate_url}`).toBe(true)
  480 |     console.log(
  481 |       `[step9] product: ${first.name?.slice(0, 40)} | $${first.price} | ${first.retailer}`
  482 |     )
  483 | 
  484 |     // Wait for the product sheet to render with Buy Now
  485 |     const buyBtn = page.getByText(/Buy Now/i).first()
> 486 |     await expect(buyBtn).toBeVisible({ timeout: 10_000 })
      |                          ^ Error: expect(locator).toBeVisible() failed
  487 |     await snap(page, '09-step-9-product-sheet')
  488 | 
  489 |     checkErrors()
  490 |     console.log('[e2e] FULL FLOW PASSED — all hard asserts green')
  491 |     console.log('[e2e] screenshots:', SCREENSHOTS_DIR)
  492 | 
  493 |     await context.close()
  494 |   })
  495 | })
  496 | 
```
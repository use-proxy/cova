# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: render-pipeline.spec.ts >> Render Pipeline >> inpainting does NOT fire when no items are kept
- Location: tests/e2e/render-pipeline.spec.ts:198:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 200
Received: 500
```

# Test source

```ts
  109 |         floor_type: 'Hardwood',
  110 |         wall_finish: 'Painted (standard)',
  111 |         fixed_elements: [],
  112 |         render_iteration: 1,
  113 |       },
  114 |     })
  115 |     if (renderRes.status() !== 200) {
  116 |       const body = await renderRes.text()
  117 |       throw new Error(`Render API failed (${renderRes.status()}): ${body}`)
  118 |     }
  119 |     const { prediction_id: predictionId } = await renderRes.json() as { prediction_id: string }
  120 |     expect(predictionId).toBeTruthy()
  121 |     console.log('[test] Render started, prediction_id:', predictionId)
  122 | 
  123 |     // ── Step 4: Poll render/status until render_url appears ──────────────
  124 |     // The status endpoint polls Replicate and writes render_url to the DB
  125 |     // when the prediction completes.
  126 |     const admin = adminClient()
  127 |     let renderUrl: string | null = null
  128 |     const maxAttempts = 30 // 30 × 5s = 150s
  129 |     let attempts = 0
  130 | 
  131 |     while (attempts < maxAttempts) {
  132 |       await page.waitForTimeout(5000)
  133 |       attempts++
  134 | 
  135 |       // Poll via the status API (same as step-7 UI does every 3s)
  136 |       const statusRes = await context.request.get(
  137 |         `${BASE_URL}/api/render/status?prediction_id=${predictionId}&room_id=${roomId}&render_iteration=1`
  138 |       )
  139 |       if (statusRes.ok()) {
  140 |         const statusData = await statusRes.json() as
  141 |           | { status: 'processing' }
  142 |           | { status: 'complete'; render_url: string }
  143 |           | { status: 'failed'; error?: string }
  144 |         if (statusData.status === 'complete') {
  145 |           renderUrl = statusData.render_url
  146 |           console.log('[test] Status: complete')
  147 |           break
  148 |         }
  149 |         if (statusData.status === 'failed') {
  150 |           throw new Error(`Render failed: ${'error' in statusData ? statusData.error : 'unknown'}`)
  151 |         }
  152 |       }
  153 | 
  154 |       // Also check the DB directly as fallback
  155 |       const { data } = await admin
  156 |         .from('rooms')
  157 |         .select('render_url, pipeline_cost_log')
  158 |         .eq('id', roomId)
  159 |         .single()
  160 | 
  161 |       type CostLog = { two_stage?: boolean }
  162 |       const costLog = data?.pipeline_cost_log as CostLog | null
  163 |       const renderPreview = data?.render_url?.substring(0, 40) ?? 'null'
  164 |       console.log(
  165 |         `[test] Poll ${attempts}/${maxAttempts}: render_url=${renderPreview}, two_stage=${costLog?.two_stage ?? 'not set'}`
  166 |       )
  167 | 
  168 |       if (data?.render_url) {
  169 |         renderUrl = data.render_url
  170 |         break
  171 |       }
  172 |     }
  173 | 
  174 |     // ── Step 5: Final assertions ──────────────────────────────────────────
  175 |     const { data: finalRoom } = await admin
  176 |       .from('rooms')
  177 |       .select('render_url, pipeline_cost_log')
  178 |       .eq('id', roomId)
  179 |       .single()
  180 | 
  181 |     type CostLog = { two_stage?: boolean }
  182 |     const finalCostLog = finalRoom?.pipeline_cost_log as CostLog | null
  183 |     console.log('[test] pipeline_cost_log:', JSON.stringify(finalCostLog))
  184 |     console.log('[test] two_stage:', finalCostLog?.two_stage ?? 'not set')
  185 | 
  186 |     expect(finalCostLog?.two_stage).toBeFalsy()
  187 |     expect(finalRoom?.render_url).toBeTruthy()
  188 |     expect(finalRoom?.render_url).toMatch(/^https:\/\//)
  189 | 
  190 |     console.log('[TEST PASSED] Render completed successfully')
  191 |     console.log('[TEST PASSED] Render URL:', finalRoom?.render_url)
  192 | 
  193 |     await context.close()
  194 |   })
  195 | 
  196 |   // ── Test 2: Inpainting gate — does NOT fire when no items are kept ────────
  197 | 
  198 |   test('inpainting does NOT fire when no items are kept', async ({ browser }) => {
  199 |     test.setTimeout(60_000)
  200 | 
  201 |     const context = await browser.newContext()
  202 |     await injectTestAuth(context)
  203 |     const page = await context.newPage()
  204 | 
  205 |     // Create a room to get a real room_id for the DB check
  206 |     const createRes = await context.request.post(`${BASE_URL}/api/rooms/create`, {
  207 |       data: { room_type: 'bedroom' },
  208 |     })
> 209 |     expect(createRes.status()).toBe(200)
      |                                ^ Error: expect(received).toBe(expected) // Object.is equality
  210 |     const { id: roomId } = await createRes.json() as { id: string }
  211 |     console.log('[test2] Room created:', roomId)
  212 | 
  213 |     // Call render API directly with empty keep_mask (no showcase_mode)
  214 |     // This goes through the real pipeline path
  215 |     const renderRes = await context.request.post(`${BASE_URL}/api/render`, {
  216 |       data: {
  217 |         photo_url: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=1024',
  218 |         fingerprint_vector: [0.7, 0.3, 0.8, 0.4, 0.2, 0.7, 0.5, 0.6, 0.4, 0.3],
  219 |         room_type: 'bedroom',
  220 |         budget: 'mid',
  221 |         inclusions: [],
  222 |         constraints: [],
  223 |         keep_mask: [],     // EMPTY — must NOT trigger inpainting
  224 |         room_id: roomId,
  225 |       },
  226 |     })
  227 | 
  228 |     if (renderRes.status() !== 200) {
  229 |       const body = await renderRes.text()
  230 |       throw new Error(`Render API failed (${renderRes.status()}): ${body}`)
  231 |     }
  232 | 
  233 |     const { prediction_id: predictionId } = await renderRes.json() as { prediction_id: string }
  234 |     expect(predictionId).toBeTruthy()
  235 |     console.log('[test2] prediction_id:', predictionId)
  236 | 
  237 |     // Check DB immediately — pipeline_cost_log.two_stage must NOT be set
  238 |     // (it's only set when keptItems.length > 0 triggers inpainting)
  239 |     const admin = adminClient()
  240 |     const { data: room } = await admin
  241 |       .from('rooms')
  242 |       .select('pipeline_cost_log')
  243 |       .eq('id', roomId)
  244 |       .single()
  245 | 
  246 |     type CostLog = { two_stage?: boolean }
  247 |     const costLog = room?.pipeline_cost_log as CostLog | null
  248 |     console.log('[test2] pipeline_cost_log:', JSON.stringify(costLog))
  249 |     console.log('[test2] two_stage:', costLog?.two_stage ?? 'not set')
  250 | 
  251 |     // If two_stage is set, inpainting was incorrectly triggered
  252 |     expect(costLog?.two_stage).toBeFalsy()
  253 | 
  254 |     console.log('[TEST PASSED] Inpainting gate works — single-stage render confirmed')
  255 | 
  256 |     await context.close()
  257 |   })
  258 | })
  259 | 
```
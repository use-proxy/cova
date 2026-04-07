# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: render-pipeline.spec.ts >> Render Pipeline >> render completes end-to-end with no kept items
- Location: tests/e2e/render-pipeline.spec.ts:51:7

# Error details

```
Error: Room create failed (500): <!DOCTYPE html><html><head><style data-next-hide-fouc="true">body{display:none}</style><noscript data-next-hide-fouc="true"><style>body{display:block}</style></noscript><meta charSet="utf-8"/><meta name="viewport" content="width=device-width"/><meta name="next-head-count" content="2"/><noscript data-n-css=""></noscript><script defer="" nomodule="" src="/_next/static/chunks/polyfills.js"></script><script src="/_next/static/chunks/fallback/webpack.js" defer=""></script><script src="/_next/static/chunks/fallback/main.js" defer=""></script><script src="/_next/static/chunks/fallback/pages/_app.js" defer=""></script><script src="/_next/static/chunks/fallback/pages/_error.js" defer=""></script><noscript id="__next_css__DO_NOT_USE__"></noscript></head><body><div id="__next"></div><script src="/_next/static/chunks/fallback/react-refresh.js"></script><script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"statusCode":500}},"page":"/_error","query":{},"buildId":"development","isFallback":false,"err":{"name":"Error","source":"server","message":"Cannot find module './9161.js'\nRequire stack:\n- /Users/daksh/Desktop/cova/apps/web/.next/server/webpack-runtime.js\n- /Users/daksh/Desktop/cova/apps/web/.next/server/pages/_document.js\n- /Users/daksh/Desktop/cova/apps/web/node_modules/next/dist/server/require.js\n- /Users/daksh/Desktop/cova/apps/web/node_modules/next/dist/server/load-components.js\n- /Users/daksh/Desktop/cova/apps/web/node_modules/next/dist/build/utils.js\n- /Users/daksh/Desktop/cova/apps/web/node_modules/next/dist/server/dev/hot-middleware.js\n- /Users/daksh/Desktop/cova/apps/web/node_modules/next/dist/server/dev/hot-reloader-webpack.js\n- /Users/daksh/Desktop/cova/apps/web/node_modules/next/dist/server/lib/router-utils/setup-dev-bundler.js\n- /Users/daksh/Desktop/cova/apps/web/node_modules/next/dist/server/lib/router-server.js\n- /Users/daksh/Desktop/cova/apps/web/node_modules/next/dist/server/lib/start-server.js","stack":"Error: Cannot find module './9161.js'\nRequire stack:\n- /Users/daksh/Desktop/cova/apps/web/.next/server/webpack-runtime.js\n- /Users/daksh/Desktop/cova/apps/web/.next/server/pages/_document.js\n- /Users/daksh/Desktop/cova/apps/web/node_modules/next/dist/server/require.js\n- /Users/daksh/Desktop/cova/apps/web/node_modules/next/dist/server/load-components.js\n- /Users/daksh/Desktop/cova/apps/web/node_modules/next/dist/build/utils.js\n- /Users/daksh/Desktop/cova/apps/web/node_modules/next/dist/server/dev/hot-middleware.js\n- /Users/daksh/Desktop/cova/apps/web/node_modules/next/dist/server/dev/hot-reloader-webpack.js\n- /Users/daksh/Desktop/cova/apps/web/node_modules/next/dist/server/lib/router-utils/setup-dev-bundler.js\n- /Users/daksh/Desktop/cova/apps/web/node_modules/next/dist/server/lib/router-server.js\n- /Users/daksh/Desktop/cova/apps/web/node_modules/next/dist/server/lib/start-server.js\n    at Module._resolveFilename (node:internal/modules/cjs/loader:1207:15)\n    at /Users/daksh/Desktop/cova/apps/web/node_modules/next/dist/server/require-hook.js:55:36\n    at Module._load (node:internal/modules/cjs/loader:1038:27)\n    at Module.require (node:internal/modules/cjs/loader:1289:19)\n    at mod.require (/Users/daksh/Desktop/cova/apps/web/node_modules/next/dist/server/require-hook.js:65:28)\n    at require (node:internal/modules/helpers:182:18)\n    at __webpack_require__.f.require (/Users/daksh/Desktop/cova/apps/web/.next/server/webpack-runtime.js:203:28)\n    at /Users/daksh/Desktop/cova/apps/web/.next/server/webpack-runtime.js:116:40\n    at Array.reduce (\u003canonymous\u003e)\n    at __webpack_require__.e (/Users/daksh/Desktop/cova/apps/web/.next/server/webpack-runtime.js:115:67)\n    at Array.map (\u003canonymous\u003e)\n    at __webpack_require__.X (/Users/daksh/Desktop/cova/apps/web/.next/server/webpack-runtime.js:167:22)\n    at /Users/daksh/Desktop/cova/apps/web/.next/server/pages/_document.js:1:340\n    at Object.\u003canonymous\u003e (/Users/daksh/Desktop/cova/apps/web/.next/server/pages/_document.js:1:383)\n    at Module._compile (node:internal/modules/cjs/loader:1521:14)\n    at Module._extensions..js (node:internal/modules/cjs/loader:1623:10)\n    at Module.load (node:internal/modules/cjs/loader:1266:32)\n    at Module._load (node:internal/modules/cjs/loader:1091:12)\n    at Module.require (node:internal/modules/cjs/loader:1289:19)\n    at mod.require (/Users/daksh/Desktop/cova/apps/web/node_modules/next/dist/server/require-hook.js:65:28)\n    at require (node:internal/modules/helpers:182:18)\n    at requirePage (/Users/daksh/Desktop/cova/apps/web/node_modules/next/dist/server/require.js:109:84)\n    at /Users/daksh/Desktop/cova/apps/web/node_modules/next/dist/server/load-components.js:72:65\n    at async Promise.all (index 0)\n    at async loadComponentsImpl (/Users/daksh/Desktop/cova/apps/web/node_modules/next/dist/server/load-components.js:71:33)\n    at async DevServer.findPageComponentsImpl (/Users/daksh/Desktop/cova/apps/web/node_modules/next/dist/server/next-server.js:714:36)"},"gip":true,"scriptLoader":[]}</script></body></html>
```

# Test source

```ts
  1   | /**
  2   |  * Render Pipeline E2E Tests
  3   |  *
  4   |  * Verifies the full render pipeline end-to-end without human interaction.
  5   |  * Bypasses steps 1-5 by injecting Zustand store state directly into sessionStorage.
  6   |  *
  7   |  * Requires:
  8   |  *   - Dev server running at BASE_URL
  9   |  *   - E2E_TEST_EMAIL and E2E_TEST_PASSWORD in .env.local
  10  |  *   - Valid REPLICATE_API_TOKEN and SUPABASE_SERVICE_ROLE_KEY in .env.local
  11  |  */
  12  | 
  13  | import { test, expect } from '@playwright/test'
  14  | import { injectTestAuth } from './helpers/auth'
  15  | import { createClient } from '@supabase/supabase-js'
  16  | import * as fs from 'fs'
  17  | import * as path from 'path'
  18  | 
  19  | const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'
  20  | const TEST_PHOTO_PATH = path.join(__dirname, '../../fixtures/test-room.jpg')
  21  | 
  22  | // ── Shared admin client ──────────────────────────────────────────────────────
  23  | 
  24  | function adminClient() {
  25  |   return createClient(
  26  |     process.env.NEXT_PUBLIC_SUPABASE_URL!,
  27  |     process.env.SUPABASE_SERVICE_ROLE_KEY!,
  28  |     { auth: { autoRefreshToken: false, persistSession: false } }
  29  |   )
  30  | }
  31  | 
  32  | // ── Download test fixture if missing ─────────────────────────────────────────
  33  | 
  34  | test.beforeAll(async () => {
  35  |   if (!fs.existsSync(TEST_PHOTO_PATH)) {
  36  |     console.log('[fixture] Downloading test room photo...')
  37  |     const res = await fetch(
  38  |       'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=1024'
  39  |     )
  40  |     if (!res.ok) throw new Error(`Failed to download fixture: ${res.status}`)
  41  |     const buffer = Buffer.from(await res.arrayBuffer())
  42  |     fs.mkdirSync(path.dirname(TEST_PHOTO_PATH), { recursive: true })
  43  |     fs.writeFileSync(TEST_PHOTO_PATH, buffer)
  44  |     console.log('[fixture] Saved to', TEST_PHOTO_PATH)
  45  |   }
  46  | })
  47  | 
  48  | // ── Test 1: Full render pipeline end-to-end ───────────────────────────────────
  49  | 
  50  | test.describe('Render Pipeline', () => {
  51  |   test('render completes end-to-end with no kept items', async ({ browser }) => {
  52  |     test.setTimeout(180_000) // 3 minutes
  53  | 
  54  |     const context = await browser.newContext()
  55  |     await injectTestAuth(context)
  56  |     const page = await context.newPage()
  57  | 
  58  |     // ── Step 1: Create a room via API ─────────────────────────────────────
  59  |     const createRes = await context.request.post(`${BASE_URL}/api/rooms/create`, {
  60  |       data: { room_type: 'bedroom' },
  61  |     })
  62  |     if (createRes.status() !== 200) {
  63  |       const body = await createRes.text()
> 64  |       throw new Error(`Room create failed (${createRes.status()}): ${body}`)
      |             ^ Error: Room create failed (500): <!DOCTYPE html><html><head><style data-next-hide-fouc="true">body{display:none}</style><noscript data-next-hide-fouc="true"><style>body{display:block}</style></noscript><meta charSet="utf-8"/><meta name="viewport" content="width=device-width"/><meta name="next-head-count" content="2"/><noscript data-n-css=""></noscript><script defer="" nomodule="" src="/_next/static/chunks/polyfills.js"></script><script src="/_next/static/chunks/fallback/webpack.js" defer=""></script><script src="/_next/static/chunks/fallback/main.js" defer=""></script><script src="/_next/static/chunks/fallback/pages/_app.js" defer=""></script><script src="/_next/static/chunks/fallback/pages/_error.js" defer=""></script><noscript id="__next_css__DO_NOT_USE__"></noscript></head><body><div id="__next"></div><script src="/_next/static/chunks/fallback/react-refresh.js"></script><script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"statusCode":500}},"page":"/_error","query":{},"buildId":"development","isFallback":false,"err":{"name":"Error","source":"server","message":"Cannot find module './9161.js'\nRequire stack:\n- /Users/daksh/Desktop/cova/apps/web/.next/server/webpack-runtime.js\n- /Users/daksh/Desktop/cova/apps/web/.next/server/pages/_document.js\n- /Users/daksh/Desktop/cova/apps/web/node_modules/next/dist/server/require.js\n- /Users/daksh/Desktop/cova/apps/web/node_modules/next/dist/server/load-components.js\n- /Users/daksh/Desktop/cova/apps/web/node_modules/next/dist/build/utils.js\n- /Users/daksh/Desktop/cova/apps/web/node_modules/next/dist/server/dev/hot-middleware.js\n- /Users/daksh/Desktop/cova/apps/web/node_modules/next/dist/server/dev/hot-reloader-webpack.js\n- /Users/daksh/Desktop/cova/apps/web/node_modules/next/dist/server/lib/router-utils/setup-dev-bundler.js\n- /Users/daksh/Desktop/cova/apps/web/node_modules/next/dist/server/lib/router-server.js\n- /Users/daksh/Desktop/cova/apps/web/node_modules/next/dist/server/lib/start-server.js","stack":"Error: Cannot find module './9161.js'\nRequire stack:\n- /Users/daksh/Desktop/cova/apps/web/.next/server/webpack-runtime.js\n- /Users/daksh/Desktop/cova/apps/web/.next/server/pages/_document.js\n- /Users/daksh/Desktop/cova/apps/web/node_modules/next/dist/server/require.js\n- /Users/daksh/Desktop/cova/apps/web/node_modules/next/dist/server/load-components.js\n- /Users/daksh/Desktop/cova/apps/web/node_modules/next/dist/build/utils.js\n- /Users/daksh/Desktop/cova/apps/web/node_modules/next/dist/server/dev/hot-middleware.js\n- /Users/daksh/Desktop/cova/apps/web/node_modules/next/dist/server/dev/hot-reloader-webpack.js\n- /Users/daksh/Desktop/cova/apps/web/node_modules/next/dist/server/lib/router-utils/setup-dev-bundler.js\n- /Users/daksh/Desktop/cova/apps/web/node_modules/next/dist/server/lib/router-server.js\n- /Users/daksh/Desktop/cova/apps/web/node_modules/next/dist/server/lib/start-server.js\n    at Module._resolveFilename (node:internal/modules/cjs/loader:1207:15)\n    at /Users/daksh/Desktop/cova/apps/web/node_modules/next/dist/server/require-hook.js:55:36\n    at Module._load (node:internal/modules/cjs/loader:1038:27)\n    at Module.require (node:internal/modules/cjs/loader:1289:19)\n    at mod.require (/Users/daksh/Desktop/cova/apps/web/node_modules/next/dist/server/require-hook.js:65:28)\n    at require (node:internal/modules/helpers:182:18)\n    at __webpack_require__.f.require (/Users/daksh/Desktop/cova/apps/web/.next/server/webpack-runtime.js:203:28)\n    at /Users/daksh/Desktop/cova/apps/web/.next/server/webpack-runtime.js:116:40\n    at Array.reduce (\u003canonymous\u003e)\n    at __webpack_require__.e (/Users/daksh/Desktop/cova/apps/web/.next/server/webpack-runtime.js:115:67)\n    at Array.map (\u003canonymous\u003e)\n    at __webpack_require__.X (/Users/daksh/Desktop/cova/apps/web/.next/server/webpack-runtime.js:167:22)\n    at /Users/daksh/Desktop/cova/apps/web/.next/server/pages/_document.js:1:340\n    at Object.\u003canonymous\u003e (/Users/daksh/Desktop/cova/apps/web/.next/server/pages/_document.js:1:383)\n    at Module._compile (node:internal/modules/cjs/loader:1521:14)\n    at Module._extensions..js (node:internal/modules/cjs/loader:1623:10)\n    at Module.load (node:internal/modules/cjs/loader:1266:32)\n    at Module._load (node:internal/modules/cjs/loader:1091:12)\n    at Module.require (node:internal/modules/cjs/loader:1289:19)\n    at mod.require (/Users/daksh/Desktop/cova/apps/web/node_modules/next/dist/server/require-hook.js:65:28)\n    at require (node:internal/modules/helpers:182:18)\n    at requirePage (/Users/daksh/Desktop/cova/apps/web/node_modules/next/dist/server/require.js:109:84)\n    at /Users/daksh/Desktop/cova/apps/web/node_modules/next/dist/server/load-components.js:72:65\n    at async Promise.all (index 0)\n    at async loadComponentsImpl (/Users/daksh/Desktop/cova/apps/web/node_modules/next/dist/server/load-components.js:71:33)\n    at async DevServer.findPageComponentsImpl (/Users/daksh/Desktop/cova/apps/web/node_modules/next/dist/server/next-server.js:714:36)"},"gip":true,"scriptLoader":[]}</script></body></html>
  65  |     }
  66  |     const { id: roomId } = await createRes.json() as { id: string }
  67  |     expect(roomId).toBeTruthy()
  68  |     console.log('[test] Room created:', roomId)
  69  | 
  70  |     // ── Step 2: Upload photo via API ─────────────────────────────────────
  71  |     const photoBuffer = fs.readFileSync(TEST_PHOTO_PATH)
  72  |     const captureRes = await context.request.post(`${BASE_URL}/api/rooms/capture`, {
  73  |       multipart: {
  74  |         photo: {
  75  |           name: 'test-room.jpg',
  76  |           mimeType: 'image/jpeg',
  77  |           buffer: photoBuffer,
  78  |         },
  79  |         room_id: roomId,
  80  |       },
  81  |     })
  82  |     if (captureRes.status() !== 200) {
  83  |       const body = await captureRes.text()
  84  |       throw new Error(`Photo upload failed (${captureRes.status()}): ${body}`)
  85  |     }
  86  |     const { photo_url: photoUrl } = await captureRes.json() as { photo_url: string; room_id: string }
  87  |     expect(photoUrl).toBeTruthy()
  88  |     console.log('[test] Photo uploaded:', photoUrl.substring(0, 60))
  89  | 
  90  |     // ── Step 3: Kick off render via API ───────────────────────────────────
  91  |     // Call /api/render directly — avoids browser navigation and auth cookie
  92  |     // issues. Tests the full pipeline: render fires → Replicate prediction →
  93  |     // status polling writes render_url to DB.
  94  |     const renderRes = await context.request.post(`${BASE_URL}/api/render`, {
  95  |       data: {
  96  |         photo_url: photoUrl,
  97  |         fingerprint_vector: [0.7, 0.3, 0.8, 0.4, 0.2, 0.7, 0.5, 0.6, 0.4, 0.3],
  98  |         room_type: 'bedroom',
  99  |         budget: 'mid',
  100 |         budget_tier: 'mid',
  101 |         inclusions: [],
  102 |         constraints: [],
  103 |         keep_mask: [],     // EMPTY — single-stage render, no inpainting
  104 |         room_id: roomId,
  105 |         room_length: 14,
  106 |         room_width: 12,
  107 |         ceiling_height: 9,
  108 |         natural_light: 'Multiple windows',
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
```
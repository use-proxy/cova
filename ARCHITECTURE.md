# Cova — Target Architecture
Last updated: 2026-04-03

---

## Monorepo Structure

```
/
├── apps/
│   ├── web/                    ← ALL V1 work lives here
│   │   ├── app/                ← Next.js 14 App Router pages + API routes
│   │   │   ├── (auth)/         ← Auth pages
│   │   │   ├── api/            ← API route handlers
│   │   │   │   ├── capture/    ← Token generation + validation
│   │   │   │   ├── chat/       ← Claude streaming chat
│   │   │   │   ├── pipeline/   ← Modal webhook triggers
│   │   │   │   ├── quiz/       ← Quiz card serving
│   │   │   │   └── rooms/      ← Room CRUD + status
│   │   │   ├── auth/           ← Auth page + callback
│   │   │   ├── budget/         ← Budget selection
│   │   │   ├── capture/        ← Legacy capture routes (kept for back-compat)
│   │   │   │   ├── mobile/
│   │   │   │   │   └── [token]/page.tsx  ← QR handoff: single-photo mobile camera
│   │   │   │   └── [roomId]/page.tsx     ← Legacy route (QR+Upload, no webcam)
│   │   │   ├── design/
│   │   │   │   └── step-6/page.tsx       ← CANONICAL capture entry point (hybrid)
│   │   │   ├── dashboard/      ← User dashboard
│   │   │   ├── processing/     ← Pipeline progress screen
│   │   │   ├── quiz/           ← Style quiz
│   │   │   └── room/[roomId]/  ← 3D viewer + chatbot
│   │   ├── components/
│   │   │   ├── auth/           ← AuthModal
│   │   │   ├── capture/        ← QRCapture, MobileCapture, UploadFallback, CaptureResult, QualityChecker
│   │   │   ├── chat/           ← ChatBubble, ChatPanel, ChatMessage
│   │   │   ├── dashboard/      ← RoomCard, StatsRow, StyleProfile, NewRoomCTA
│   │   │   ├── layout/         ← AppShell
│   │   │   ├── product/        ← ProductPanel, ProductCard, SimilarItems (CANONICAL)
│   │   │   └── quiz/           ← CardStack, SwipeCard, ConfidenceBar
│   │   │   FurnitureHotspots.tsx  ← Hotspot overlay (root level, standalone)
│   │   │   RoomChatbot.tsx        ← Chatbot component (root level)
│   │   │   SplatViewer.tsx        ← 3D splat viewer (root level)
│   │   ├── lib/
│   │   │   ├── supabase/       ← MUST use these wrappers — never import direct
│   │   │   │   ├── client.ts   ← createBrowserClient() for 'use client' components
│   │   │   │   ├── server.ts   ← createServerSupabaseClient() for server-side
│   │   │   │   └── admin.ts    ← createAdminClient() for service-role operations
│   │   │   ├── stores/         ← Zustand v5 stores
│   │   │   │   ├── userStore.ts
│   │   │   │   ├── roomStore.ts
│   │   │   │   └── cameraStore.ts
│   │   │   ├── db/migrations/  ← Local SQL migration reference files
│   │   │   ├── affiliates.ts   ← Affiliate URL builder (server-side only)
│   │   │   ├── clipSearch.ts   ← CLIP search (server-side only)
│   │   │   ├── fluxKontext.ts  ← FLUX API client
│   │   │   ├── marble.ts       ← Marble API client
│   │   │   ├── pipelineConfig.ts ← Pipeline mode config
│   │   │   ├── pipelinePoller.ts ← Pipeline status poller
│   │   │   ├── routes.ts       ← App route constants
│   │   │   └── stylePrompt.ts  ← Style prompt generator
│   │   ├── styles/             ← (symlink or copy from root styles/)
│   │   ├── middleware.ts       ← Auth guard (uses @supabase/ssr)
│   │   ├── tailwind.config.ts
│   │   └── app/globals.css
│   └── mobile/                 ← FROZEN. Never touch.
├── modal_pipeline/             ← Python GPU pipelines on Modal
│   ├── room_reconstruction.py  ← AnySplat
│   ├── marble_*.py             ← Marble pipeline variants
│   ├── redesign_pipeline.py    ← FLUX redesign
│   ├── furniture_matching_pipeline.py
│   ├── depth_video_pipeline.py
│   ├── pre_detection_pipeline.py
│   ├── clip_text_embed.py      ← CLIP text embedding endpoint
│   └── anysplat/               ← AnySplat model source
├── supabase/
│   ├── functions/              ← Edge Functions (5 frozen, 1 updatable)
│   └── migrations/             ← All 62+ migrations (never alter existing)
├── styles/
│   └── tokens.css              ← CANONICAL design tokens
├── docs/
│   ├── STATUS.md               ← Current build status (update each session)
│   ├── SESSION_PLAN.md         ← Session-by-session roadmap
│   └── sessions/               ← Session audit + progress files
├── CLAUDE.md                   ← Hard rules (read every session)
├── COVA_CONTEXT.md             ← Project context
├── ARCHITECTURE.md             ← This file
└── CHAT_STARTER.md             ← Quick start for new Claude sessions
```

---

## Supabase Client Rules (NEVER VIOLATE)

Three patterns — use the right one for each context:

### 1. Browser / Client Components (`'use client'`)
```typescript
import { createBrowserClient } from '@/lib/supabase/client'
// Usage:
const supabase = createBrowserClient()
```

### 2. Server Components, API Routes, Middleware
```typescript
import { createServerSupabaseClient } from '@/lib/supabase/server'
// Usage (async):
const supabase = await createServerSupabaseClient()
```
Uses ANON key. Respects RLS. User must be authenticated via middleware.

### 3. Admin Operations (bypass RLS — service role key)
```typescript
import { createAdminClient } from '@/lib/supabase/admin'
// Usage (sync — does not need cookies):
const db = createAdminClient()
```
Uses SERVICE_ROLE_KEY. Only for server-side admin operations (storage signed URLs, cross-user queries). Never in client components.

**Never import from `@supabase/supabase-js` directly in application code.**
The lib wrappers enforce the correct key and cookie handling.

---

## Auth Flow

```
User visits protected route
    ↓
middleware.ts (createServerClient from @supabase/ssr)
    ↓ no session?
Redirect to /auth
    ↓ sign in (Google / Apple / magic link)
/auth/callback → exchanges code for session → redirect to dashboard
    ↓
Session stored in HTTP-only cookies
    ↓
Subsequent requests: middleware refreshes session token in cookies
```

---

## Pipeline Data Flow

```
User: POST /api/rooms/create
  → Supabase: INSERT rooms (status: pending)
  → Returns room_id

User: takes photos in /capture/[roomId]
  → Photos uploaded to Supabase Storage
  → POST /api/pipeline/start { roomId }
    → Validates auth, gets user
    → Updates room: { status: processing, redesign_status: queued }
    → orchestrateFullPipeline(roomId) → fire and forget

orchestrateFullPipeline:
  → POST MODAL_WEBHOOK_URL (marble_multi_image)
    → Marble builds 3D world from photos
    → Webhook back: → room.marble_mini_spz_url set, redesign_status: mini_world_ready
  → POST REDESIGN_PIPELINE_WEBHOOK_URL
    → FLUX Kontext redesigns the panorama
    → Webhook back: → room.redesign_pano_url set, redesign_status: kontext_complete
  → POST FURNITURE_MATCHING_WEBHOOK_URL
    → Claude Vision detects furniture
    → CLIP matches products
    → Webhook back: → room_products populated, redesign_status: complete
  → async: POST MARBLE_PLUS_WEBHOOK_URL (background upgrade)
    → Better quality 3D, room.plus_upgrade_ready = true when done

Frontend polling:
  GET /api/rooms/status?roomId=X  (every 3s on processing page)
  → Returns progress_percent, progress_message, isComplete
  → On complete: redirect to /room/[roomId]
```

---

## Component Architecture Rules

1. **SplatViewer** must always be dynamically imported with `ssr: false`
2. **FurnitureHotspots** reads camera yaw/pitch from `useCameraStore` — SplatViewer writes to it
3. **ProductPanel** is in `components/product/ProductPanel.tsx` — this is the ONLY one
4. **ChatBubble / ChatPanel** are separate components — only one panel open at a time
5. **AppShell** wraps all authenticated pages — provides the nav chrome

---

## Design Token Usage

All colors, fonts, and spacing MUST reference CSS variables from `styles/tokens.css`.

```css
/* Correct */
color: var(--color-text-primary);
background: var(--color-navy-card);
border: 1px solid var(--color-navy-border);

/* Acceptable (Tailwind JIT with correct values) */
className="bg-[#0A1628]"   ← OK only if matches token value exactly

/* Wrong — hardcoded without variable */
style={{ color: '#F8F6F1' }}  ← fix this
```

Key color tokens:
- `--color-navy-base` = `#0A1628` — page background
- `--color-navy-card` = `#0F1F3D` — card surface
- `--color-navy-border` = `#1E3A5F` — borders
- `--color-gold` = `#C9A84C` — primary CTA / hotspots
- `--color-text-primary` = `#F8F6F1` — main text
- `--color-text-secondary` = `#8BA3C0` — secondary text

---

## API Route Patterns

All API routes follow this pattern:
```typescript
// 1. Get cookies
const cookieStore = await cookies()

// 2. Create Supabase client (anon key + cookie handler)
const supabase = createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { cookies: { ... } }
)

// 3. Verify auth
const { data: { user } } = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

// 4. Verify ownership before any data operation
.eq('user_id', user.id)

// 5. Return typed response
return NextResponse.json({ ... })
```

---

## Milestone Completion Criteria

| Milestone | Definition of Done |
|---|---|
| M7 | Full pipeline works end-to-end: video → 3D → redesign → viewer |
| M8 | Furniture hotspots active, product panel shows real products, affiliate links work |
| M9 | Chatbot live in viewer, PostHog events firing, Sentry capturing errors |
| M10 | Error states handled, 5 real user tests complete |
| M11 | Deployed to covainterior.com, custom domain verified |
| M12 | iOS WebView shell on TestFlight |
| M13 | Landing page with demo video, full visual polish |
| M14 | Example rooms, pitch deck, demo script |

# Cova — Claude Code Session Starter
Read this at the start of every session. Then read CLAUDE.md for hard rules.

---

## 5-Minute Session Bootstrap

```
1. Read this file (CHAT_STARTER.md)
2. Read CLAUDE.md — the 12 hard rules. No exceptions.
3. Read docs/STATUS.md — current milestone and what's in progress
4. Read .claude/SESSION_MEMORY.md — session-specific context from last time
5. Confirm the milestone you're working on before writing code
```

---

## Most Common Mistakes (read before touching code)

### ❌ Never do this
```typescript
// Rule violation: direct supabase-js import
import { createClient } from '@supabase/supabase-js'

// Rule violation: localStorage
localStorage.setItem('user', ...)

// Rule violation: style name in UI
<p>Your style is Japandi</p>

// Rule violation: service role key in NEXT_PUBLIC_ var
NEXT_PUBLIC_SUPABASE_SERVICE_KEY=...

// Rule violation: SparkJS at module level in page file
import { SplatMesh } from '@sparkjsdev/spark'  // in app/room/page.tsx

// Rule violation: CLIP from client
// In a 'use client' component:
const embed = await embedText(query, url)
```

### ✅ Always do this
```typescript
// Client components:
import { createBrowserClient } from '@/lib/supabase/client'

// Server components + API routes:
import { createServerSupabaseClient } from '@/lib/supabase/server'

// Admin operations (service role, server-only):
import { createAdminClient } from '@/lib/supabase/admin'

// SplatViewer — always dynamic:
const SplatViewer = dynamic(() => import('@/components/SplatViewer'), { ssr: false })
```

---

## Current File Locations (quick reference)

| What | Where |
|---|---|
| Hard rules | `CLAUDE.md` |
| Project context | `COVA_CONTEXT.md` |
| Architecture | `ARCHITECTURE.md` |
| Build status | `docs/STATUS.md` |
| Session plan | `docs/SESSION_PLAN.md` |
| Design tokens | `styles/tokens.css` |
| Supabase client (browser) | `apps/web/lib/supabase/client.ts` |
| Supabase client (server) | `apps/web/lib/supabase/server.ts` |
| Supabase client (admin) | `apps/web/lib/supabase/admin.ts` |
| Zustand stores | `apps/web/lib/stores/` |
| Pipeline config | `apps/web/lib/pipelineConfig.ts` |
| Style prompt generator | `apps/web/lib/stylePrompt.ts` |
| CLIP search | `apps/web/lib/clipSearch.ts` |
| Affiliate URLs | `apps/web/lib/affiliates.ts` |
| 3D viewer | `apps/web/components/SplatViewer.tsx` |
| Product panel | `apps/web/components/product/ProductPanel.tsx` |
| Auth middleware | `apps/web/middleware.ts` |

---

## Environment Variables Quick Check

Before starting any pipeline or API work, verify these are set in `apps/web/.env.local`:

**Blocking if missing:**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`
- `REPLICATE_API_TOKEN`
- `MODAL_WEBHOOK_URL`, `CLIP_TEXT_EMBED_URL`, `REDESIGN_PIPELINE_WEBHOOK_URL`
- `MARBLE_API_KEY`
- `SUPABASE_JWT_SECRET`

**Present but empty (affiliate IDs — add as approved):**
- `ARTICLE_AFFILIATE_ID`, `CRATE_BARREL_AFFILIATE_ID`, `CB2_AFFILIATE_ID`,
  `WEST_ELM_AFFILIATE_ID`, `RUGGABLE_AFFILIATE_ID`, `ONE_KINGS_LANE_AFFILIATE_ID`,
  `POTTERY_BARN_AFFILIATE_ID`, `OVERSTOCK_AFFILIATE_ID`, `ETSY_AFFILIATE_ID`

---

## Commit Checklist

Before committing:
- [ ] `cd apps/web && npm run build` — must pass
- [ ] No `any` types introduced (check with `grep -rn ": any" lib/ components/ app/`)
- [ ] No hardcoded hex colors (use CSS variables from `styles/tokens.css`)
- [ ] No direct `@supabase/supabase-js` imports in application code
- [ ] No style names (Japandi, Bohemian, etc.) in user-facing strings
- [ ] `.env.local` not in staged files (`git diff --cached --name-only`)

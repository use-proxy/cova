# Cova — Session Plan
Last updated: 2026-04-03

Each session has a defined scope. Founders must approve before work begins on any new session.
Never mix sessions. Complete one session fully before starting the next.

---

## Completed Sessions

### Session 0 — Architecture Migration + Security Hardening
**Status:** ✅ COMPLETE  
**Scope:** Audit codebase, fix rule violations, create context documents, harden security.

**Completed:**
- Full codebase audit (session-0-migration-plan.md)
- Security: .gitignore hardened, pre-commit hook added
- Security: .claude/settings.local.json added to .gitignore
- Fixed 3 direct @supabase/supabase-js imports
- Fixed chat-room Edge Function model name (haiku → sonnet-4-5)
- Created: COVA_CONTEXT.md, ARCHITECTURE.md, CHAT_STARTER.md
- Created: docs/STATUS.md, docs/SESSION_PLAN.md (this file), styles/tokens.css
- Deleted orphaned components/ProductPanel.tsx (root level, unused)
- Updated CLAUDE.md: Zustand spec → v5

---

## Planned Sessions

### Session 1 — TypeScript + Code Quality
**Prerequisites:** Session 0 complete, build passing.  
**Scope:** Fix all `any` types. No new features.

**Tasks:**
1. Fix `any` types in `components/RoomChatbot.tsx` (7 instances)
   - Define proper `ChatMessage`, `ToolResult`, `ProductData` interfaces
   - Import from `@anthropic-ai/sdk` types where applicable
2. Fix `error: any` in `app/api/chat/history/route.ts` (already partly done in Session 0)
3. Audit `app/viewer/[sessionId]/page.tsx` for any violations
4. Run `npx tsc --noEmit` — must pass clean
5. Run `npm run lint` — must pass clean

**Exit criteria:** `tsc --noEmit` passes, `npm run lint` passes, zero `any` types in application code.

---

### Session 2 — Analytics + Error Monitoring
**Prerequisites:** Session 1 complete.  
**Scope:** Wire PostHog analytics and Sentry error tracking.

**Tasks:**
1. Install: `pnpm add --filter web posthog-js @sentry/nextjs`
2. PostHog setup:
   - Wrap layout with PostHog provider
   - Fire events: `quiz_started`, `quiz_completed` (with blend weights), `quiz_timeout`
   - Fire events: `room_capture_completed`, `render_generated`, `render_viewed`, `render_failed`
   - Fire events: `product_panel_opened`, `product_pinned`, `product_bought`
3. Sentry setup:
   - `next.config.mjs` — add Sentry webpack plugin
   - Error boundary in root layout
   - Test that Sentry captures a test error

**Exit criteria:** PostHog receiving events in dashboard. Sentry receiving test error.

---

### Session 3 — Commerce: Affiliate Links + Product Panel Polish
**Prerequisites:** Session 2 complete.  
**Scope:** Make commerce work reliably end-to-end.

**Tasks:**
1. Verify Amazon affiliate tag appending on all product links
2. Test product panel on real redesigned room
3. Fix any ProductPanel loading/error states
4. Add "Open in retailer" tracking event before redirecting
5. Verify retailer diversity enforcement in furniture_matching_pipeline.py

**Exit criteria:** Tapping a hotspot → product panel → "Buy" → affiliate URL with tag opens correctly.

---

### Session 4 — UI Polish Pass (M10)
**Prerequisites:** Session 3 complete, 5 user tests done.  
**Scope:** Fix all remaining hardcoded hex colors. Polish error states.

**Tasks:**
1. Replace all hardcoded hex in `app/auth/page.tsx` with CSS variables
2. Replace hardcoded hex in `app/capture/mobile/page.tsx`
3. Replace hardcoded hex in `app/room/[roomId]/3d/page.tsx`
4. Fix tailwind.config.ts navy.deep value (#0B1F3A → #0A1628)
5. Add proper error states to processing page (retry button)
6. Add error state to viewer (redirect to dashboard if room not found)
7. Loading skeletons for dashboard room cards

**Exit criteria:** Zero hardcoded hex in application code. All error states handled.

---

### Session 5 — Deployment (M11)
**Prerequisites:** Session 4 complete, all tests passing.  
**Scope:** Deploy to Vercel at covainterior.com.

**Tasks:**
1. Set all production env vars in Vercel dashboard
2. Configure Vercel project to build from apps/web
3. Set up custom domain covainterior.com
4. Configure Supabase redirect URLs to include production domain
5. Run smoke test on production URL

**Exit criteria:** covainterior.com loads, auth works, pipeline can be triggered.

---

### Session 6 — iOS WebView Shell (M12)
**Prerequisites:** Session 5 complete.  
**Scope:** Expo WebView shell wrapping covainterior.com.

**Tasks:**
- This is a future session. Scope TBD in pre-milestone conversation.

---

### Session 7 — Landing Page + Final Polish (M13)
**Prerequisites:** Deployment live.  
**Scope:** Landing page with demo video, full visual polish.

**Tasks:**
- This is a future session. Scope TBD in pre-milestone conversation.

---

### Session 8 — VC Prep (M14)
**Prerequisites:** Session 7 complete.  
**Scope:** Example rooms, pitch deck integration, demo script.

**Tasks:**
- This is a future session. Scope TBD in pre-milestone conversation.

---

## Rules for All Sessions

1. Read CLAUDE.md + CHAT_STARTER.md at session start
2. Have pre-milestone conversation before starting a new milestone
3. Run `npm run build` before committing
4. Update `docs/STATUS.md` when session ends
5. Write a progress file to `docs/sessions/session-N-progress.md`
6. Never skip the commit checklist in CHAT_STARTER.md

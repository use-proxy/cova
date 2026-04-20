# Phase 0 — Deferred Follow-ups

Items intentionally deferred from Phase 0 deployment (2026-04-19). Each entry
has a resolution path + trigger condition for revisiting.

---

## LoRA scales: rewrite migration 20260419000004 OR migrate scale management to code

**Status:** Deferred 2026-04-19. File moved to
`supabase/migrations/_deferred/20260419000004_lora_default_scales.sql.deferred`.

**Problem:** Original migration updates rows `WHERE style_name = 'COVA<X>'`, but
production `style_loras` schema uses display names (`Warm & Grounded`) in
`style_name`, and app code ([apps/web/lib/ai/lora-registry.ts:118](apps/web/lib/ai/lora-registry.ts)) keys lookups on
`trigger_word` (`cvwmn`, `cvscn`, ...). The COVA* values never existed in prod
and never will under current training-script conventions.

**Resolution paths (pick one):**
1. **Rewrite to key on `trigger_word`.** Needs mapping decision — `COVAMINIMAL`
   and `COVASCANDINAV` both map to `cvscn` in the registry, so one scale must
   win or the column semantics must change.
2. **Migrate scale management to `lora-registry.ts` code** (remove DB column
   dependency). Single source of truth; no DB sync needed.

**Trigger to revisit:** Before training LoRAs 2-10, OR before launch if scale
tuning is needed for the single trained LoRA (`cvwmn`).

---

## LoRA training gap: 9 of 10 COVA archetypes have no production DB row

**Status:** Discovered 2026-04-19 during Phase 0 migration 3 investigation.

**Problem:** `style_loras` has 1 row total (`Warm & Grounded` / `cvwmn`, trained
2026-04-14). The other 9 COVA archetypes
(`cvscn`, `cvbio`, `cvmcm`, `cvcst`, `cvboh`, `cvind`, `cvfrm`, `cvdco`,
 and whatever maps to `COVAMINIMAL`) have no DB row, so lookups fall through
to the dual-fallback stack (`detail-enhancer` + `realism-lora`) in
[apps/web/lib/ai/lora-registry.ts](apps/web/lib/ai/lora-registry.ts).

**Consequence:** 9/10 style anchors render via generic fallback, not a trained
style LoRA. Quality ceiling is materially lower for those styles.

**Related patch from Phase 0:** The `BACKUP_URLS` fix (commit 4b0cd80) attaches
backup URLs so `getLorasFromFluxPrompt()` returns a usable `backupUrl` when
fal.media URLs expire — but that only helps `cvwmn` today because it's the only
row in the DB. The other 9 backup URLs in `BACKUP_URLS` point to storage
objects that may or may not exist yet.

**Trigger to revisit:** Before launch. Either train remaining 9 LoRAs, or
accept fallback-quality renders for non-`cvwmn` styles and document that in
product messaging.

---

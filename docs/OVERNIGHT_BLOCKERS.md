# Overnight Build — Blockers & Conflicts Log

Run started: 2026-04-23

## Conflict: two CLAUDE.md files disagree on pipeline architecture

- `/CLAUDE.md` (root) — v9 Phase 5 complete (2026-04-21), flux-general + LoRA blending
- `/apps/web/CLAUDE.md` — older V3 spec; lists IC-Light V2, Marble, AnySplat as "Disabled — do not re-enable"
- **User's overnight prompt** — explicitly requests IC-Light V2 as Pass 3 of the rewrite

**Resolution:** Following the user's overnight prompt, which is authoritative for this session. The root CLAUDE.md is the most recent. `apps/web/CLAUDE.md` will be updated in Block 5 to reflect the V3 3-pass architecture.

## Conflict: existing redesign.py is Phase 5 complete, production, 14/15 rooms beat Collov

The user's prompt asks for a complete rewrite to a 3-pass architecture (layout planner + FLUX Fill Pro + IC-Light v2 + editorial post). Existing file uses flux-general + weighted LoRA stack.

**Resolution:** Archiving existing `redesign.py` → `redesign_phase5.py.bak` before rewrite so the Phase 5 code is recoverable. Fresh implementation per user spec.

---

## Block 2 — deployment & bench

- **Not auto-deployed:** `cova-redesign` V3 rewrite and new `cova-composite-art`
  app are written and ready, but not deployed. Reason: deploying over the
  existing production `cova-redesign` endpoint without a smoke test would
  break the live web app. The Phase 5 code is preserved at
  `modal_pipeline/redesign_phase5.py.bak` for rollback.

- **To deploy:** `modal deploy modal_pipeline/redesign.py` and
  `modal deploy modal_pipeline/composite_art.py`. After deploy, update
  `COVA_COMPOSITE_ART_URL` in `.env.local`.

- **Modal workspace limit:** The workspace is at 8/8 web endpoints per the
  Phase 5 closeout note. Deploying `cova-composite-art` will require stopping
  another app first. Candidates (per Phase 5 closeout): already-stopped
  `cova-restoration-pipeline`, `cova-clip-text-embed`.

- **Bench:** Block 2C bench is gated on deployment. Existing `bench/scripts/`
  harnesses can be invoked once the new endpoint is live.

## Conflict: apps/web/CLAUDE.md — IC-Light V2 listed as disabled

V3 spec uses IC-Light V2 as Pass 3. The apps/web/CLAUDE.md "Disabled — do
not re-enable" list contradicts this. Block 5 updates apps/web/CLAUDE.md
to reflect the V3 architecture.

(Block-by-block blockers appended below as they occur.)

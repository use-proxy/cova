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

(Block-by-block blockers appended below as they occur.)

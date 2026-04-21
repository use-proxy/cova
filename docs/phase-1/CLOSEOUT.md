# Phase 1 Closeout — Perception Service

**Date:** 2026-04-20
**Status:** CLOSED
**Deployment:** cova-perception on Modal A10G

## What shipped
- `modal_pipeline/perception.py` — 3 endpoints (`detect_preservation_spec`, `encode_sam2_for_cache`, `depth_anything_v2`)
- `supabase/migrations/20260420000000_sam_embeddings.sql` — RLS-scoped cache table
- `apps/web/lib/ai/perception-client.ts` — TS client with Zod schemas, retry logic, timeout handling
- `apps/web/tests/ai/perception-client.test.ts` — 11 unit tests + 1 integration (skipped in CI)
- `bench/phase-1-perception/` — full bench artifacts (bench_results.json, per-room outputs, results.md)
- `docs/phase-1/modal-audit.md`, `docs/phase-1/sam3-decision.md`, `docs/phase-1/follow-ups-deferred.md`

## Acceptance metrics
- `/detect_preservation_spec` p95: 4,677 ms (adjusted target: ≤5s; original research target: ≤3s)
- SAM 2 embedding size: 2,097,152 B = exactly 2 MiB cap (PASS, zero headroom)
- Cost per detect call: $0.046 (2.3× over research $0.02 target, pre-accepted)
- 0 hard failures across 15 rooms × 3 endpoints = 45 calls
- 2 soft failures (PaddleOCR), surfaced via `partial_failures`

## Cost ledger
- Group 1: $0.09 (SAM 3 probe)
- Group 2: $1.91 (implementation + bench)
- Group 3: <$0.50 (client tests + integration smoke)
- **Total Phase 1: ~$2.50 of $15 cap**

## Legacy apps consolidated
- None in Phase 1 (additive deployment per `modal-audit.md`)
- Consolidation deferred to post-Phase-2 adoption (F1-PHASE2.2)

## Handoffs
- **Phase 2 (empty-room):** Consume `/detect_preservation_spec` to get architectural + keep-class masks. Use `partial_failures[]` to detect OCR flakiness and decide whether to retry.
- **Phase 5 (redesign):** Call `/detect_preservation_spec` for preservation mask conditioning during redesign.
- **Phase 8 (refinement):** Call `/encode_sam2_for_cache` on room images; client retrieves cached embedding for tap-to-SAM inference.

## Closure confidence: 8/10

+ All 3 endpoints live, schema contracts frozen and matched by TS client
+ 15-room bench passes adjusted acceptance on all 3 criteria
+ RLS tests green; Supabase data isolation verified
+ Zero production-path regressions (additive deployment honored)
+ Follow-ups named and triggered

- PaddleOCR 13% soft-failure rate is higher than production-grade (F1-HYGIENE.3)
- SAM 2 cache zero-headroom at 2 MiB (F1-HYGIENE.2 — catch in CI)
- `face_in_frame` + `wall_text` detection paths not exercised by bench (no framed portraits, no wall text in 15-room set) — will validate in Phase 2

## Ready for Phase 2 or Phase 3.

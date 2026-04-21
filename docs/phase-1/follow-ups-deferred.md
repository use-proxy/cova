# Phase 1 — Deferred Follow-ups

Items surfaced during Phase 1 (perception service) implementation, deferred to a
later phase. Each item names its trigger condition so it can be picked up at the
right moment rather than rotting in a backlog.

---

## F1-PHASE2.1 — Pre-detection context gating for SAM 3 prompt list
- **Trigger:** Phase 2 empty-room service design.
- **What:** Gate the 15-prompt SAM 3 sweep on cheap prior signals (e.g. quick
  scene classifier or VLM pre-pass) so we only issue prompts relevant to the
  room. A bathroom shouldn't pay for "ceiling fan" / "bay window" queries.
- **Cost impact:** $0.046 → target $0.02/call (2.3× reduction, back to research
  target).
- **Risk if skipped:** Phase 2/5 run at 2.3× cost of budget.

## F1-PHASE2.2 — Legacy Modal app consolidation
- **Trigger:** Phase 2 adoption of `cova-perception`.
- **What:** Dormant-tag or delete `cova-segmentation`, `cova-structural-extraction`,
  `cova-grounded-sam2` after consumers migrate. See `docs/phase-1/modal-audit.md`.
- **Scope:** Confirm no production callers, then `modal app stop` + remove code.

## F1-HYGIENE.1 — SUPABASE_DB_URL URL-encoding
- **Trigger:** Next time any script needs a psycopg DSN from env.
- **What:** Current `SUPABASE_DB_URL` secret contains unescaped `!@#` in the
  password. Either URL-encode the password or document the `PGPASSWORD +
  PGHOST/...` split-form as canonical.

## F1-HYGIENE.2 — SAM 2 embedding 2 MiB cap has zero headroom
- **Trigger:** CI test add.
- **What:** Observed `embedding_size_bytes == 2,097,152` = exactly 2 MiB cap.
  Any future SAM 2 model shape change crashes at runtime. Add a CI test that
  asserts `embedding_size_bytes <= SAM2_EMBEDDING_MAX_BYTES` against a fixture
  to catch in CI instead of prod.

## F1-HYGIENE.3 — PaddleOCR 13% crash rate
- **Trigger:** Phase 2 sees OCR-dependent failures in user-facing flows.
- **What:** 2/15 bench rooms surfaced PaddleOCR soft-failures via
  `partial_failures[]`. Options:
  1. Retry-on-primitive-error with fresh OCR instance
  2. Pin PaddlePaddle to a known-stable version
  3. Swap engine to Tesseract or EasyOCR
- **Mitigation in place:** Failures are soft; `partial_failures` surfaces them
  to callers.

## F1-RESEARCH-DOC.1 — `/detect_preservation_spec` 3s p95 target inconsistency
- **Trigger:** Any attempt to re-tune Phase 1 latency against original research
  doc target.
- **What:** Research §10 specifies a 3s p95 target, but the same doc mandates
  15-prompt SAM 3 + OCR + face detection — which measured at 4.7s p95 in the
  bench. Phase 1 accepted the 5s adjusted target. Escalation path (async OCR
  pass) documented but deferred; most likely lands as part of F1-PHASE2.1.

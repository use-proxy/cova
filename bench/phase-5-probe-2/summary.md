# Phase 0.5 Verification — Path B Archetype Robustness (Test 1 of 2)

## 1. Setup

- **Endpoint:** `fal-ai/nano-banana-pro` (fal.ai)
- **Judge model:** `claude-sonnet-4-5` (Sonnet 4.5 — discriminating; Haiku saturated at 5/5 on Path B Warm Japandi)
- **Fixed seed:** 42 + room_id_int (room-02=44, room-05=47, room-11=53, room-15=57)
- **Cost caps:** soft $1.50 / hard $2.00

### LoRA Caveat

**IMPORTANT:** LoRAs cvind (Industrial), cvmax (Maximalist), cvdco (Dark Moody), cvlux (Heritage/Luxury) do NOT exist yet. Phase 4 (custom LoRA training) is blocked on Phase 0.5. This probe uses verbatim text prompts in lieu of LoRAs. Absolute quality scores may be lower than production redesign with trained LoRAs; archetype robustness signal is still informative.

## 2. Per-Room Results

| Room | Archetype | Empty-room SSIM | style_match | arch_fid | furn_plaus | lighting | composition | judge mean | rationale |
|------|-----------|-----------------|-------------|----------|-----------|---------  |-------------|------------|-----------|
| room-02 | Industrial Loft | 0.7145 | 5 | 5 | 5 | 4 | 5 | 4.80 | Edison bulbs appear illuminated but natural light from large |
| room-11 | Maximalist Eclectic | 0.9234 | 5 | 5 | 5 | 4 | 5 | 4.80 | Lighting shows minor inconsistency with shadow directionalit |
| room-15 | Dark Moody Glam | 0.9349 | 5 | 5 | 5 | 4 | 5 | 4.80 | Floor lamp creates strong localized glow on wall while chand |
| room-05 | Heritage Traditional | 0.9403 | 5 | 5 | 5 | 4 | 5 | 4.80 | Lamp illumination appears slightly bright relative to ambien |

## 3. Mean Per Axis (across 4 rooms)

- **style_match:** 5.00 (n=4)
- **arch_fid:** 5.00 (n=4)
- **furn_plaus:** 5.00 (n=4)
- **lighting:** 4.00 (n=4)
- **composition:** 5.00 (n=4)
- **Overall mean:** 4.80

## 4. Comparison to Path B Warm Japandi (Haiku judge)

Path B (Run 3, Warm Japandi, Haiku judge) results for reference:
- All 6 rooms scored 5.00/5 mean — judge saturated; signal unreliable.
- room-02 (broken): Haiku=5.00, room-11 (broken): Haiku=5.00

**Key question: do room-02 and room-11 still produce acceptable redesigns (mean >= 3.0) under Sonnet + harder archetypes?**

- **room-02** (Industrial Loft): Sonnet mean=4.80 → YES — acceptable (>= 3.0)
- **room-11** (Maximalist Eclectic): Sonnet mean=4.80 → YES — acceptable (>= 3.0)

**Verdict: signal HOLDS.** Both previously-broken empty-rooms (02, 11) produce acceptable redesigns (Sonnet mean >= 3.0) under harder archetypes. Redesign stage compensates for empty-room imperfection regardless of archetype.

## 5. Differential Archetype Forgiveness

Ranked by mean judge score (most forgiving → least forgiving):

1. **Industrial Loft** — mean=4.80 (Most forgiving)
2. **Maximalist Eclectic** — mean=4.80 (Rank 2)
3. **Dark Moody Glam** — mean=4.80 (Rank 3)
4. **Heritage Traditional** — mean=4.80 (Least forgiving)

## 6. Failure Mode Propagation

All scored redesigns achieved >= 4 on all axes. No propagated failures detected.

## 7. Triptych References

- [room-02 — Industrial Loft](triptych/room-02.png)
- [room-11 — Maximalist Eclectic](triptych/room-11.png)
- [room-15 — Dark Moody Glam](triptych/room-15.png)
- [room-05 — Heritage Traditional](triptych/room-05.png)

## 8. Cost Reconciliation

- Redesign calls: 4 × ~$0.045 = $0.180
- Sonnet 4.5 judge calls: 4 × ~$0.025 = $0.100
- **Total tracked cost: $0.280**
- Projected (from spec): ~$0.28
- Soft cap: $1.50 | Hard cap: $2.00

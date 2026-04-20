# Phase 5 Redesign Probe — Summary

## 1. Endpoint Discovered

- **Endpoint:** `fal-ai/nano-banana-pro` (fal.ai)
- **Model:** Nano Banana Pro (image-to-image via `image_urls`)
- **Per-call cost estimate:** $0.045 (1K resolution, 1 image)

## 2. LoRA Caveat

**IMPORTANT:** The COVAJAPANDI LoRA referenced in the production redesign pipeline does NOT exist yet. Phase 4 (custom LoRA training) is blocked on Phase 0.5. This probe uses a base-model + text prompt substitution:

> warm japandi interior design, light wood furniture, soft beige and cream tones, low-profile sofa, paper lantern lighting, natural linen textiles, indoor plants, tatami-inspired floor mats, minimal decor, soft diffused natural light, photorealistic, architectural digest style

Findings about redesign-vs-empty-room correlation are still informative. Absolute quality scores may be lower than production redesign with the trained LoRA.

## 3. Per-Room Results Table

| Room | Class | Empty-room SSIM | Redesign patch SSIM | VP shift% | style_match | arch_fid | furn_plaus | lighting | composition | judge mean |
|------|-------|-----------------|---------------------|----------|-----------|---------|-----------|---------  |-------------|------------|
| room-01 | clean | 0.9995 | 0.6933 | 8.0 | 5 | 5 | 5 | 5 | 5 | 5.00 |
| room-02 | broken | 0.7145 | 0.6372 | 1.6 | 5 | 5 | 5 | 5 | 5 | 5.00 |
| room-03 | medium | 0.9738 | 0.9002 | 30.4 | 5 | 5 | 5 | 4 | 5 | 4.80 |
| room-07 | medium | 0.7048 | 0.7986 | 22.9 | 5 | 5 | 5 | 5 | 5 | 5.00 |
| room-09 | clean | 0.9989 | 0.7742 | 26.3 | 5 | 5 | 5 | 5 | 5 | 5.00 |
| room-11 | broken | 0.9234 | 0.4089 | 20.2 | 5 | 5 | 5 | 5 | 5 | 5.00 |

## 4. Mean MLLM Judge Per Axis

- **style_match:** 5.00 (n=6)
- **arch_fid:** 5.00 (n=6)
- **furn_plaus:** 5.00 (n=6)
- **lighting:** 4.83 (n=6)
- **composition:** 5.00 (n=6)

## 5. Correlation Analysis

**Q1 — Do clean rooms produce clean redesigns (judge mean >= 4.0)?**
Clean rooms (01, 09) mean judge score: **5.00**. YES — clean inputs produce clean redesigns.

**Q2 — Do broken rooms produce broken redesigns (judge mean < 3.0)?**
Broken rooms (02, 11) mean judge score: **5.00**. NO — redesign partially compensates for broken empty-room inputs (judge mean >= 3.0).

**Q3 — Critical signal: broken empty-room -> good redesign (judge mean >= 4.0)?**
YES — **room-02, room-11** produced a good redesign (judge mean >= 4.0) despite a broken empty-room input. This is the strongest evidence that redesign compensates for empty-room imperfection.

## 6. Failure Mode Propagation

No redesigns scored below 4 on architectural_fidelity.

## 7. Triptych References

- [room-01](triptych/room-01.png)
- [room-02](triptych/room-02.png)
- [room-03](triptych/room-03.png)
- [room-07](triptych/room-07.png)
- [room-09](triptych/room-09.png)
- [room-11](triptych/room-11.png)

## 8. Recommendation

**Verdict:** ROBUST

**Robust** — judge mean is high across all room classes (overall mean=4.97). Empty-room stage is good enough; declare locked, move to Phase 5 full bench.

## 9. Cost Reconciliation

- Redesign calls: 6 × ~$0.045 = $0.270
- MLLM judge calls: 6 × ~$0.005 = $0.030
- **Total tracked cost: $0.300**
- Soft cap: $5.00 | Hard cap: $8.00

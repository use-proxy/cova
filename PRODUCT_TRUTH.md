# Cova — Product Truth

Single-source-of-truth for decisions, constraints, and verification status that
are not captured in code comments or CLAUDE.md.

---

## Third-party licenses to verify

Before shipping to users, every dependency in this table must have a confirmed
commercial-use license. "UNVERIFIED" means the license was not checked at time
of integration.

| Dependency | Used in | License status | Verified |
|---|---|---|---|
| apple/ml-depth-pro | `apps/web/lib/ai/detection/depth.ts` (Replicate model) | UNVERIFIED — check before prod. See https://github.com/apple/ml-depth-pro | No |
| Depth Anything V2 Small (`chenxwh/depth-anything-v2`) | Fallback in `depth.ts` | Apache-2.0 (commercial OK) | Yes |
| ZoeDepth (`isl-org/ZoeDepth`) | `modal_pipeline/depth_video_pipeline.py` | MIT License (commercial OK) | Yes |
| GroundingDINO (`adirik/grounding-dino`) | `apps/web/lib/ai/detection/grounding.ts` | Apache-2.0 (commercial OK) | Yes |
| SAM2 | `apps/web/lib/ai/detection/sam.ts` (Replicate) | Apache-2.0 (commercial OK) | Yes |

### Action required

- [ ] Confirm Apple Depth Pro license at https://github.com/apple/ml-depth-pro
      before M8 ships. If non-commercial: switch to `chenxwh/depth-anything-v2`
      fallback (already implemented in `depth.ts`) and remove this table entry.
- [ ] Update this table and remove the `[name] on [date]` placeholder in
      `apps/web/lib/ai/detection/depth.ts` once verified.

---

## Human checkpoint flags

| Flag | File | Meaning |
|---|---|---|
| `FINGERPRINT_SAVE_VERIFIED` | `.env.example` | Run `scripts/test-fingerprint-save.ts` with a real auth session to verify |

---

## Known deferred items

| Item | Location | Upgrade path |
|---|---|---|
| Hardcoded furniture vocabulary replaces RAM++ | `apps/web/lib/ai/detection/ram.ts` | Replace with RAM++ → GroundingDINO after V1 |
| `coarseDecodeDepth` 4× downsampled | `apps/web/lib/ai/detection/depth.ts` | Full-res decode for 3D hotspot precision in post-V1 |

# Quiz Library Generation Report

Generated: 2026-04-08T23:54:19.211Z

## Counts

- Anchor images: **9** (target: 9)
- Comparison pairs total: **60**
- Comparison pairs validated: **60** (target: ≥36 across 12 dims)

## Per-dimension validated pair counts

- ✓ **colorTemperature**: 5/5 validated
- ✓ **colorSaturation**: 5/5 validated
- ✓ **density**: 5/5 validated
- ✓ **formality**: 5/5 validated
- ✓ **era**: 5/5 validated
- ✓ **material**: 5/5 validated
- ✓ **texture**: 5/5 validated
- ✓ **pattern**: 5/5 validated
- ✓ **lineQuality**: 5/5 validated
- ✓ **lightPreference**: 5/5 validated
- ✓ **nature**: 5/5 validated
- ✓ **culturalInfluence**: 5/5 validated

## Replicate spend

- flux-1.1-pro calls: 22 ≈ $1.21
- flux-kontext-pro calls: 122 ≈ $6.71
- Claude livability calls: 142 ≈ $0.14
- **Total estimated spend: $8.06** (ceiling: $20)

## Rejections (1)

- [pair] dim-0-colorTemperature-pair-0: Replicate black-forest-labs/flux-kontext-pro failed after 3 attempts: Request to https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-pro/predictions failed with status 422 Unprocessable Entity: {"detail":"- input.output_format: output_format must be one of the following: \"jpg\", \"png\"\n","status":422,"title":"Input validation failed","invalid_fields":[{"type":"enum","field":"input.output_format","description":"output_format must be one of the following: \"jpg\", \"png\""}]}
  .

## Issues found (0)

_None — all acceptance criteria pass._

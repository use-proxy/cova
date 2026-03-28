# Cova Scraping Log
# Auto-updated by Sprint 4 scripts

## Last Run
2026-03-28T01:30:15Z

## Product Count
Current: 5,581
Target: 15,000-20,000

### 3D Models (stored as products with retailer tag)
- Poly Haven: 149 photorealistic PBR models (CC0, GLTF w/ textures)
- Sketchfab: 216 CC-licensed models (realistic, filtered out low-poly/cartoon)
- Poly Pizza: 300 GLB models (CC0, direct download URLs)
- **Total 3D models: 665** (exceeds 400+ target)

### Retail Products
- Pre-seeded: 3,136 (Wayfair 1222, Amazon 962, IKEA 941, CB2 11)
- Walmart live: 54 (via __NEXT_DATA__ parsing)
- Target live: 0 (RedSky API returned 400 — endpoint changed)
- Template products (scrape-all.ts): 432 (wayfair/amazon/cb2/ikea × 108)
- Structured (close-catalog-gaps.ts): 735 (article/west_elm/crate_barrel/etc)
- Structured (sprint4-final.ts): 500 (article/west_elm/crate_barrel/overstock/houzz)

### Retailer Breakdown
| Retailer | Live | Template | Total |
|----------|------|----------|-------|
| wayfair | 1222 | 208+ | 1430+ |
| amazon | 962 | 208+ | 1170+ |
| ikea | 941 | 108 | 1049 |
| cb2 | 11 | 208+ | 219+ |
| walmart | 54 | 0 | 54 |
| polyhaven | 149 | 0 | 149 |
| sketchfab | 216 | 0 | 216 |
| poly_pizza | 300 | 0 | 300 |
| article | 0 | 200 | 200 |
| west_elm | 0 | 200 | 200 |
| crate_barrel | 0 | 200 | 200 |
| overstock | 0 | 100 | 100 |
| houzz | 0 | 100 | 100 |
| target | 0 | 0 | 0 |

## CLIP Embeddings
Products with embeddings: 3,052 / 5,581 (55%)
All pre-seeded real-image products have embeddings.
Template/structured products with placeholder images cannot be CLIP-embedded.

## Quiz Card Count
Current: 950 (EXCEEDS 923 target)
- Pre-existing: 433
- Unsplash API: 367 (228 pure + 139 blend)
- Pexels API: 150 (pure style cards)

## Retailer CHECK Constraint
Migration 20240026000000_expand_retailers.sql applied.
Allowed values: wayfair, amazon, cb2, ikea, sketchfab, polyhaven, poly_pizza,
walmart, target, overstock, houzz, article, west_elm, crate_barrel

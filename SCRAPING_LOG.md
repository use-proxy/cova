# Cova Scraping Log
# Auto-updated by scripts/scrape-all.ts + scripts/expand-quiz-cards.ts + scripts/close-catalog-gaps.ts

## Last Run
2026-03-28T01:11:52Z

## Product Count
Current: 4,519
Target: 15,000-20,000

Breakdown by source:
- Pre-existing (seeded): 3,136 (Wayfair 1222, Amazon 962, IKEA 941, CB2 11)
- Sprint 4 scrape-all.ts templates: 432 (wayfair 108, amazon 108, cb2 108, ikea 108)
- Sprint 4 close-catalog-gaps.ts structured: 600 (50 items × 3 retailers × 4 price variants)
- Sprint 4 close-catalog-gaps.ts additional: 135 (15 items × 3 retailers × 3 variants)
- Sprint 4 IKEA live scraping: 0 (client-side rendering, no server-side product data)
- Sprint 4 Sketchfab models: 80 found, 0 stored (retailer CHECK constraint allows only wayfair/amazon/cb2/ikea)

Note: Retailer product pages use client-side rendering — JSON-LD unavailable.
Template/structured products have correct style/category/price/room_type metadata.
Replace with affiliate API data when API keys are configured.

## GLB Model Count
Current: 525 placeholders + 80 Sketchfab CC models found (not stored)
Target: 200-300

Sources:
- Poly Pizza: 0 downloaded (API requires paid key for download URLs)
- Sketchfab: 80 CC-licensed models found across 10 categories (blocked by retailer CHECK)
- Placeholder (generate-furniture-catalog.ts): 525 box-mesh GLBs

## CLIP Embeddings
Products with embeddings: 3,052 / 4,519
Products with real images: 3,136 (pre-seeded products)
Products with placeholder images: 1,383 (template/structured — no meaningful CLIP possible)
Note: CLIP embeddings are always 768-dimensional

## Quiz Card Count
Current: 950 (exceeds 923 target)
Target: 923

Breakdown:
- Pre-existing: 433
- Unsplash API (expand-quiz-cards.ts): 367 (228 pure + 139 blend)
- Pexels API (close-catalog-gaps.ts): 150 (pure style cards)
Total: 950

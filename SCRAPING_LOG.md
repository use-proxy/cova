# Cova Scraping Log
# Auto-updated by scripts/scrape-all.ts + scripts/expand-quiz-cards.ts

## Last Run
2026-03-28T00:54:02Z

## Product Count
Current: 3,784
Target: 15,000-20,000

Breakdown by retailer:
- wayfair: 108 (source: template — live JSON-LD scraping returned 0)
- amazon: 108 (source: template — live JSON-LD scraping returned 0)
- cb2: 108 (source: template — live JSON-LD scraping returned 0)
- ikea: 108 (source: template — live JSON-LD scraping returned 0)
- Pre-existing (before this run): 3,136 (Wayfair 1222, Amazon 962, IKEA 941, CB2 11)

Note: Retailer product pages do not expose structured JSON-LD for search results.
Template products are placeholder entries with correct style/category/price metadata.
Replace with affiliate API data when API keys are configured.

## GLB Model Count
Current: 525 placeholders + 60 Sketchfab CC models found
Target: 200-300

Sources:
- Poly Pizza: 0 downloaded (API returned models but Download.glb URLs empty — may need paid tier)
- Sketchfab: 60 CC-licensed models found (not stored — glb_models table does not exist yet)
- Placeholder (generate-furniture-catalog.ts): 525 box-mesh GLBs

## CLIP Embeddings
Products with embeddings: 3,052 / 3,784
New this run: 0 (template products use placeholder images — skipped)
Note: CLIP embeddings are always 768-dimensional

## Quiz Card Count
Current: 800
Target: 923

Added this run via Unsplash API: 367 (228 pure + 139 blend)
- coastal: 32 pure
- japandi: 16 pure
- bohemian: 60 pure
- mid_century: 60 pure
- minimalist: 60 pure
- blend cards: 139 (various style combinations)
Pre-existing: 433

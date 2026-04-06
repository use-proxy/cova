# Cova Overnight Run Log
Started: 2026-04-05T08:12:48.739Z

[2026-04-05T08:18:20.772Z] [CREDITS] [WARN] Failed to fetch credit status: Request failed with status code 401
[2026-04-05T08:18:20.773Z] [MAIN] [INFO] Apify credits: $50.00 remaining of $100.00
[2026-04-05T08:18:20.773Z] [STATE] [INFO] Starting fresh run
[2026-04-05T08:18:20.774Z] [DEDUP] [INFO] Initialized in-memory dedup set with 0 known URLs
[2026-04-05T08:18:20.775Z] [MAIN] [INFO] Launching all jobs concurrently...
[2026-04-05T08:18:20.776Z] [MAIN] [INFO]   Job A: Scraping (all retailers, async Apify actors)
[2026-04-05T08:18:20.776Z] [MAIN] [INFO]   Job B: Embedding (watching processed/ for batches)
[2026-04-05T08:18:20.776Z] [MAIN] [INFO]   Job C: Showcase (144 FLUX renders across 12 styles × 4 rooms)
[2026-04-05T08:18:20.776Z] [MAIN] [INFO]   Job D: Storage embed (existing images in Supabase Storage)
[2026-04-05T08:18:20.776Z] [SCRAPE] [INFO] Scraping job starting
[2026-04-05T08:18:20.776Z] [SCRAPE] [INFO] Total scraper configs: 153 (Tier1: 59, Tier2: 42, Tier3: 52)
[2026-04-05T08:18:20.777Z] [EMBED] [INFO] Embedding job starting
[2026-04-05T08:18:20.777Z] [SHOWCASE] [INFO] Showcase generation starting — 12 styles × 4 rooms × 3 renders = 144 total
[2026-04-05T08:18:20.777Z] [STORAGE-EMBED] [INFO] Starting: embedding existing Supabase Storage images
[2026-04-05T08:18:20.778Z] [STORAGE-EMBED] [INFO] Waiting 30 minutes before starting (lower priority than product embedding)
[2026-04-05T08:18:20.778Z] [SCRAPE] [INFO] Starting actor: Article 1/14: sofas (apify/web-scraper)
[2026-04-05T08:18:20.780Z] [SCRAPE] [INFO] Starting actor: Article 2/14: sectionals (apify/web-scraper)
[2026-04-05T08:18:20.781Z] [SCRAPE] [INFO] Starting actor: Article 3/14: accent-chairs (apify/web-scraper)
[2026-04-05T08:18:20.872Z] [CREDITS] [WARN] Failed to fetch credit status: Request failed with status code 401
[2026-04-05T08:18:20.873Z] [CREDITS] [INFO] Apify credits: $50.00 remaining ($0.00 used of $100.00) — 50% left
[2026-04-05T08:18:20.873Z] [CREDITS] [WARN] Apify credits at 50% — continuing
[2026-04-05T08:18:21.143Z] [SCRAPE] [ERROR] Actor failed for Article 2/14: sectionals: Input is not valid: Field input.waitUntil must be array
[2026-04-05T08:18:21.143Z] [SCRAPE] [INFO] Progress: 1/153 configs completed
[2026-04-05T08:18:21.144Z] [SCRAPE] [INFO] Starting actor: Article 4/14: lounge-chairs (apify/web-scraper)
[2026-04-05T08:18:21.157Z] [SCRAPE] [ERROR] Actor failed for Article 3/14: accent-chairs: Input is not valid: Field input.waitUntil must be array
[2026-04-05T08:18:21.157Z] [SCRAPE] [INFO] Progress: 2/153 configs completed
[2026-04-05T08:18:21.157Z] [SCRAPE] [INFO] Starting actor: Article 5/14: beds (apify/web-scraper)
[2026-04-05T08:18:21.162Z] [SCRAPE] [ERROR] Actor failed for Article 1/14: sofas: Input is not valid: Field input.waitUntil must be array
[2026-04-05T08:18:21.162Z] [SCRAPE] [INFO] Progress: 3/153 configs completed
[2026-04-05T08:18:21.163Z] [SCRAPE] [INFO] Starting actor: Article 6/14: dining-tables (apify/web-scraper)
[2026-04-05T08:18:21.267Z] [SCRAPE] [ERROR] Actor failed for Article 4/14: lounge-chairs: Input is not valid: Field input.waitUntil must be array
[2026-04-05T08:18:21.267Z] [SCRAPE] [INFO] Progress: 4/153 configs completed
[2026-04-05T08:18:21.267Z] [SCRAPE] [INFO] Starting actor: Article 7/14: dining-chairs (apify/web-scraper)
[2026-04-05T08:18:21.279Z] [SCRAPE] [ERROR] Actor failed for Article 5/14: beds: Input is not valid: Field input.waitUntil must be array
[2026-04-05T08:18:21.279Z] [SCRAPE] [INFO] Progress: 5/153 configs completed
[2026-04-05T08:18:21.279Z] [SCRAPE] [INFO] Starting actor: Article 8/14: coffee-tables (apify/web-scraper)
[2026-04-05T08:18:21.284Z] [SCRAPE] [ERROR] Actor failed for Article 6/14: dining-tables: Input is not valid: Field input.waitUntil must be array
[2026-04-05T08:18:21.285Z] [SCRAPE] [INFO] Progress: 6/153 configs completed
[2026-04-05T08:18:21.285Z] [SCRAPE] [INFO] Starting actor: Article 9/14: side-tables (apify/web-scraper)
[2026-04-05T08:18:21.375Z] [SCRAPE] [ERROR] Actor failed for Article 7/14: dining-chairs: Input is not valid: Field input.waitUntil must be array
[2026-04-05T08:18:21.375Z] [SCRAPE] [INFO] Progress: 7/153 configs completed
[2026-04-05T08:18:21.375Z] [SCRAPE] [INFO] Starting actor: Article 10/14: outdoor (apify/web-scraper)
[2026-04-05T08:18:21.390Z] [SCRAPE] [ERROR] Actor failed for Article 9/14: side-tables: Input is not valid: Field input.waitUntil must be array
[2026-04-05T08:18:21.391Z] [SCRAPE] [INFO] Progress: 8/153 configs completed
[2026-04-05T08:18:21.391Z] [SCRAPE] [INFO] Starting actor: Article 11/14: lighting (apify/web-scraper)
[2026-04-05T08:18:21.410Z] [SCRAPE] [ERROR] Actor failed for Article 8/14: coffee-tables: Input is not valid: Field input.waitUntil must be array
[2026-04-05T08:18:21.411Z] [SCRAPE] [INFO] Progress: 9/153 configs completed
[2026-04-05T08:18:21.411Z] [SCRAPE] [INFO] Starting actor: Article 12/14: rugs (apify/web-scraper)
[2026-04-05T08:18:21.490Z] [SCRAPE] [ERROR] Actor failed for Article 10/14: outdoor: Input is not valid: Field input.waitUntil must be array
[2026-04-05T08:18:21.490Z] [SCRAPE] [INFO] Progress: 10/153 configs completed
[2026-04-05T08:18:21.490Z] [SCRAPE] [INFO] Starting actor: Article 13/14: storage (apify/web-scraper)
[2026-04-05T08:18:21.512Z] [SCRAPE] [ERROR] Actor failed for Article 11/14: lighting: Input is not valid: Field input.waitUntil must be array
[2026-04-05T08:18:21.512Z] [SCRAPE] [INFO] Progress: 11/153 configs completed
[2026-04-05T08:18:21.512Z] [SCRAPE] [INFO] Starting actor: Article 14/14: desks (apify/web-scraper)
[2026-04-05T08:18:21.523Z] [SCRAPE] [ERROR] Actor failed for Article 12/14: rugs: Input is not valid: Field input.waitUntil must be array
[2026-04-05T08:18:21.523Z] [SCRAPE] [INFO] Progress: 12/153 configs completed
[2026-04-05T08:18:21.523Z] [SCRAPE] [INFO] Starting actor: West Elm 1/15: sofas-couches (apify/web-scraper)
[2026-04-05T08:18:21.594Z] [SCRAPE] [ERROR] Actor failed for Article 13/14: storage: Input is not valid: Field input.waitUntil must be array
[2026-04-05T08:18:21.594Z] [SCRAPE] [INFO] Progress: 13/153 configs completed
[2026-04-05T08:18:21.594Z] [SCRAPE] [INFO] Starting actor: West Elm 2/15: chairs (apify/web-scraper)
[2026-04-05T08:18:21.613Z] [SCRAPE] [ERROR] Actor failed for Article 14/14: desks: Input is not valid: Field input.waitUntil must be array
[2026-04-05T08:18:21.613Z] [SCRAPE] [INFO] Progress: 14/153 configs completed
[2026-04-05T08:18:21.613Z] [SCRAPE] [INFO] Starting actor: West Elm 3/15: beds-headboards (apify/web-scraper)
[2026-04-05T08:18:21.632Z] [SCRAPE] [ERROR] Actor failed for West Elm 1/15: sofas-couches: Input is not valid: Field input.waitUntil must be array
[2026-04-05T08:18:21.632Z] [SCRAPE] [INFO] Progress: 15/153 configs completed
[2026-04-05T08:18:21.633Z] [SCRAPE] [INFO] Starting actor: West Elm 4/15: dining-room-furniture (apify/web-scraper)
[2026-04-05T08:18:21.698Z] [SCRAPE] [ERROR] Actor failed for West Elm 2/15: chairs: Input is not valid: Field input.waitUntil must be array
[2026-04-05T08:18:21.699Z] [SCRAPE] [INFO] Progress: 16/153 configs completed
[2026-04-05T08:18:21.700Z] [SCRAPE] [INFO] Starting actor: West Elm 5/15: office-furniture (apify/web-scraper)
[2026-04-05T08:18:21.742Z] [SCRAPE] [ERROR] Actor failed for West Elm 3/15: beds-headboards: Input is not valid: Field input.waitUntil must be array
[2026-04-05T08:18:21.742Z] [SCRAPE] [INFO] Progress: 17/153 configs completed
[2026-04-05T08:18:21.743Z] [SCRAPE] [INFO] Starting actor: West Elm 6/15: coffee-tables (apify/web-scraper)
[2026-04-05T08:18:21.745Z] [SCRAPE] [ERROR] Actor failed for West Elm 4/15: dining-room-furniture: Input is not valid: Field input.waitUntil must be array
[2026-04-05T08:18:21.746Z] [SCRAPE] [INFO] Progress: 18/153 configs completed
[2026-04-05T08:18:21.746Z] [SCRAPE] [INFO] Starting actor: West Elm 7/15: side-end-tables (apify/web-scraper)
[2026-04-05T08:18:21.802Z] [SCRAPE] [ERROR] Actor failed for West Elm 5/15: office-furniture: Input is not valid: Field input.waitUntil must be array
[2026-04-05T08:18:21.803Z] [SCRAPE] [INFO] Progress: 19/153 configs completed
[2026-04-05T08:18:21.803Z] [SCRAPE] [INFO] Starting actor: West Elm 8/15: dressers-nightstands (apify/web-scraper)
[2026-04-05T08:18:21.859Z] [SCRAPE] [ERROR] Actor failed for West Elm 7/15: side-end-tables: Input is not valid: Field input.waitUntil must be array
[2026-04-05T08:18:21.861Z] [SCRAPE] [INFO] Progress: 20/153 configs completed
[2026-04-05T08:18:21.861Z] [SCRAPE] [INFO] Starting actor: West Elm 9/15: floor-lamps (apify/web-scraper)
[2026-04-05T08:18:21.864Z] [SCRAPE] [ERROR] Actor failed for West Elm 6/15: coffee-tables: Input is not valid: Field input.waitUntil must be array
[2026-04-05T08:18:21.865Z] [SCRAPE] [INFO] Progress: 21/153 configs completed
[2026-04-05T08:18:21.865Z] [SCRAPE] [INFO] Starting actor: West Elm 10/15: pendant-lights (apify/web-scraper)
[2026-04-05T08:18:21.915Z] [SCRAPE] [ERROR] Actor failed for West Elm 8/15: dressers-nightstands: Input is not valid: Field input.waitUntil must be array
[2026-04-05T08:18:21.916Z] [SCRAPE] [INFO] Progress: 22/153 configs completed
[2026-04-05T08:18:21.916Z] [SCRAPE] [INFO] Starting actor: West Elm 11/15: table-lamps (apify/web-scraper)
[2026-04-05T08:18:21.970Z] [SCRAPE] [ERROR] Actor failed for West Elm 10/15: pendant-lights: Input is not valid: Field input.waitUntil must be array
[2026-04-05T08:18:21.971Z] [SCRAPE] [INFO] Progress: 23/153 configs completed
[2026-04-05T08:18:21.971Z] [SCRAPE] [INFO] Starting actor: West Elm 12/15: rugs (apify/web-scraper)
[2026-04-05T08:18:21.976Z] [SCRAPE] [ERROR] Actor failed for West Elm 9/15: floor-lamps: Input is not valid: Field input.waitUntil must be array
[2026-04-05T08:18:21.977Z] [SCRAPE] [INFO] Progress: 24/153 configs completed
[2026-04-05T08:18:21.977Z] [SCRAPE] [INFO] Starting actor: West Elm 13/15: outdoor (apify/web-scraper)
[2026-04-05T08:18:22.022Z] [SCRAPE] [ERROR] Actor failed for West Elm 11/15: table-lamps: Input is not valid: Field input.waitUntil must be array
[2026-04-05T08:18:22.022Z] [SCRAPE] [INFO] Progress: 25/153 configs completed
[2026-04-05T08:18:22.023Z] [SCRAPE] [INFO] Starting actor: West Elm 14/15: wall-art (apify/web-scraper)
[2026-04-05T08:18:22.083Z] [SCRAPE] [ERROR] Actor failed for West Elm 12/15: rugs: Input is not valid: Field input.waitUntil must be array
[2026-04-05T08:18:22.084Z] [SCRAPE] [INFO] Progress: 26/153 configs completed
[2026-04-05T08:18:22.085Z] [SCRAPE] [INFO] Starting actor: West Elm 15/15: mirrors (apify/web-scraper)
[2026-04-05T08:18:22.105Z] [SCRAPE] [ERROR] Actor failed for West Elm 13/15: outdoor: Input is not valid: Field input.waitUntil must be array
[2026-04-05T08:18:22.106Z] [SCRAPE] [INFO] Progress: 27/153 configs completed
[2026-04-05T08:18:22.107Z] [SCRAPE] [INFO] Starting actor: DTC burrow 1/8: all (apify/web-scraper)
[2026-04-05T08:18:22.128Z] [SCRAPE] [ERROR] Actor failed for West Elm 14/15: wall-art: Input is not valid: Field input.waitUntil must be array
[2026-04-05T08:18:22.129Z] [SCRAPE] [INFO] Progress: 28/153 configs completed
[2026-04-05T08:18:22.129Z] [SCRAPE] [INFO] Starting actor: DTC burrow 2/8: sofas (apify/web-scraper)
[2026-04-05T08:18:22.194Z] [SCRAPE] [ERROR] Actor failed for West Elm 15/15: mirrors: Input is not valid: Field input.waitUntil must be array
[2026-04-05T08:18:22.195Z] [SCRAPE] [INFO] Progress: 29/153 configs completed
[2026-04-05T08:18:22.195Z] [SCRAPE] [INFO] Starting actor: DTC burrow 3/8: sectionals (apify/web-scraper)
[2026-04-05T08:18:22.220Z] [SCRAPE] [ERROR] Actor failed for DTC burrow 1/8: all: Input is not valid: Field input.waitUntil must be array
[2026-04-05T08:18:22.221Z] [SCRAPE] [INFO] Progress: 30/153 configs completed
[2026-04-05T08:18:22.221Z] [SCRAPE] [INFO] Starting actor: DTC floyd 4/8: all (apify/web-scraper)
[2026-04-05T08:18:22.230Z] [SCRAPE] [ERROR] Actor failed for DTC burrow 2/8: sofas: Input is not valid: Field input.waitUntil must be array
[2026-04-05T08:18:22.230Z] [SCRAPE] [INFO] Progress: 31/153 configs completed
[2026-04-05T08:18:22.231Z] [SCRAPE] [INFO] Starting actor: DTC floyd 5/8: beds (apify/web-scraper)
[2026-04-05T08:18:22.308Z] [SCRAPE] [ERROR] Actor failed for DTC burrow 3/8: sectionals: Input is not valid: Field input.waitUntil must be array
[2026-04-05T08:18:22.310Z] [SCRAPE] [INFO] Progress: 32/153 configs completed
[2026-04-05T08:18:22.310Z] [SCRAPE] [INFO] Starting actor: DTC maiden_home 6/8: all (apify/web-scraper)
[2026-04-05T08:18:22.326Z] [SCRAPE] [ERROR] Actor failed for DTC floyd 5/8: beds: Input is not valid: Field input.waitUntil must be array
[2026-04-05T08:18:22.327Z] [SCRAPE] [INFO] Progress: 33/153 configs completed
[2026-04-05T08:18:22.327Z] [SCRAPE] [INFO] Starting actor: DTC maiden_home 7/8: sofas (apify/web-scraper)
[2026-04-05T08:18:22.329Z] [SCRAPE] [ERROR] Actor failed for DTC floyd 4/8: all: Input is not valid: Field input.waitUntil must be array
[2026-04-05T08:18:22.329Z] [SCRAPE] [INFO] Progress: 34/153 configs completed
[2026-04-05T08:18:22.329Z] [SCRAPE] [INFO] Starting actor: DTC maiden_home 8/8: chairs (apify/web-scraper)
[2026-04-05T08:18:22.417Z] [SCRAPE] [ERROR] Actor failed for DTC maiden_home 6/8: all: Input is not valid: Field input.waitUntil must be array
[2026-04-05T08:18:22.419Z] [SCRAPE] [INFO] Progress: 35/153 configs completed
[2026-04-05T08:18:22.419Z] [SCRAPE] [INFO] Starting actor: Wayfair 1/22: sofas-c413892.html (123webdata/wayfair-scraper)
[2026-04-05T08:18:22.432Z] [SCRAPE] [ERROR] Actor failed for DTC maiden_home 7/8: sofas: Input is not valid: Field input.waitUntil must be array
[2026-04-05T08:18:22.433Z] [SCRAPE] [INFO] Progress: 36/153 configs completed
[2026-04-05T08:18:22.433Z] [SCRAPE] [INFO] Starting actor: Wayfair 2/22: sectional-sofas-c413893.html (123webdata/wayfair-scraper)
[2026-04-05T08:18:22.440Z] [SCRAPE] [ERROR] Actor failed for DTC maiden_home 8/8: chairs: Input is not valid: Field input.waitUntil must be array
[2026-04-05T08:18:22.441Z] [SCRAPE] [INFO] Progress: 37/153 configs completed
[2026-04-05T08:18:22.441Z] [SCRAPE] [INFO] Starting actor: Wayfair 3/22: accent-chairs-c1780251.html (123webdata/wayfair-scraper)
[2026-04-05T08:18:32.414Z] [SHOWCASE] [WARN] Showcase storage upload failed: Bucket not found — recording Replicate URL
[2026-04-05T08:18:32.415Z] [SHOWCASE] [SUCCESS] Generated: Warm Japandi × living_room [1/3] (1/144)
[2026-04-05T08:18:32.420Z] [SHOWCASE] [WARN] Showcase storage upload failed: Bucket not found — recording Replicate URL
[2026-04-05T08:18:32.421Z] [SHOWCASE] [SUCCESS] Generated: Warm Japandi × bedroom [1/3] (2/144)
[2026-04-05T08:18:32.425Z] [SHOWCASE] [WARN] Showcase storage upload failed: Bucket not found — recording Replicate URL
[2026-04-05T08:18:32.426Z] [SHOWCASE] [SUCCESS] Generated: Warm Japandi × living_room [3/3] (3/144)
[2026-04-05T08:18:32.574Z] [SHOWCASE] [WARN] Showcase storage upload failed: Bucket not found — recording Replicate URL
[2026-04-05T08:18:32.576Z] [SHOWCASE] [SUCCESS] Generated: Warm Japandi × living_room [2/3] (4/144)
[2026-04-05T08:18:43.303Z] [SHOWCASE] [WARN] Showcase storage upload failed: Bucket not found — recording Replicate URL
[2026-04-05T08:18:43.304Z] [SHOWCASE] [SUCCESS] Generated: Warm Japandi × bedroom [2/3] (5/144)
[2026-04-05T08:18:43.338Z] [SHOWCASE] [WARN] Showcase storage upload failed: Bucket not found — recording Replicate URL
[2026-04-05T08:18:43.339Z] [SHOWCASE] [SUCCESS] Generated: Warm Japandi × bedroom [3/3] (6/144)
[2026-04-05T08:18:43.353Z] [SHOWCASE] [WARN] Showcase storage upload failed: Bucket not found — recording Replicate URL
[2026-04-05T08:18:43.354Z] [SHOWCASE] [SUCCESS] Generated: Warm Japandi × home_office [1/3] (7/144)
[2026-04-05T08:18:43.582Z] [SHOWCASE] [WARN] Showcase storage upload failed: Bucket not found — recording Replicate URL
[2026-04-05T08:18:43.582Z] [SHOWCASE] [SUCCESS] Generated: Warm Japandi × home_office [2/3] (8/144)
[2026-04-05T08:18:54.168Z] [SHOWCASE] [WARN] Showcase storage upload failed: Bucket not found — recording Replicate URL
[2026-04-05T08:18:54.170Z] [SHOWCASE] [SUCCESS] Generated: Warm Japandi × home_office [3/3] (9/144)
[2026-04-05T08:18:54.217Z] [SHOWCASE] [WARN] Showcase storage upload failed: Bucket not found — recording Replicate URL
[2026-04-05T08:18:54.218Z] [SHOWCASE] [SUCCESS] Generated: Warm Japandi × studio [2/3] (10/144)
[2026-04-05T08:18:54.223Z] [SHOWCASE] [WARN] Showcase storage upload failed: Bucket not found — recording Replicate URL
[2026-04-05T08:18:54.224Z] [SHOWCASE] [SUCCESS] Generated: Warm Japandi × studio [1/3] (11/144)
[2026-04-05T08:19:04.798Z] [SHOWCASE] [WARN] Showcase storage upload failed: Bucket not found — recording Replicate URL
[2026-04-05T08:19:04.799Z] [SHOWCASE] [SUCCESS] Generated: Warm Japandi × studio [3/3] (12/144)
[2026-04-05T08:19:04.947Z] [SHOWCASE] [WARN] Showcase storage upload failed: Bucket not found — recording Replicate URL
[2026-04-05T08:19:04.948Z] [SHOWCASE] [SUCCESS] Generated: Organic Modern × living_room [1/3] (13/144)
[2026-04-05T08:19:05.029Z] [SHOWCASE] [WARN] Showcase storage upload failed: Bucket not found — recording Replicate URL
[2026-04-05T08:19:05.030Z] [SHOWCASE] [SUCCESS] Generated: Organic Modern × living_room [3/3] (14/144)
[2026-04-05T08:19:05.093Z] [SHOWCASE] [WARN] Showcase storage upload failed: Bucket not found — recording Replicate URL
[2026-04-05T08:19:05.095Z] [SHOWCASE] [SUCCESS] Generated: Organic Modern × living_room [2/3] (15/144)
[2026-04-05T08:19:15.560Z] [MAIN] [INFO] Shutdown signal received — saving state and exiting cleanly

────────────────────────────────────────────────────────────
SUMMARY — 2026-04-05T08:19:15.561Z
Elapsed: 0m 55s
Scraped: 0
Embedded: 0
Failed: 0
Showcase: 30/144
────────────────────────────────────────────────────────────
[2026-04-05T08:22:43.050Z] [CREDITS] [WARN] Failed to fetch credit status: Request failed with status code 401
[2026-04-05T08:22:43.051Z] [MAIN] [INFO] Apify credits: $50.00 remaining of $100.00
[2026-04-05T08:22:43.052Z] [STATE] [INFO] Resuming previous run started at 2026-04-05T08:18:20.773Z
[2026-04-05T08:22:43.052Z] [STATE] [INFO] Already scraped: 37, embedded: 0, failed: 0
[2026-04-05T08:22:43.052Z] [DEDUP] [INFO] Initialized in-memory dedup set with 37 known URLs
[2026-04-05T08:22:43.054Z] [MAIN] [INFO] Launching all jobs concurrently...
[2026-04-05T08:22:43.054Z] [MAIN] [INFO]   Job A: Scraping (all retailers, async Apify actors)
[2026-04-05T08:22:43.054Z] [MAIN] [INFO]   Job B: Embedding (watching processed/ for batches)
[2026-04-05T08:22:43.054Z] [MAIN] [INFO]   Job C: Showcase (144 FLUX renders across 12 styles × 4 rooms)
[2026-04-05T08:22:43.055Z] [MAIN] [INFO]   Job D: Storage embed (existing images in Supabase Storage)
[2026-04-05T08:22:43.055Z] [SCRAPE] [INFO] Scraping job starting
[2026-04-05T08:22:43.055Z] [SCRAPE] [INFO] Total scraper configs: 153 (Tier1: 59, Tier2: 42, Tier3: 52)
[2026-04-05T08:22:43.056Z] [EMBED] [INFO] Embedding job starting
[2026-04-05T08:22:43.057Z] [SHOWCASE] [INFO] Showcase generation starting — 12 styles × 4 rooms × 3 renders = 144 total
[2026-04-05T08:22:43.057Z] [STORAGE-EMBED] [INFO] Starting: embedding existing Supabase Storage images
[2026-04-05T08:22:43.058Z] [STORAGE-EMBED] [INFO] Waiting 30 minutes before starting (lower priority than product embedding)
[2026-04-05T08:22:43.059Z] [SCRAPE] [INFO] Skipping already-scraped config: Article 1/14: sofas
[2026-04-05T08:22:43.059Z] [SCRAPE] [INFO] Skipping already-scraped config: Article 2/14: sectionals
[2026-04-05T08:22:43.059Z] [SCRAPE] [INFO] Skipping already-scraped config: Article 3/14: accent-chairs
[2026-04-05T08:22:43.059Z] [SCRAPE] [INFO] Progress: 1/153 configs completed
[2026-04-05T08:22:43.059Z] [SCRAPE] [INFO] Progress: 2/153 configs completed
[2026-04-05T08:22:43.060Z] [SCRAPE] [INFO] Progress: 3/153 configs completed
[2026-04-05T08:22:43.060Z] [SCRAPE] [INFO] Skipping already-scraped config: Article 4/14: lounge-chairs
[2026-04-05T08:22:43.060Z] [SCRAPE] [INFO] Skipping already-scraped config: Article 5/14: beds
[2026-04-05T08:22:43.060Z] [SCRAPE] [INFO] Skipping already-scraped config: Article 6/14: dining-tables
[2026-04-05T08:22:43.060Z] [SCRAPE] [INFO] Progress: 4/153 configs completed
[2026-04-05T08:22:43.060Z] [SCRAPE] [INFO] Progress: 5/153 configs completed
[2026-04-05T08:22:43.060Z] [SCRAPE] [INFO] Progress: 6/153 configs completed
[2026-04-05T08:22:43.060Z] [SCRAPE] [INFO] Skipping already-scraped config: Article 7/14: dining-chairs
[2026-04-05T08:22:43.060Z] [SCRAPE] [INFO] Skipping already-scraped config: Article 8/14: coffee-tables
[2026-04-05T08:22:43.060Z] [SCRAPE] [INFO] Skipping already-scraped config: Article 9/14: side-tables
[2026-04-05T08:22:43.060Z] [SCRAPE] [INFO] Progress: 7/153 configs completed
[2026-04-05T08:22:43.060Z] [SCRAPE] [INFO] Progress: 8/153 configs completed
[2026-04-05T08:22:43.060Z] [SCRAPE] [INFO] Progress: 9/153 configs completed
[2026-04-05T08:22:43.067Z] [SCRAPE] [INFO] Skipping already-scraped config: Article 10/14: outdoor
[2026-04-05T08:22:43.067Z] [SCRAPE] [INFO] Skipping already-scraped config: Article 11/14: lighting
[2026-04-05T08:22:43.067Z] [SCRAPE] [INFO] Skipping already-scraped config: Article 12/14: rugs
[2026-04-05T08:22:43.068Z] [SCRAPE] [INFO] Progress: 10/153 configs completed
[2026-04-05T08:22:43.068Z] [SCRAPE] [INFO] Progress: 11/153 configs completed
[2026-04-05T08:22:43.068Z] [SCRAPE] [INFO] Progress: 12/153 configs completed
[2026-04-05T08:22:43.068Z] [SCRAPE] [INFO] Skipping already-scraped config: Article 13/14: storage
[2026-04-05T08:22:43.068Z] [SCRAPE] [INFO] Skipping already-scraped config: Article 14/14: desks
[2026-04-05T08:22:43.068Z] [SCRAPE] [INFO] Skipping already-scraped config: West Elm 1/15: sofas-couches
[2026-04-05T08:22:43.068Z] [SCRAPE] [INFO] Progress: 13/153 configs completed
[2026-04-05T08:22:43.068Z] [SCRAPE] [INFO] Progress: 14/153 configs completed
[2026-04-05T08:22:43.068Z] [SCRAPE] [INFO] Progress: 15/153 configs completed
[2026-04-05T08:22:43.068Z] [SCRAPE] [INFO] Skipping already-scraped config: West Elm 2/15: chairs
[2026-04-05T08:22:43.068Z] [SCRAPE] [INFO] Skipping already-scraped config: West Elm 3/15: beds-headboards
[2026-04-05T08:22:43.068Z] [SCRAPE] [INFO] Skipping already-scraped config: West Elm 4/15: dining-room-furniture
[2026-04-05T08:22:43.068Z] [SCRAPE] [INFO] Progress: 16/153 configs completed
[2026-04-05T08:22:43.068Z] [SCRAPE] [INFO] Progress: 17/153 configs completed
[2026-04-05T08:22:43.068Z] [SCRAPE] [INFO] Progress: 18/153 configs completed
[2026-04-05T08:22:43.068Z] [SCRAPE] [INFO] Skipping already-scraped config: West Elm 5/15: office-furniture
[2026-04-05T08:22:43.068Z] [SCRAPE] [INFO] Skipping already-scraped config: West Elm 6/15: coffee-tables
[2026-04-05T08:22:43.069Z] [SCRAPE] [INFO] Skipping already-scraped config: West Elm 7/15: side-end-tables
[2026-04-05T08:22:43.069Z] [SCRAPE] [INFO] Progress: 19/153 configs completed
[2026-04-05T08:22:43.069Z] [SCRAPE] [INFO] Progress: 20/153 configs completed
[2026-04-05T08:22:43.069Z] [SCRAPE] [INFO] Progress: 21/153 configs completed
[2026-04-05T08:22:43.069Z] [SCRAPE] [INFO] Skipping already-scraped config: West Elm 8/15: dressers-nightstands
[2026-04-05T08:22:43.069Z] [SCRAPE] [INFO] Skipping already-scraped config: West Elm 9/15: floor-lamps
[2026-04-05T08:22:43.069Z] [SCRAPE] [INFO] Skipping already-scraped config: West Elm 10/15: pendant-lights
[2026-04-05T08:22:43.069Z] [SCRAPE] [INFO] Progress: 22/153 configs completed
[2026-04-05T08:22:43.069Z] [SCRAPE] [INFO] Progress: 23/153 configs completed
[2026-04-05T08:22:43.069Z] [SCRAPE] [INFO] Progress: 24/153 configs completed
[2026-04-05T08:22:43.069Z] [SCRAPE] [INFO] Skipping already-scraped config: West Elm 11/15: table-lamps
[2026-04-05T08:22:43.069Z] [SCRAPE] [INFO] Skipping already-scraped config: West Elm 12/15: rugs
[2026-04-05T08:22:43.069Z] [SCRAPE] [INFO] Skipping already-scraped config: West Elm 13/15: outdoor
[2026-04-05T08:22:43.069Z] [SCRAPE] [INFO] Progress: 25/153 configs completed
[2026-04-05T08:22:43.069Z] [SCRAPE] [INFO] Progress: 26/153 configs completed
[2026-04-05T08:22:43.069Z] [SCRAPE] [INFO] Progress: 27/153 configs completed
[2026-04-05T08:22:43.069Z] [SCRAPE] [INFO] Skipping already-scraped config: West Elm 14/15: wall-art
[2026-04-05T08:22:43.069Z] [SCRAPE] [INFO] Skipping already-scraped config: West Elm 15/15: mirrors
[2026-04-05T08:22:43.069Z] [SCRAPE] [INFO] Skipping already-scraped config: DTC burrow 1/8: all
[2026-04-05T08:22:43.069Z] [SCRAPE] [INFO] Progress: 28/153 configs completed
[2026-04-05T08:22:43.070Z] [SCRAPE] [INFO] Progress: 29/153 configs completed
[2026-04-05T08:22:43.070Z] [SCRAPE] [INFO] Progress: 30/153 configs completed
[2026-04-05T08:22:43.070Z] [SCRAPE] [INFO] Skipping already-scraped config: DTC burrow 2/8: sofas
[2026-04-05T08:22:43.070Z] [SCRAPE] [INFO] Skipping already-scraped config: DTC burrow 3/8: sectionals
[2026-04-05T08:22:43.070Z] [SCRAPE] [INFO] Skipping already-scraped config: DTC floyd 4/8: all
[2026-04-05T08:22:43.070Z] [SCRAPE] [INFO] Progress: 31/153 configs completed
[2026-04-05T08:22:43.070Z] [SCRAPE] [INFO] Progress: 32/153 configs completed
[2026-04-05T08:22:43.070Z] [SCRAPE] [INFO] Progress: 33/153 configs completed
[2026-04-05T08:22:43.070Z] [SCRAPE] [INFO] Skipping already-scraped config: DTC floyd 5/8: beds
[2026-04-05T08:22:43.070Z] [SCRAPE] [INFO] Skipping already-scraped config: DTC maiden_home 6/8: all
[2026-04-05T08:22:43.070Z] [SCRAPE] [INFO] Skipping already-scraped config: DTC maiden_home 7/8: sofas
[2026-04-05T08:22:43.070Z] [SCRAPE] [INFO] Progress: 34/153 configs completed
[2026-04-05T08:22:43.070Z] [SCRAPE] [INFO] Progress: 35/153 configs completed
[2026-04-05T08:22:43.070Z] [SCRAPE] [INFO] Progress: 36/153 configs completed
[2026-04-05T08:22:43.070Z] [SCRAPE] [INFO] Skipping already-scraped config: DTC maiden_home 8/8: chairs
[2026-04-05T08:22:43.070Z] [SCRAPE] [INFO] Starting actor: Wayfair 1/22: sofas-c413892.html (123webdata/wayfair-scraper)
[2026-04-05T08:22:43.072Z] [SCRAPE] [INFO] Starting actor: Wayfair 2/22: sectional-sofas-c413893.html (123webdata/wayfair-scraper)
[2026-04-05T08:22:43.073Z] [SCRAPE] [INFO] Progress: 37/153 configs completed
[2026-04-05T08:22:43.079Z] [SCRAPE] [INFO] Starting actor: Wayfair 3/22: accent-chairs-c1780251.html (123webdata/wayfair-scraper)
[2026-04-05T08:22:43.166Z] [CREDITS] [WARN] Failed to fetch credit status: Request failed with status code 401
[2026-04-05T08:22:43.166Z] [CREDITS] [INFO] Apify credits: $50.00 remaining ($0.00 used of $100.00) — 50% left
[2026-04-05T08:22:43.166Z] [CREDITS] [WARN] Apify credits at 50% — continuing
[2026-04-05T08:22:43.344Z] [SHOWCASE] [INFO] Created showcase storage bucket
[2026-04-05T08:22:43.345Z] [SHOWCASE] [INFO] Skipping already completed: warm-japandi:living_room:0
[2026-04-05T08:22:43.346Z] [SHOWCASE] [INFO] Skipping already completed: warm-japandi:living_room:1
[2026-04-05T08:22:43.346Z] [SHOWCASE] [INFO] Skipping already completed: warm-japandi:living_room:2
[2026-04-05T08:22:43.346Z] [SHOWCASE] [INFO] Skipping already completed: warm-japandi:bedroom:0
[2026-04-05T08:22:43.347Z] [SHOWCASE] [INFO] Skipping already completed: warm-japandi:bedroom:1
[2026-04-05T08:22:43.347Z] [SHOWCASE] [INFO] Skipping already completed: warm-japandi:bedroom:2
[2026-04-05T08:22:43.347Z] [SHOWCASE] [INFO] Skipping already completed: warm-japandi:home_office:0
[2026-04-05T08:22:43.347Z] [SHOWCASE] [INFO] Skipping already completed: warm-japandi:home_office:1
[2026-04-05T08:22:43.347Z] [SHOWCASE] [INFO] Skipping already completed: warm-japandi:home_office:2
[2026-04-05T08:22:43.347Z] [SHOWCASE] [INFO] Skipping already completed: warm-japandi:studio:0
[2026-04-05T08:22:43.347Z] [SHOWCASE] [INFO] Skipping already completed: warm-japandi:studio:1
[2026-04-05T08:22:43.347Z] [SHOWCASE] [INFO] Skipping already completed: warm-japandi:studio:2
[2026-04-05T08:22:43.348Z] [SHOWCASE] [INFO] Skipping already completed: organic-modern:living_room:0
[2026-04-05T08:22:43.348Z] [SHOWCASE] [INFO] Skipping already completed: organic-modern:living_room:1
[2026-04-05T08:22:43.348Z] [SHOWCASE] [INFO] Skipping already completed: organic-modern:living_room:2
[2026-04-05T08:22:54.433Z] [SHOWCASE] [SUCCESS] Generated: Organic Modern × bedroom [3/3] (16/144)
[2026-04-05T08:22:54.595Z] [SHOWCASE] [SUCCESS] Generated: Organic Modern × bedroom [1/3] (17/144)
[2026-04-05T08:22:54.602Z] [SHOWCASE] [SUCCESS] Generated: Organic Modern × home_office [1/3] (18/144)
[2026-04-05T08:22:59.541Z] [SHOWCASE] [SUCCESS] Generated: Organic Modern × bedroom [2/3] (19/144)
[2026-04-05T08:23:05.603Z] [SHOWCASE] [SUCCESS] Generated: Organic Modern × home_office [3/3] (20/144)
[2026-04-05T08:23:05.717Z] [SHOWCASE] [SUCCESS] Generated: Organic Modern × studio [1/3] (21/144)
[2026-04-05T08:23:05.742Z] [SHOWCASE] [SUCCESS] Generated: Organic Modern × home_office [2/3] (22/144)
[2026-04-05T08:23:16.537Z] [SHOWCASE] [SUCCESS] Generated: Organic Modern × studio [2/3] (23/144)
[2026-04-05T08:23:16.785Z] [SHOWCASE] [SUCCESS] Generated: Scandi Hygge × living_room [2/3] (24/144)
[2026-04-05T08:23:17.060Z] [SHOWCASE] [SUCCESS] Generated: Organic Modern × studio [3/3] (25/144)
[2026-04-05T08:23:17.157Z] [SHOWCASE] [SUCCESS] Generated: Scandi Hygge × living_room [1/3] (26/144)
[2026-04-05T08:23:27.787Z] [SHOWCASE] [SUCCESS] Generated: Scandi Hygge × living_room [3/3] (27/144)
[2026-04-05T08:23:27.826Z] [SHOWCASE] [SUCCESS] Generated: Scandi Hygge × bedroom [1/3] (28/144)
[2026-04-05T08:23:28.110Z] [SHOWCASE] [SUCCESS] Generated: Scandi Hygge × bedroom [3/3] (29/144)
[2026-04-05T08:23:28.232Z] [SHOWCASE] [SUCCESS] Generated: Scandi Hygge × bedroom [2/3] (30/144)
[2026-04-05T08:23:29.314Z] [SCRAPE] [INFO] Actor started: Wayfair 3/22: accent-chairs-c1780251.html — runId: XVj0VBTyhfEa3DbSI
[2026-04-05T08:23:29.503Z] [SCRAPE] [WARN] Empty dataset for: Wayfair 3/22: accent-chairs-c1780251.html
[2026-04-05T08:23:29.504Z] [SCRAPE] [INFO] Progress: 38/153 configs completed
[2026-04-05T08:23:29.505Z] [SCRAPE] [INFO] Starting actor: Wayfair 4/22: beds-c1840413.html (123webdata/wayfair-scraper)
[2026-04-05T08:23:37.226Z] [MAIN] [INFO] Shutdown signal received — saving state and exiting cleanly

────────────────────────────────────────────────────────────
SUMMARY — 2026-04-05T08:23:37.226Z
Elapsed: 0m 55s
Scraped: 0
Embedded: 0
Failed: 0
Showcase: 30/144
────────────────────────────────────────────────────────────

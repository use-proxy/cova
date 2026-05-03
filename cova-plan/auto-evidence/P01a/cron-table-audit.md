# Cron-table dependency audit — P01a M1

Date: 2026-05-02
Decision: 5 (gate before drop-dead-tables migration)

## Edge Function references to dropped tables

| Function | References | Status | Action taken | Verifier check |
|---|---|---|---|---|
| delete-account | furniture_placements (L47), token_transactions (L52) | patched (LOCAL); pending re-deploy | dead-table delete calls commented out + replaced with explanatory comments referencing P01a M1 + D-019; original logic preserved as commented code for rollback clarity | `rg "from\('furniture_placements'\)\|from\('token_transactions'\)" supabase/functions/delete-account/index.ts` returns only commented-out lines (not active calls) |
| aggregate-style-profiles | swipe_history, product_interactions, user_style_profiles, style_purchase_signals | DEPRECATED comment added; cron will be dropped by drop-dead-tables migration | top-of-file deprecation block | `rg "DEPRECATED 2026-05" supabase/functions/aggregate-style-profiles/index.ts` returns 1 |
| render-room | anchor_renders (L464), token_transactions (L618) | DEPRECATED comment added | top-of-file deprecation block | `rg "DEPRECATED 2026-05" supabase/functions/render-room/index.ts` returns 1 |
| chat-room, clip-embed, detect-furniture, extract-colors, generate-depth-map, get-render-status, match-products | none of the 17 dead tables | OK | no action | n/a |

## Web-app references

| File | References | Action |
|---|---|---|
| apps/web/app/api/render/retry/route.ts | render_retries | archived to `_archive/web/api/render/retry-route.ts` via `git mv` (Decision 11) |
| apps/web/tests/security/rls-negative.test.ts | possible refs to dropped tables | handled in §D.2 test classification (KEEP, refactored as part of §D.9 isolation-test refactor) |

## Re-deploy plan (DEFERRED until destructive-action gate clears)

The `delete-account` Edge Function source is patched in this commit, but
**not redeployed** to the production Supabase project. Per CLAUDE.md Rule 12,
this is the ONLY edge-function deploy permitted in P01a; a separate explicit
confirmation from Daksh is required before running:

```bash
supabase functions deploy delete-account --project-ref xdeacbmkdwqrwxonqaqh
```

Rule-12 exception scope: narrow + additive — removes references to
non-existent tables, doesn't add new behavior. Keeps the function functional
post-demolition.

## All references closed

yes — no active code paths in `apps/web/`, `supabase/functions/`, or
`scripts/` reference any of the 17 dead tables outside `_archive/`, deprecation
comments, or commented-out legacy lines.

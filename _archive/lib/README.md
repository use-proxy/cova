# Archived apps/web/lib/ files (P01a M1)

Archived during V1 demolition per Decision 11 (cova-plan/OPEN_DECISIONS.md).
`git mv` preserves history. Restore via `git mv _archive/lib/<file> apps/web/lib/<file>` if needed.

| File | Why dead | Date archived |
|---|---|---|
| marble.ts | Marble (World Labs) disabled per CLAUDE.md; all functions were commented out | 2026-05-02 |
| clipSearch.ts | DORMANT per file header; v9 product matching uses Serper + Google Lens | 2026-05-02 |
| measureBridge.ts | iOS WebView bridge; web V1 doesn't use | 2026-05-02 |
| pipelinePoller.ts | V8 poller; superseded by V9 status routes | 2026-05-02 |
| fluxKontext.ts | Direct kontext client; replaced by paidCall + flux.ts | 2026-05-02 |

## Not archived

- `unsplash.ts` is still actively imported by `apps/web/app/api/pipeline/redesign/route.ts`
  (`fetchScoredStyleReferences`) for IP-Adapter conditioning + persistence to
  `rooms.unsplash_references`. Spec option (b) applied — skipped.

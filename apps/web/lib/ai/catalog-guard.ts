// DORMANT — Runtime guard against accidental use of the dormant product catalog.
// Logs loudly when any active code path calls the DORMANT catalog infrastructure.
// After 2-4 weeks with zero warnings, isolation is confirmed and this guard can be removed.

/**
 * Catalog access guard. Call this at the top of every exported function in
 * apps/web/lib/clipSearch.ts and any other dormant catalog reader.
 * If an active code path invokes dormant code, the warning surfaces in logs.
 */
export function logCatalogAccess(source: string, query: string): void {
  console.warn(
    `[CATALOG-DORMANT] Active code path '${source}' queried the dormant product catalog: ${query}. ` +
      `This is allowed but unexpected. See apps/web/lib/clipSearch.ts header and docs/phase-0/catalog-isolation-audit.md.`,
  );
}

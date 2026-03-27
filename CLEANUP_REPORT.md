# Cova Repo Cleanup Report
Date: March 2026

## Files Deleted / Archived
- .cursorrules — deleted (superseded by CLAUDE.md)
- PRODUCT_TRUTH.md — archived as PRODUCT_TRUTH.md.archived
- .claude/specs/2026-03-24-depth-render-pipeline-repair.md — deleted
- .claude/specs/2026-03-25-deviation-fixes.md — deleted

## Pre-Commit Hooks
BEFORE: 4 checks, ~18 seconds per commit
- TypeScript check (buggy — silently passed Deno errors)
- Test suite run (12 seconds)
- Security scan
- iOS config check

AFTER: 2 checks, <1 second per commit
- Security scan (API key detection)
- iOS config check
Removed: TypeScript check and test suite (now run in sprint pipeline only)

## GitHub Actions
BEFORE: Used npm install (wrong — project uses pnpm with version overrides)
AFTER: Uses pnpm install with frozen lockfile, TypeScript check mobile only, security scan

## Packages Removed
- expo-in-app-purchases (not MVP)
- expo-blur
- expo-haptics
- expo-linear-gradient
- expo-secure-store
- expo-store-review
- lottie-react-native

## Dead Code Removed
- Zustand quizSlice: swipeRight, swipeLeft, swipeNeutral actions (never called)

## Files Created
- MVP_SPEC.md (placeholder pointing to COVA_MVP_SPEC_v1.1.docx)
- .claude/SESSION_MEMORY.md (cross-session memory for Claude Code)
- SPRINT_LOG.md (sprint progress tracking)
- SCRAPING_LOG.md (product/GLB scraping log)
- scripts/scrape-all.ts (scraper scaffold — full impl in Sprint 4)

## Sentry
Kept active — DSN configured, events sending
Updated comment to reference MVP_SPEC.md instead of PRODUCT_TRUTH.md

## Ready For
Sprint 1: Apple/Google auth on real device + style blend pipeline

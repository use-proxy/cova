# Cova

## Canary

Canaries are the checks that hit live services, so they catch drift the mocked unit tests can't: a rotated model version, an expired token, a changed Modal response schema. Run from `apps/web`.

**Replicate Depth Anything V2** — `tests/api/contracts.test.ts` ("Depth estimation"). Needs `REPLICATE_API_TOKEN` in `apps/web/.env.local`. It is a Playwright test, and Playwright starts `next start` on port 3001 first, so build before running:

```
npm run build
npx playwright test --project=api-contracts -g "Depth Anything"
```

**Modal endpoints** — the three `describe.skip("@integration live Modal endpoint")` blocks in `tests/ai/perception-client.test.ts`, `redesign-client.test.ts` and `empty-room-client.test.ts`. They need no key: they unset `COVA_PERCEPTION_URL` / `COVA_REDESIGN_URL` / `COVA_EMPTY_ROOM_URL` so each client falls back to its production Modal URL. Change `describe.skip` to `describe` locally (don't commit it), then:

```
npx vitest run tests/ai/perception-client.test.ts tests/ai/redesign-client.test.ts tests/ai/empty-room-client.test.ts -t "@integration"
```

The redesign test runs a real render (up to 240 s) and spends Modal GPU credit.

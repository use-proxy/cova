# Mixed package-manager invocation across deploy and CI (intentional)

Surfaced by P01a verifier session 1 (finding #3, MINOR). vercel.json
deploys via `pnpm --filter web run build`; `.github/workflows/lint.yml`
runs `npm ci` against `apps/web/package-lock.json`. This split is
intentional and not a P01a-introduced regression.

## Why both lockfiles exist

- **`pnpm-lock.yaml` at the repo root** governs Vercel's monorepo deploy.
  Vercel resolves the workspace through pnpm because the legacy
  `apps/mobile/` (frozen) shipped on pnpm and the deploy config has not
  been migrated. Switching the deploy to npm would require a fresh root
  `package-lock.json` with workspace resolution, which Next 14 + Vercel's
  monorepo detector handles with quirks. Out of scope for P01a.
- **`apps/web/package-lock.json`** governs local `npm install` /
  `npm run build` / `npm run lint` and is what the GitHub Actions Lint
  workflow caches. Local devs use npm because every CLAUDE.md command
  is an npm command.

## Drift risk

If the two lockfiles disagree on a transitive version, CI may pass while
Vercel deploys a different bundle (or vice-versa). Mitigations:

1. **Keep both lockfiles up to date.** When you `npm install` a package
   in `apps/web/`, also run `pnpm install` at repo root so `pnpm-lock.yaml`
   re-resolves the workspace. The reverse is also true.
2. **CI sanity check (deferred follow-up).** A pre-merge job could run
   `pnpm install --frozen-lockfile` and compare top-level `dependencies`
   resolution against `apps/web/package-lock.json` for the public Cova
   modules. Tracked separately if drift becomes a real incident.

## When to revisit

- If apps/mobile/ is ever unfrozen and shipped, decide whether to consolidate
  on pnpm (drop `package-lock.json`) or split deploys per workspace.
- If a deploy/CI version drift incident occurs, prioritize migration to
  a single package manager.

## What NOT to do

- Don't add comments to `vercel.json`; Vercel rejects unknown keys.
- Don't blindly delete one lockfile; both are load-bearing for the
  surface that consumes them.

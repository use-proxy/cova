# LoRA Resolver Usage — Phase 0 Follow-up Audit

Date: 2026-04-19

Two resolvers exist in `apps/web/lib/ai/lora-registry.ts`:

- `getLorasForStyle(styleAnchor, supabase)` — lookup by anchor/display name
- `getLorasFromFluxPrompt(fluxPrompt, supabase)` — extracts `cv*` trigger from prompt

## Active production call sites

| Route / file                                            | Resolver used              |
| ------------------------------------------------------- | -------------------------- |
| `apps/web/app/api/pipeline/redesign/route.ts:514`       | `getLorasFromFluxPrompt`   |
| `apps/web/app/api/pipeline/segment-masks/route.ts`      | (none — no LoRA lookup)    |
| `apps/web/app/api/render/refine/route.ts`               | (none — no LoRA lookup)    |
| `modal_pipeline/generation.py`                          | (consumes `loras_json` built upstream; does not call resolvers directly) |

Grep results (outside tests / node_modules):

```
apps/web/lib/ai/lora-registry.ts:95:export async function getLorasForStyle(
apps/web/app/api/pipeline/redesign/route.ts:32:import { getLorasFromFluxPrompt }
apps/web/app/api/pipeline/redesign/route.ts:514:  const loraResult = await getLorasFromFluxPrompt(compiledPrompt, admin);
apps/web/lib/ai/lora-registry.ts:177:export async function getLorasFromFluxPrompt(
```

## Conclusion

The **only** active call site is `getLorasFromFluxPrompt` in the redesign route.
The Phase 0 Prompt 5 patch added `backupUrl` to `getLorasForStyle`, which has no
active callers — the fal.media expiration safety net was effectively dead.

This follow-up patches `getLorasFromFluxPrompt` with the same `backupUrl` logic
so production actually benefits from the backup URLs.

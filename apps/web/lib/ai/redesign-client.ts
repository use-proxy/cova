/**
 * TypeScript client for the `cova-redesign` Modal service (Phase 5).
 *
 * Contract mirrors the Pydantic schemas in
 * `modal_pipeline/redesign.py` (schema_version "1.0"). Call path:
 * empty-room URL in → flux-general with LoRA stack → redesign URL out.
 *
 * Phase 5 gate (≥11/15 rooms beat Collov calibration bar) validated at
 * 14/15; see `bench/phase-5-redesign/PHASE_5_RESULTS.md`.
 */
import { z } from "zod";

const DEFAULT_BASE_URL =
  "https://cova-interior--cova-redesign-redesign-api.modal.run";
const DEFAULT_TIMEOUT_MS = 90_000;
const RETRY_BACKOFF_MS = 1_500;

function baseUrl(): string {
  return process.env.COVA_REDESIGN_URL?.replace(/\/$/, "") ?? DEFAULT_BASE_URL;
}

// --------------------------------------------------------------------------
// Zod schemas — mirror modal_pipeline/redesign.py
// --------------------------------------------------------------------------

export const PROVIDER_VALUES = ["flux-general", "nano-banana-pro"] as const;
export type RedesignProvider = (typeof PROVIDER_VALUES)[number];

export const LoraEntrySchema = z.object({
  path: z.string(),
  scale: z.number(),
  trigger: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
});
export type LoraEntry = z.infer<typeof LoraEntrySchema>;

export const RedesignResponseSchema = z.object({
  schema_version: z.literal("1.0"),
  redesign_url: z.string().url(),
  archetype_resolved: z.string(),
  primary_trigger: z.string(),
  loras_used: z.array(LoraEntrySchema),
  prompt_used: z.string(),
  negative_prompt_used: z.string(),
  provider: z.enum(PROVIDER_VALUES),
  provider_fallback_reason: z.string().nullable().optional(),
  strength: z.number(),
  guidance_scale: z.number(),
  num_inference_steps: z.number().int(),
  seed: z.number().int().nullable().optional(),
  image_width: z.number().int(),
  image_height: z.number().int(),
  latency_ms: z.number().int(),
  cost_usd: z.number(),
  judge_score: z.number().nullable().optional(),
  generated_at_iso: z.string(),
});
export type RedesignResponse = z.infer<typeof RedesignResponseSchema>;

// --------------------------------------------------------------------------
// Request shape
// --------------------------------------------------------------------------

export interface GenerateRedesignOptions {
  emptyRoomUrl: string;
  archetypeKey: string;
  styleBlend?: Record<string, number>;
  styleFingerprint?: Record<string, number>;
  budgetMax?: number;
  roomType?: string;
  lifestyleContext?: string;
  strengthOverride?: number;
  guidanceOverride?: number;
  stepsOverride?: number;
  promptOverride?: string;
  loraScaleMultiplier?: number;
  seed?: number;
  primaryImageSize?: "auto" | "portrait" | "landscape" | "square";
  forceNbPro?: boolean;
  userId?: string;
  /** Override default 90s request timeout. */
  timeoutMs?: number;
}

// --------------------------------------------------------------------------
// Errors
// --------------------------------------------------------------------------

export class RedesignError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly detail?: unknown,
  ) {
    super(message);
    this.name = "RedesignError";
  }
}

export class RedesignBadRequestError extends RedesignError {
  constructor(message: string, detail?: unknown) {
    super(message, 400, detail);
    this.name = "RedesignBadRequestError";
  }
}

export class RedesignUpstreamError extends RedesignError {
  constructor(message: string, detail?: unknown) {
    super(message, 502, detail);
    this.name = "RedesignUpstreamError";
  }
}

export class RedesignTimeoutError extends RedesignError {
  constructor(timeoutMs: number) {
    super(`cova-redesign generate_redesign timed out after ${timeoutMs}ms`);
    this.name = "RedesignTimeoutError";
  }
}

// --------------------------------------------------------------------------
// Transport
// --------------------------------------------------------------------------

type Outcome<T> =
  | { ok: true; data: T }
  | { ok: false; retryable: boolean; err: Error };

function buildPayload(opts: GenerateRedesignOptions): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    empty_room_url: opts.emptyRoomUrl,
    archetype_key: opts.archetypeKey,
  };
  if (opts.styleBlend !== undefined) payload.style_blend = opts.styleBlend;
  if (opts.styleFingerprint !== undefined)
    payload.style_fingerprint = opts.styleFingerprint;
  if (opts.budgetMax !== undefined) payload.budget_max = opts.budgetMax;
  if (opts.roomType !== undefined) payload.room_type = opts.roomType;
  if (opts.lifestyleContext !== undefined)
    payload.lifestyle_context = opts.lifestyleContext;
  if (opts.strengthOverride !== undefined)
    payload.strength_override = opts.strengthOverride;
  if (opts.guidanceOverride !== undefined)
    payload.guidance_override = opts.guidanceOverride;
  if (opts.stepsOverride !== undefined)
    payload.steps_override = opts.stepsOverride;
  if (opts.promptOverride !== undefined)
    payload.prompt_override = opts.promptOverride;
  if (opts.loraScaleMultiplier !== undefined)
    payload.lora_scale_multiplier = opts.loraScaleMultiplier;
  if (opts.seed !== undefined) payload.seed = opts.seed;
  if (opts.primaryImageSize !== undefined)
    payload.primary_image_size = opts.primaryImageSize;
  if (opts.forceNbPro !== undefined) payload.force_nb_pro = opts.forceNbPro;
  if (opts.userId !== undefined) payload.user_id = opts.userId;
  return payload;
}

async function postJson<S extends z.ZodTypeAny>(
  endpoint: string,
  body: unknown,
  schema: S,
  timeoutMs: number,
): Promise<z.infer<S>> {
  type T = z.infer<S>;
  const url = `${baseUrl()}/v1/${endpoint}`;

  const doOnce = async (): Promise<Outcome<T>> => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        let detail: unknown = undefined;
        try {
          detail = await res.json();
        } catch {
          /* ignore */
        }
        if (res.status === 400) {
          return {
            ok: false,
            retryable: false,
            err: new RedesignBadRequestError(
              `cova-redesign ${endpoint} rejected request: ${res.status}`,
              detail,
            ),
          };
        }
        if (res.status === 502) {
          return {
            ok: false,
            retryable: true,
            err: new RedesignUpstreamError(
              `cova-redesign ${endpoint} upstream failure: ${res.status}`,
              detail,
            ),
          };
        }
        const err = new RedesignError(
          `cova-redesign ${endpoint} failed: ${res.status}`,
          res.status,
          detail,
        );
        return { ok: false, retryable: res.status >= 500, err };
      }
      const json = await res.json();
      const parsed = schema.safeParse(json);
      if (!parsed.success) {
        return {
          ok: false,
          retryable: false,
          err: new RedesignError(
            `cova-redesign ${endpoint} response failed schema validation: ${parsed.error.message}`,
            res.status,
            parsed.error,
          ),
        };
      }
      return { ok: true, data: parsed.data };
    } catch (e) {
      const err = e as Error & { name?: string };
      if (err.name === "AbortError") {
        return {
          ok: false,
          retryable: false,
          err: new RedesignTimeoutError(timeoutMs),
        };
      }
      return { ok: false, retryable: true, err };
    } finally {
      clearTimeout(t);
    }
  };

  const first = await doOnce();
  if (first.ok) return first.data;
  if (!first.retryable) throw first.err;

  await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS));
  const second = await doOnce();
  if (second.ok) return second.data;
  throw second.err;
}

// --------------------------------------------------------------------------
// Public API
// --------------------------------------------------------------------------

export async function generateRedesign(
  options: GenerateRedesignOptions,
): Promise<RedesignResponse> {
  return postJson(
    "generate_redesign",
    buildPayload(options),
    RedesignResponseSchema,
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
}

/**
 * TypeScript client for the `cova-empty-room` Modal service (Phase 2).
 *
 * Contract mirrors the Pydantic schemas in
 * `modal_pipeline/empty_room.py` (schema_version "1.0"). Full service
 * design: `docs/phase-2/service-design.md`.
 */
import { z } from "zod";

const DEFAULT_BASE_URL =
  "https://cova-interior--cova-empty-room-emptyroom-api.modal.run";
const DEFAULT_TIMEOUT_MS = 60_000;
const RETRY_BACKOFF_MS = 1_000;

function baseUrl(): string {
  return (
    process.env.COVA_EMPTY_ROOM_URL?.replace(/\/$/, "") ?? DEFAULT_BASE_URL
  );
}

// --------------------------------------------------------------------------
// Zod schemas — mirror modal_pipeline/empty_room.py
// --------------------------------------------------------------------------

export const PatchCoordinatesSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  size: z.number().int(),
});
export type PatchCoordinates = z.infer<typeof PatchCoordinatesSchema>;

export const INPAINTER_VALUES = ["lama", "bria", "short_circuit"] as const;

export const EmptyRoomResponseSchema = z.object({
  schema_version: z.literal("1.0"),
  empty_room_url: z.string().url(),
  image_hash: z.string(),
  image_width: z.number().int(),
  image_height: z.number().int(),
  mask_coverage_raw_pct: z.number(),
  mask_coverage_dilated_pct: z.number(),
  inpainter_used: z.enum(INPAINTER_VALUES),
  router_threshold_pct: z.number(),
  architectural_patch_ssim: z.number(),
  patch_coordinates: PatchCoordinatesSchema,
  patch_clean: z.boolean(),
  partial_failures: z.array(z.string()).default([]),
  latency_ms: z.number().int(),
  cost_usd: z.number(),
  generated_at_iso: z.string(),
});
export type EmptyRoomResponse = z.infer<typeof EmptyRoomResponseSchema>;

// --------------------------------------------------------------------------
// Errors
// --------------------------------------------------------------------------

export class EmptyRoomError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly detail?: unknown,
  ) {
    super(message);
    this.name = "EmptyRoomError";
  }
}

export class EmptyRoomCoverageTooHighError extends EmptyRoomError {
  constructor(
    public readonly coveragePct: number,
    detail?: unknown,
  ) {
    super(
      `empty-room rejected: dilated coverage ${coveragePct.toFixed(1)}% exceeds service threshold`,
      413,
      detail,
    );
    this.name = "EmptyRoomCoverageTooHighError";
  }
}

export class EmptyRoomTimeoutError extends EmptyRoomError {
  constructor(timeoutMs: number) {
    super(`empty-room generate_empty_room timed out after ${timeoutMs}ms`);
    this.name = "EmptyRoomTimeoutError";
  }
}

// --------------------------------------------------------------------------
// Options
// --------------------------------------------------------------------------

export interface GenerateEmptyRoomOptions {
  imageHash?: string;
  userId?: string;
  /** Diagnostic override — bypass the coverage router. */
  forceInpainter?: "lama" | "bria";
  /** Override default 60s request timeout. */
  timeoutMs?: number;
}

// --------------------------------------------------------------------------
// Transport
// --------------------------------------------------------------------------

type Outcome<T> =
  | { ok: true; data: T }
  | { ok: false; retryable: boolean; err: Error };

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
        if (res.status === 413) {
          const covPct =
            typeof detail === "object" &&
            detail !== null &&
            "detail" in (detail as Record<string, unknown>) &&
            typeof (detail as { detail: Record<string, unknown> }).detail
              .mask_coverage_dilated_pct === "number"
              ? ((detail as { detail: Record<string, unknown> }).detail
                  .mask_coverage_dilated_pct as number)
              : NaN;
          return {
            ok: false,
            retryable: false,
            err: new EmptyRoomCoverageTooHighError(covPct, detail),
          };
        }
        const err = new EmptyRoomError(
          `empty-room ${endpoint} failed: ${res.status}`,
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
          err: new EmptyRoomError(
            `empty-room ${endpoint} response failed schema validation: ${parsed.error.message}`,
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
          err: new EmptyRoomTimeoutError(timeoutMs),
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

export async function generateEmptyRoom(
  imageUrl: string,
  options?: GenerateEmptyRoomOptions,
): Promise<EmptyRoomResponse> {
  return postJson(
    "generate_empty_room",
    {
      image_url: imageUrl,
      image_hash: options?.imageHash,
      user_id: options?.userId,
      force_inpainter: options?.forceInpainter,
    },
    EmptyRoomResponseSchema,
    options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
}

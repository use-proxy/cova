/**
 * TypeScript client for the `cova-perception` Modal service (Phase 1).
 *
 * Contract is frozen and matches the Pydantic schemas in
 * `modal_pipeline/perception.py`. See `docs/phase-1/modal-audit.md`.
 */
import { z } from "zod";

const DEFAULT_BASE_URL =
  "https://cova-interior--cova-perception-perception-api.modal.run";
const DEFAULT_TIMEOUT_MS = 30_000;
const RETRY_BACKOFF_MS = 1_000;

function baseUrl(): string {
  return (
    process.env.COVA_PERCEPTION_URL?.replace(/\/$/, "") ?? DEFAULT_BASE_URL
  );
}

// --------------------------------------------------------------------------
// Zod schemas — mirror modal_pipeline/perception.py Pydantic models.
// --------------------------------------------------------------------------

export const BoundingBoxSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  w: z.number().int(),
  h: z.number().int(),
});
export type BoundingBox = z.infer<typeof BoundingBoxSchema>;

export const KEEP_CLASS_PROMPTS = [
  "ceiling fan",
  "framed photograph",
  "picture frame",
  "mirror",
  "fireplace",
  "crown molding",
  "exposed brick",
  "exposed beam",
  "wainscoting",
  "arched doorway",
  "bay window",
  "built-in bookshelf",
  "wall letters",
  "wall text",
  "radiator",
] as const;

export const KeepClassDetectionSchema = z.object({
  prompt: z.enum(KEEP_CLASS_PROMPTS),
  mask_url: z.string().url(),
  score: z.number(),
  bbox: BoundingBoxSchema,
});
export type KeepClassDetection = z.infer<typeof KeepClassDetectionSchema>;

export const FaceInFrameFlagSchema = z.object({
  frame_detection_index: z.number().int(),
  face_confidence: z.number().min(0).max(1),
  face_bbox: BoundingBoxSchema,
});
export type FaceInFrameFlag = z.infer<typeof FaceInFrameFlagSchema>;

export const WallTextFlagSchema = z.object({
  text: z.string(),
  confidence: z.number().min(0).max(1),
  bbox: BoundingBoxSchema,
});
export type WallTextFlag = z.infer<typeof WallTextFlagSchema>;

export const PreservationSpecSchema = z.object({
  schema_version: z.literal("1.0"),
  image_url: z.string().url(),
  image_hash: z.string(),
  image_width: z.number().int(),
  image_height: z.number().int(),
  keep_class_detections: z.array(KeepClassDetectionSchema),
  face_in_frame_flags: z.array(FaceInFrameFlagSchema),
  wall_text_flags: z.array(WallTextFlagSchema),
  partial_failures: z.array(z.string()).default([]),
  generated_at_iso: z.string(),
  latency_ms: z.number().int(),
});
export type PreservationSpec = z.infer<typeof PreservationSpecSchema>;

export const Sam2EmbeddingResponseSchema = z.object({
  image_hash: z.string(),
  embedding_bytes_b64: z.string(),
  embedding_size_bytes: z.number().int(),
  embedding_shape: z.array(z.number().int()),
  supabase_row_id: z.string(),
  generated_at_iso: z.string(),
  latency_ms: z.number().int(),
});
export type Sam2EmbeddingResponse = z.infer<
  typeof Sam2EmbeddingResponseSchema
>;

export const DepthResponseSchema = z.object({
  depth_url: z.string().url(),
  provider: z.literal("fal-ai/imageutils/depth"),
  latency_ms: z.number().int(),
});
export type DepthResponse = z.infer<typeof DepthResponseSchema>;

// --------------------------------------------------------------------------
// Errors
// --------------------------------------------------------------------------

export class PerceptionError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly detail?: unknown,
  ) {
    super(message);
    this.name = "PerceptionError";
  }
}

export class PerceptionTimeoutError extends PerceptionError {
  constructor(endpoint: string, timeoutMs: number) {
    super(`perception ${endpoint} timed out after ${timeoutMs}ms`);
    this.name = "PerceptionTimeoutError";
  }
}

// --------------------------------------------------------------------------
// Transport
// --------------------------------------------------------------------------

async function postJson<S extends z.ZodTypeAny>(
  endpoint: string,
  body: unknown,
  schema: S,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<z.infer<S>> {
  type T = z.infer<S>;
  const url = `${baseUrl()}/v1/${endpoint}`;

  const doOnce = async (): Promise<
    { ok: true; data: T } | { ok: false; retryable: boolean; err: Error }
  > => {
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
        const err = new PerceptionError(
          `perception ${endpoint} failed: ${res.status}`,
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
          err: new PerceptionError(
            `perception ${endpoint} response failed schema validation: ${parsed.error.message}`,
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
          err: new PerceptionTimeoutError(endpoint, timeoutMs),
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

export async function detectPreservationSpec(
  imageUrl: string,
  options?: { imageHash?: string; userId?: string },
): Promise<PreservationSpec> {
  return postJson(
    "detect_preservation_spec",
    {
      image_url: imageUrl,
      image_hash: options?.imageHash,
      user_id: options?.userId,
    },
    PreservationSpecSchema,
  );
}

export async function encodeSam2ForCache(
  imageUrl: string,
  userId: string,
  options?: { imageHash?: string },
): Promise<Sam2EmbeddingResponse> {
  if (!userId) {
    throw new PerceptionError(
      "encodeSam2ForCache requires a non-empty userId",
    );
  }
  return postJson(
    "encode_sam2_for_cache",
    {
      image_url: imageUrl,
      image_hash: options?.imageHash,
      user_id: userId,
    },
    Sam2EmbeddingResponseSchema,
  );
}

export async function getDepthMap(imageUrl: string): Promise<DepthResponse> {
  return postJson(
    "depth_anything_v2",
    { image_url: imageUrl },
    DepthResponseSchema,
  );
}

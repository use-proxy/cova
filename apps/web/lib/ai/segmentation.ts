/**
 * SAM3 Typed Wrapper — fal-ai/sam-3/image
 *
 * Provides typed access to Meta's SAM3 segmentation model via fal.ai.
 * Used by the segment-masks route as an alternative to EVF-SAM2 per-item calls.
 *
 * Features:
 *   - Retry with exponential backoff (3 attempts)
 *   - Per-session cost guardrail ($5 max)
 *   - Typed input/output matching fal.ai SDK types
 */

import { paidCall } from "@/lib/paid/call";

// Approximate cost per SAM3 call (fal.ai pricing)
const SAM3_COST_PER_CALL = 0.02;
const MAX_SESSION_COST = 5.0;
let sessionCumulativeCost = 0;

interface Sam3Input {
  image_url: string;
  prompt: string;
  return_multiple_masks?: boolean;
  max_masks?: number;
  include_scores?: boolean;
  apply_mask?: boolean;
  output_format?: "png" | "jpeg" | "webp";
}

interface Sam3MaskImage {
  url: string;
  width?: number;
  height?: number;
}

interface Sam3MaskMetadata {
  label?: string;
  score?: number;
  box?: number[];
}

export interface Sam3Result {
  image?: Sam3MaskImage;
  masks: Sam3MaskImage[];
  metadata?: Sam3MaskMetadata[];
  scores?: number[];
  boxes?: number[][];
}

export interface Sam3Instance {
  label: string;
  maskUrl: string;
  score: number;
  box: number[];
}

/**
 * Call fal-ai/sam-3/image with retry and cost guardrail.
 *
 * @param imageUrl - URL of the image to segment
 * @param textPrompt - Dot-separated object classes (e.g., "bed . sofa . chair .")
 * @param falKey - fal.ai API key
 * @param maxMasks - Maximum masks to return (default 32)
 * @returns Array of Sam3Instance with mask URLs, scores, and bounding boxes
 */
export async function callSam3(
  imageUrl: string,
  textPrompt: string,
  falKey: string,
  maxMasks: number = 32,
): Promise<Sam3Instance[]> {
  // Cost guardrail
  if (sessionCumulativeCost + SAM3_COST_PER_CALL > MAX_SESSION_COST) {
    throw new Error(
      `[segmentation] SAM3 cost guardrail: cumulative cost $${sessionCumulativeCost.toFixed(2)} ` +
      `would exceed $${MAX_SESSION_COST} limit`,
    );
  }

  const input: Sam3Input = {
    image_url: imageUrl,
    prompt: textPrompt,
    return_multiple_masks: true,
    max_masks: maxMasks,
    include_scores: true,
    apply_mask: false,
    output_format: "png",
  };

  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await paidCall<Sam3Result>({
        provider: "fal",
        url: "https://fal.run/fal-ai/sam-3/image",
        init: {
          method: "POST",
          headers: {
            Authorization: `Key ${falKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(input),
          signal: AbortSignal.timeout(60_000),
        },
        costEstimate: {
          category: "render",
          stage: "sam3_segment",
          costUsd: SAM3_COST_PER_CALL,
          model: "fal-ai/sam-3/image",
        },
      });
      sessionCumulativeCost += SAM3_COST_PER_CALL;

      // Parse into typed instances
      const instances: Sam3Instance[] = [];
      const masks = result.masks ?? [];
      const scores = result.scores ?? [];
      const boxes = result.boxes ?? [];
      const metadata = result.metadata ?? [];

      for (let i = 0; i < masks.length; i++) {
        const maskUrl = masks[i]?.url;
        if (!maskUrl) continue;

        const meta = metadata[i];
        const label = meta?.label ?? `object_${i}`;
        const score = scores[i] ?? meta?.score ?? 0;
        const box = boxes[i] ?? meta?.box ?? [0.5, 0.5, 0.1, 0.1];

        instances.push({ label, maskUrl, score, box });
      }

      console.log(
        `[segmentation] SAM3 returned ${instances.length} masks ` +
        `(attempt ${attempt}, cost so far: $${sessionCumulativeCost.toFixed(2)})`,
      );

      return instances;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(
        `[segmentation] SAM3 attempt ${attempt}/${maxRetries} failed:`,
        lastError.message,
      );

      if (attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempt - 1) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError ?? new Error("[segmentation] SAM3 failed after all retries");
}

/**
 * Reset the session cost counter. Call at the start of a new pipeline run.
 */
export function resetSessionCost(): void {
  sessionCumulativeCost = 0;
}

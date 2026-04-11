/**
 * FLUX Kontext Pro client for room redesign.
 * Uses Replicate API directly via fetch.
 */

const REPLICATE_API_BASE = "https://api.replicate.com/v1";
const FLUX_KONTEXT_MODEL = "black-forest-labs/flux-kontext-pro";

export interface KontextInput {
  input_image: string;
  prompt: string;
  guidance?: number;
  seed?: number;
}

export interface KontextResult {
  redesigned_image_url: string;
  prediction_id: string;
  generation_time_ms: number;
}

export async function runFluxKontext(
  input: KontextInput,
  replicateApiToken: string,
  timeoutMs: number = 120000,
): Promise<KontextResult> {
  const startTime = Date.now();

  const createResp = await fetch(
    `${REPLICATE_API_BASE}/models/${FLUX_KONTEXT_MODEL}/predictions`,
    {
      method: "POST",
      headers: {
        Authorization: `Token ${replicateApiToken}`,
        "Content-Type": "application/json",
        Prefer: "wait",
      },
      body: JSON.stringify({
        input: {
          input_image: input.input_image,
          prompt: input.prompt,
          guidance: input.guidance ?? 2.5,
          ...(input.seed !== undefined ? { seed: input.seed } : {}),
        },
      }),
    },
  );

  if (!createResp.ok) {
    const error = await createResp.text();
    throw new Error(`Replicate create failed: ${createResp.status} ${error}`);
  }

  let prediction = await createResp.json();
  const predictionId = prediction.id;

  if (prediction.status === "succeeded") {
    const imageUrl = Array.isArray(prediction.output)
      ? prediction.output[0]
      : prediction.output;
    return {
      redesigned_image_url: imageUrl,
      prediction_id: predictionId,
      generation_time_ms: Date.now() - startTime,
    };
  }

  const pollStart = Date.now();
  while (Date.now() - pollStart < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const pollResp = await fetch(
      `${REPLICATE_API_BASE}/predictions/${predictionId}`,
      {
        headers: { Authorization: `Token ${replicateApiToken}` },
      },
    );

    if (!pollResp.ok) {
      throw new Error(`Poll failed: ${pollResp.status}`);
    }

    prediction = await pollResp.json();

    if (prediction.status === "succeeded") {
      const imageUrl = Array.isArray(prediction.output)
        ? prediction.output[0]
        : prediction.output;
      if (!imageUrl) {
        throw new Error("Prediction succeeded but no output URL");
      }
      return {
        redesigned_image_url: imageUrl,
        prediction_id: predictionId,
        generation_time_ms: Date.now() - startTime,
      };
    }

    if (prediction.status === "failed" || prediction.status === "canceled") {
      throw new Error(
        `Prediction ${prediction.status}: ${prediction.error ?? "unknown error"}`,
      );
    }
  }

  throw new Error(`FLUX Kontext timed out after ${timeoutMs / 1000}s`);
}

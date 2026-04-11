/**
 * Grounding DINO — open-vocabulary object detection.
 *
 * Model: adirik/grounding-dino (locked hash below). The text prompt
 * MUST be period-space-separated with a trailing period, e.g.
 * "sofa . chair . coffee table ." — any other format (commas,
 * semicolons) produces zero detections.
 *
 * We call it with adaptive thresholds: start at defaults, halve
 * progressively when we get zero detections. This handles the
 * real-world case where indoor room photos routinely return max
 * confidence in the 0.25-0.65 range.
 */

// Locked model hash from the existing grounding.ts — never bump blindly.
const GDINO_MODEL =
  "adirik/grounding-dino:efd10a8ddc57ea28773327e881ce95e20cc1d734c589f7dd01d2036921ed78aa";

export interface GroundingHit {
  label: string;
  bbox: [number, number, number, number]; // normalized [x, y, w, h]
  confidence: number;
}

interface DinoRawDetection {
  label: string;
  confidence: number;
  bbox: number[]; // pixel [x1, y1, x2, y2]
}

interface DinoOutput {
  detections?: DinoRawDetection[];
  image_width?: number;
  image_height?: number;
}

// Simple period-space join with trailing period.
function formatPrompt(tags: string[]): string {
  const clean = tags
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0);
  return clean.join(" . ") + " .";
}

async function toBase64DataUri(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status} ${url}`);
  }
  const contentType = response.headers.get("content-type") ?? "image/jpeg";
  const buffer = await response.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");
  return `data:${contentType};base64,${base64}`;
}

// Fetch image dimensions from the first 64KB via Range request.
async function getImageDimensions(
  url: string,
): Promise<{ width: number; height: number }> {
  try {
    const response = await fetch(url, {
      headers: { Range: "bytes=0-65535" },
    });
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // JPEG SOF marker
    if (bytes[0] === 0xff && bytes[1] === 0xd8) {
      for (let i = 2; i < bytes.length - 8; i++) {
        if (
          bytes[i] === 0xff &&
          (bytes[i + 1] === 0xc0 || bytes[i + 1] === 0xc2)
        ) {
          const height = ((bytes[i + 5] ?? 0) << 8) | (bytes[i + 6] ?? 0);
          const width = ((bytes[i + 7] ?? 0) << 8) | (bytes[i + 8] ?? 0);
          if (width > 0 && height > 0) return { width, height };
        }
      }
    }
    // PNG IHDR
    if (bytes[0] === 0x89 && bytes[1] === 0x50) {
      const width =
        ((bytes[16] ?? 0) << 24) |
        ((bytes[17] ?? 0) << 16) |
        ((bytes[18] ?? 0) << 8) |
        (bytes[19] ?? 0);
      const height =
        ((bytes[20] ?? 0) << 24) |
        ((bytes[21] ?? 0) << 16) |
        ((bytes[22] ?? 0) << 8) |
        (bytes[23] ?? 0);
      if (width > 0 && height > 0) return { width, height };
    }
  } catch {
    // fall through
  }
  return { width: 3024, height: 4032 };
}

function normalizeBbox(
  pixelBbox: number[],
  width: number,
  height: number,
): [number, number, number, number] {
  const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = pixelBbox;
  return [
    Math.max(0, Math.min(1, x1 / width)),
    Math.max(0, Math.min(1, y1 / height)),
    Math.max(0, Math.min(1, (x2 - x1) / width)),
    Math.max(0, Math.min(1, (y2 - y1) / height)),
  ];
}

async function callGDINO(
  imageDataUri: string,
  textPrompt: string,
  boxThreshold: number,
  textThreshold: number,
  imgW: number,
  imgH: number,
): Promise<GroundingHit[]> {
  const response = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      Authorization: `Token ${process.env.REPLICATE_API_TOKEN}`,
      "Content-Type": "application/json",
      Prefer: "wait",
    },
    body: JSON.stringify({
      version: GDINO_MODEL.split(":")[1],
      input: {
        image: imageDataUri,
        query: textPrompt,
        box_threshold: boxThreshold,
        text_threshold: textThreshold,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(
      `GroundingDINO HTTP ${response.status}: ${await response.text()}`,
    );
  }

  const prediction = (await response.json()) as {
    id: string;
    status: string;
    output?: DinoOutput;
    error?: string;
  };

  let final = prediction;
  // Poll if still running
  let polls = 0;
  while (
    (final.status === "starting" || final.status === "processing") &&
    polls < 60
  ) {
    await new Promise((r) => setTimeout(r, 1000));
    const poll = await fetch(
      `https://api.replicate.com/v1/predictions/${prediction.id}`,
      {
        headers: {
          Authorization: `Token ${process.env.REPLICATE_API_TOKEN}`,
        },
      },
    );
    if (!poll.ok) {
      throw new Error(
        `Replicate poll failed: ${poll.status} ${await poll.text()}`,
      );
    }
    final = (await poll.json()) as typeof final;
    polls++;
  }

  if (final.status !== "succeeded" || !final.output?.detections) return [];

  return final.output.detections.map((d) => ({
    label: d.label,
    bbox: normalizeBbox(d.bbox, imgW, imgH),
    confidence: d.confidence,
  }));
}

/**
 * Runs Grounding DINO with adaptive threshold fallback.
 * Returns an empty array (not a throw) if all attempts produce nothing.
 */
export async function runGroundingDINO(
  imageUrl: string,
  tags: string[],
): Promise<GroundingHit[]> {
  if (tags.length === 0) return [];

  const [imageDataUri, { width, height }] = await Promise.all([
    toBase64DataUri(imageUrl),
    getImageDimensions(imageUrl),
  ]);

  const textPrompt = formatPrompt(tags);

  // Attempt 1 — default thresholds
  let result = await callGDINO(
    imageDataUri,
    textPrompt,
    0.35,
    0.25,
    width,
    height,
  );
  if (result.length > 0) return result;

  // Attempt 2 — lower
  result = await callGDINO(imageDataUri, textPrompt, 0.25, 0.2, width, height);
  if (result.length > 0) return result;

  // Attempt 3 — very low
  result = await callGDINO(imageDataUri, textPrompt, 0.15, 0.1, width, height);
  if (result.length > 0) return result;

  // Last resort — "all X" plurals on the top 15 tags
  const wrapped =
    tags
      .slice(0, 15)
      .map((t) => `all ${t}s`)
      .join(" . ") + " .";
  return callGDINO(imageDataUri, wrapped, 0.1, 0.08, width, height);
}

/**
 * Detection pipeline orchestrator.
 *
 * Runs all four model calls and returns a complete detection result:
 *   - RAM++ → GroundingDINO → SAM2 (sequential chain)
 *   - Depth Pro (parallel)
 *   - Room Context via Claude Vision (parallel)
 *
 * Every step is non-fatal individually; failures are accumulated in
 * `errors[]` and the route handler decides whether to surface them.
 */

import { runRAMPlusPlus } from "./ram";
import { runGroundingDINO } from "./grounding";
import type { GroundingHit } from "./grounding";
import { runSAM2 } from "./sam";
import { runDepthPro, sampleDepthAtBbox } from "./depth";
import {
  runRoomContextVision,
  generateFallbackRoomContext,
} from "./roomContext";
import type { DetectedObject, KeepMask, RoomContext } from "@/lib/types/area2";

export interface DetectionPipelineResult {
  objects: DetectedObject[];
  keepMask: KeepMask;
  roomContext: RoomContext;
  errors: string[];
  confidenceDistribution: number[];
}

/**
 * Dynamic confidence tier calibration.
 *
 * Real-world Grounding DINO confidence on indoor scenes commonly ranges
 * 0.25–0.65. Fixed thresholds (e.g. 0.85) would discard everything. We
 * calibrate tiers relative to the actual distribution for this run:
 *
 *   showUser        = max(0.25, topConfidence * 0.70)
 *   useInternally   = max(0.20, medianConfidence * 0.80)
 */
function calibrateConfidenceTiers(confidences: number[]): {
  showUser: number;
  useInternally: number;
} {
  if (confidences.length === 0) return { showUser: 0.5, useInternally: 0.3 };

  const sorted = [...confidences].sort((a, b) => b - a);
  const max = sorted[0] ?? 0;
  const p50 = sorted[Math.floor(sorted.length * 0.5)] ?? 0;

  const showUser = Math.max(0.25, max * 0.7);
  const useInternally = Math.max(0.2, p50 * 0.8);
  return { showUser, useInternally };
}

function tierFor(
  confidence: number,
  tiers: { showUser: number; useInternally: number },
): DetectedObject["confidenceTier"] {
  if (confidence >= tiers.showUser) return "show-user";
  if (confidence >= tiers.useInternally) return "use-internally";
  return "low-use-internally";
}

export async function runDetectionPipeline(
  imageUrl: string,
  _roomId: string,
): Promise<DetectionPipelineResult> {
  const errors: string[] = [];

  // Depth + room context run immediately in parallel — no dependencies.
  const depthPromise = runDepthPro(imageUrl).catch((e: unknown) => {
    errors.push(`Depth: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  });

  const roomContextPromise = runRoomContextVision(imageUrl).catch(
    (e: unknown) => {
      errors.push(`RoomContext: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    },
  );

  // RAM++ → GroundingDINO → SAM2 sequential chain.
  const ramTags = await runRAMPlusPlus(imageUrl);

  let groundingResults: GroundingHit[] = [];
  try {
    groundingResults = await runGroundingDINO(imageUrl, ramTags);
  } catch (e) {
    errors.push(`GroundingDINO: ${e instanceof Error ? e.message : String(e)}`);
  }

  let sam2Results: Record<string, string> = {};
  if (groundingResults.length > 0) {
    try {
      sam2Results = await runSAM2(imageUrl, groundingResults);
    } catch (e) {
      errors.push(`SAM2: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Await the parallel calls.
  const depthResult = await depthPromise;
  const roomContext = await roomContextPromise;

  // Calibrate tiers from the actual distribution.
  const confidences = groundingResults.map((r) => r.confidence);
  const tiers = calibrateConfidenceTiers(confidences);

  // Log the distribution so we can tune during development.
  if (confidences.length > 0) {
    const sorted = [...confidences].sort((a, b) => b - a);
    console.warn(
      `[detection] confidence distribution: n=${sorted.length} ` +
        `max=${sorted[0]?.toFixed(3)} p50=${sorted[Math.floor(sorted.length / 2)]?.toFixed(3)} ` +
        `min=${sorted[sorted.length - 1]?.toFixed(3)} ` +
        `tiers: show=${tiers.showUser.toFixed(3)} internal=${tiers.useInternally.toFixed(3)}`,
    );
  }

  const depthMap = depthResult?.depthMap ?? [];

  const objects: DetectedObject[] = groundingResults.map((r) => {
    const label = r.label.toLowerCase();
    const depth = sampleDepthAtBbox(depthMap, r.bbox);
    const obj: DetectedObject = {
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2),
      type: r.label,
      bbox: r.bbox,
      confidence: r.confidence,
      confidenceTier: tierFor(r.confidence, tiers),
      keep: false,
      immovable: false,
    };
    const mask = sam2Results[label];
    if (mask) obj.segmentationMask = mask;
    if (depth > 0) obj.depthMeters = depth;
    return obj;
  });

  const keepMask: KeepMask = {
    objects,
    depthMapUrl: depthResult?.depthMapUrl ?? "",
    rawDetectionCount: groundingResults.length,
    detectionModelVersion: "gdino-c589f7dd+sam2+depthpro",
  };

  return {
    objects,
    keepMask,
    roomContext: roomContext ?? generateFallbackRoomContext(),
    errors,
    confidenceDistribution: confidences,
  };
}

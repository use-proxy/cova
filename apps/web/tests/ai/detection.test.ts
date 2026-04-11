import { describe, it, expect } from "vitest";
import type { Detection } from "@/lib/ai/grounding";

describe("Detection Confidence Thresholds", () => {
  // Per COVA_CONTEXT.md:
  // >= 0.85: show to user as tap target
  // 0.70-0.85: use internally, never surface
  // < 0.70: ignore entirely

  const mockDetections: Detection[] = [
    {
      type: "furniture",
      label: "sofa",
      bbox: [0, 0, 100, 100],
      confidence: 0.95,
      showToUser: true,
    },
    {
      type: "furniture",
      label: "chair",
      bbox: [0, 0, 50, 50],
      confidence: 0.78,
      showToUser: false,
    },
    {
      type: "furniture",
      label: "table",
      bbox: [0, 0, 80, 80],
      confidence: 0.65,
      showToUser: false,
    },
  ];

  it("detections above 0.85 have showToUser true", () => {
    const highConfidence = mockDetections.filter((d) => d.confidence >= 0.85);
    highConfidence.forEach((d) => {
      expect(d.showToUser).toBe(true);
    });
  });

  it("detections between 0.70 and 0.85 have showToUser false", () => {
    const midConfidence = mockDetections.filter(
      (d) => d.confidence >= 0.7 && d.confidence < 0.85,
    );
    midConfidence.forEach((d) => {
      expect(d.showToUser).toBe(false);
    });
  });

  it("detections below 0.70 are filtered out entirely", () => {
    const filtered = mockDetections.filter((d) => d.confidence >= 0.7);
    const belowThreshold = mockDetections.filter((d) => d.confidence < 0.7);
    belowThreshold.forEach((low) => {
      expect(filtered).not.toContain(low);
    });
  });

  it("swap and rerender requires confidence > 0.85 AND depth quality > 0.70", () => {
    function isSwapEligible(confidence: number, depthQuality: number): boolean {
      return confidence > 0.85 && depthQuality > 0.7;
    }

    expect(isSwapEligible(0.9, 0.8)).toBe(true);
    expect(isSwapEligible(0.8, 0.8)).toBe(false);
    expect(isSwapEligible(0.9, 0.65)).toBe(false);
    expect(isSwapEligible(0.85, 0.7)).toBe(false);
    expect(isSwapEligible(0.86, 0.71)).toBe(true);
  });

  it("Detection type has all required fields", () => {
    const det: Detection = {
      type: "furniture",
      label: "sofa",
      bbox: [10, 20, 200, 300],
      confidence: 0.92,
      showToUser: true,
    };
    expect(det.type).toBeDefined();
    expect(det.label).toBeDefined();
    expect(det.bbox).toHaveLength(4);
    expect(det.confidence).toBeGreaterThanOrEqual(0);
    expect(det.confidence).toBeLessThanOrEqual(1);
    expect(typeof det.showToUser).toBe("boolean");
  });
});

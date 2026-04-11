"use client";

export interface QualityResult {
  passed: boolean;
  score: number;
  issues: QualityIssue[];
}

export interface QualityIssue {
  type: "blur" | "too_dark" | "too_small" | "too_large";
  message: string;
  severity: "error" | "warning";
}

const MIN_WIDTH = 800;
const MIN_HEIGHT = 600;
const MAX_FILE_SIZE_MB = 10;
const BLUR_THRESHOLD = 100;

export function checkImageQuality(
  file: File,
  imageElement: HTMLImageElement,
): Promise<QualityResult> {
  return new Promise((resolve) => {
    const issues: QualityIssue[] = [];

    // File size check
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > MAX_FILE_SIZE_MB) {
      issues.push({
        type: "too_large",
        message: `Photo is ${sizeMB.toFixed(1)}MB. Please use a photo under 10MB.`,
        severity: "error",
      });
    }

    // Resolution check
    if (
      imageElement.naturalWidth < MIN_WIDTH ||
      imageElement.naturalHeight < MIN_HEIGHT
    ) {
      issues.push({
        type: "too_small",
        message:
          "Photo resolution is too low. Please use a higher quality photo.",
        severity: "error",
      });
    }

    // Blur detection via Laplacian variance
    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const sampleSize = 200;
        canvas.width = sampleSize;
        canvas.height = sampleSize;

        const srcX = (imageElement.naturalWidth - sampleSize) / 2;
        const srcY = (imageElement.naturalHeight - sampleSize) / 2;

        ctx.drawImage(
          imageElement,
          srcX,
          srcY,
          sampleSize,
          sampleSize,
          0,
          0,
          sampleSize,
          sampleSize,
        );

        const imageData = ctx.getImageData(0, 0, sampleSize, sampleSize);
        const variance = computeLaplacianVariance(imageData);

        if (variance < BLUR_THRESHOLD) {
          issues.push({
            type: "blur",
            message:
              "Photo appears blurry. For best results use a clear, steady shot.",
            severity: "warning",
          });
        }
      }
    } catch {
      // Blur check failed — do not block upload
    }

    const errors = issues.filter((i) => i.severity === "error");
    const warnings = issues.filter((i) => i.severity === "warning");
    const score = Math.max(0, 100 - errors.length * 40 - warnings.length * 15);

    resolve({
      passed: errors.length === 0,
      score,
      issues,
    });
  });
}

function computeLaplacianVariance(imageData: ImageData): number {
  const { data, width, height } = imageData;
  const gray = new Float32Array(width * height);

  for (let i = 0; i < width * height; i++) {
    gray[i] =
      0.299 * (data[i * 4] ?? 0) +
      0.587 * (data[i * 4 + 1] ?? 0) +
      0.114 * (data[i * 4 + 2] ?? 0);
  }

  let sum = 0;
  let sumSq = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const laplacian =
        -4 * (gray[idx] ?? 0) +
        (gray[idx - 1] ?? 0) +
        (gray[idx + 1] ?? 0) +
        (gray[idx - width] ?? 0) +
        (gray[idx + width] ?? 0);
      sum += laplacian;
      sumSq += laplacian * laplacian;
      count++;
    }
  }

  const mean = sum / count;
  return sumSq / count - mean * mean;
}

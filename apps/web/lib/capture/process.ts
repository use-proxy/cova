import sharp from "sharp";

export interface ProcessedImage {
  buffer: Buffer;
  width: number;
  height: number;
  byteLength: number;
}

/**
 * Strip EXIF, normalize orientation, downscale to ≤1536px on longest edge,
 * re-encode as JPEG q90 with mozjpeg. EXIF strip is mandatory per D-009.
 */
export async function processCaptureImage(input: Buffer | string): Promise<ProcessedImage> {
  const pipeline = sharp(input)
    .rotate()
    .resize(1536, 1536, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90, mozjpeg: true })
    .withMetadata({});

  const buffer = await pipeline.toBuffer();
  const meta = await sharp(buffer).metadata();
  return {
    buffer,
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    byteLength: buffer.length,
  };
}

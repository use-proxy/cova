/**
 * Mask Assembly — Differential Diffusion Change Map
 *
 * Builds a grayscale change map for differential diffusion / kept-item preservation.
 * White (255) = regenerate, Black (0) = preserve exactly.
 *
 * Used in the redesign pipeline to prevent floor, walls, and kept items
 * from changing even when the overall room is being redesigned.
 *
 * Note: This runs server-side only (Next.js API route). Uses sharp for
 * image manipulation (available in this project via package.json).
 */

import sharp from "sharp";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export interface AssembleDifferentialMapInput {
  imageWidth: number;
  imageHeight: number;
  keepItemMasks: string[];  // EVF-SAM2 mask URLs — white = item region, black = background
  removeItemMasks: string[]; // (unused in TypeScript path — Python pipeline uses floor/wall detection)
  roomId: string;
}

/**
 * Assembles a differential diffusion change map from EVF-SAM2 kept item masks.
 *
 * Logic:
 * 1. Start with all-white canvas (everything regenerates by default)
 * 2. For each kept item mask: download, resize to image dims, paint white mask pixels → black on change map
 * 3. Dilate all black regions by 5px (approximated via blur + threshold)
 * 4. Upload to Supabase room-photos/masks/{roomId}/change_map.png
 * 5. Return signed URL (7 days)
 *
 * Note: Floor and wall preservation is handled by the Python pipeline's build_change_map
 * function (which has access to the depth map). This TypeScript function only handles
 * kept item masks from EVF-SAM2.
 */
export async function assembleDifferentialMap(
  input: AssembleDifferentialMapInput,
): Promise<string> {
  const { imageWidth, imageHeight, keepItemMasks, roomId } = input;

  console.log(
    `[mask-assembly] Building change map for room ${roomId}: ${imageWidth}x${imageHeight}, ${keepItemMasks.length} kept masks`,
  );

  // Start with all-white canvas (everything regenerates by default)
  // Using raw RGBA buffer: 4 bytes per pixel, all 255
  const canvasSize = imageWidth * imageHeight;
  const rawBuffer = Buffer.alloc(canvasSize * 4, 255); // RGBA all white

  // Download and apply each kept item mask
  for (const maskUrl of keepItemMasks) {
    if (!maskUrl?.startsWith("https://")) continue;
    try {
      const resp = await fetch(maskUrl);
      if (!resp.ok) {
        console.warn(`[mask-assembly] Failed to fetch mask ${maskUrl}: ${resp.status}`);
        continue;
      }
      const maskBytes = Buffer.from(await resp.arrayBuffer());

      // Resize mask to target dimensions, convert to grayscale, get raw pixel data
      const { data: maskData } = await sharp(maskBytes)
        .resize(imageWidth, imageHeight, { fit: "fill" })
        .greyscale()
        .raw()
        .toBuffer({ resolveWithObject: true });

      // Where mask is white (> 128) = kept item region → paint black on change map
      for (let i = 0; i < maskData.length; i++) {
        if (maskData[i] > 128) {
          const baseIdx = i * 4;
          rawBuffer[baseIdx] = 0;      // R = 0 (black)
          rawBuffer[baseIdx + 1] = 0;  // G = 0
          rawBuffer[baseIdx + 2] = 0;  // B = 0
          rawBuffer[baseIdx + 3] = 255; // A = fully opaque
        }
      }
      console.log(`[mask-assembly] Applied mask: ${maskUrl.slice(-50)}`);
    } catch (err) {
      console.warn(`[mask-assembly] Failed to process mask ${maskUrl}:`, err);
      // Non-fatal — continue with other masks
    }
  }

  // Dilate black regions by ~5px using blur + threshold approximation.
  // sharp blur(3) spreads black edges by ~3px in each direction, then
  // threshold at 200 converts the blurred edges back to hard binary.
  const dilatedPng = await sharp(rawBuffer, {
    raw: { width: imageWidth, height: imageHeight, channels: 4 },
  })
    .greyscale()         // collapse to 1-channel
    .blur(3)             // spread black regions (~5px effective dilation)
    .threshold(200)      // reconvert to binary: < 200 → black, ≥ 200 → white
    .png()
    .toBuffer();

  // Upload to Supabase room-photos/masks/{roomId}/change_map.png
  const admin = createAdminSupabaseClient();
  const storagePath = `masks/${roomId}/change_map.png`;

  try {
    const { error: uploadError } = await admin.storage
      .from("room-photos")
      .upload(storagePath, dilatedPng, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadError) {
      const errMsg = uploadError.message?.toLowerCase() ?? "";
      if (
        errMsg.includes("already exists") ||
        errMsg.includes("duplicate") ||
        errMsg.includes("409")
      ) {
        // Update on conflict
        await admin.storage
          .from("room-photos")
          .update(storagePath, dilatedPng, { contentType: "image/png" });
      } else {
        throw uploadError;
      }
    }
  } catch (err) {
    const errMsg = String(err).toLowerCase();
    if (
      errMsg.includes("already exists") ||
      errMsg.includes("duplicate") ||
      errMsg.includes("409")
    ) {
      await admin.storage
        .from("room-photos")
        .update(storagePath, dilatedPng, { contentType: "image/png" });
    } else {
      throw err;
    }
  }

  // Return signed URL (7 days = 604800 seconds)
  const { data: signedData, error: signedError } = await admin.storage
    .from("room-photos")
    .createSignedUrl(storagePath, 604800);

  if (signedError || !signedData?.signedUrl) {
    throw new Error(
      `[mask-assembly] Failed to get signed URL for ${storagePath}: ${signedError?.message ?? "no URL returned"}`,
    );
  }

  console.log(
    `[mask-assembly] Change map uploaded: ${signedData.signedUrl.slice(0, 80)}`,
  );
  return signedData.signedUrl;
}

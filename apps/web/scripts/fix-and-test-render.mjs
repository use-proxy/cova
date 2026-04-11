import Replicate from "replicate";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "..", ".env.local") });

const r = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const ROOM_PHOTO_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/room-uploads/IMG_2093.jpeg`;

async function downloadAndRotate(url) {
  console.log("Downloading room photo...");
  const resp = await fetch(url);
  if (!resp.ok) throw new Error("Download failed: " + resp.status + " " + url);
  const buffer = Buffer.from(await resp.arrayBuffer());
  console.log("Original size:", buffer.length, "bytes");

  const origMeta = await sharp(buffer).metadata();
  console.log(
    "Original metadata:",
    origMeta.width,
    "x",
    origMeta.height,
    "orientation=",
    origMeta.orientation,
  );

  // Auto-rotate based on EXIF orientation data
  const rotated = await sharp(buffer)
    .rotate() // reads EXIF orientation and rotates pixels
    .jpeg({ quality: 95 })
    .toBuffer();

  const metadata = await sharp(rotated).metadata();
  console.log("After rotation:", metadata.width, "x", metadata.height);

  // Save rotated image locally
  mkdirSync(join(__dirname, "render-tests"), { recursive: true });
  writeFileSync(join(__dirname, "render-tests", "room-rotated.jpg"), rotated);
  console.log("Saved rotated photo to scripts/render-tests/room-rotated.jpg");

  // Upload rotated version
  const { error } = await sb.storage
    .from("room-uploads")
    .upload("IMG_2093_rotated.jpeg", rotated, {
      contentType: "image/jpeg",
      upsert: true,
    });
  if (error) throw new Error("Upload failed: " + error.message);

  const { data: urlData } = sb.storage
    .from("room-uploads")
    .getPublicUrl("IMG_2093_rotated.jpeg");

  // Cache-bust to avoid stale CDN copy from prior runs
  const bustedUrl = urlData.publicUrl + "?v=" + Date.now();
  console.log("Rotated photo URL:", bustedUrl);
  return bustedUrl;
}

async function runKontextRender(photoUrl, prompt, label) {
  console.log(`\nRunning Kontext render (${label})...`);
  console.log("Prompt:", prompt.slice(0, 200) + "...");

  const pred = await r.predictions.create({
    model: "black-forest-labs/flux-kontext-pro",
    input: {
      input_image: photoUrl,
      prompt,
      output_format: "jpg",
      output_quality: 92,
      safety_tolerance: 2,
    },
  });
  console.log("Prediction ID:", pred.id);

  let p = pred;
  const start = Date.now();
  while (
    p.status !== "succeeded" &&
    p.status !== "failed" &&
    p.status !== "canceled"
  ) {
    if (Date.now() - start > 180000) throw new Error("Timeout: " + pred.id);
    await new Promise((res) => setTimeout(res, 4000));
    p = await r.predictions.get(pred.id);
    console.log(p.status, Math.round((Date.now() - start) / 1000) + "s");
  }
  if (p.status !== "succeeded")
    throw new Error("Render failed: " + JSON.stringify(p.error));

  const outputUrl = Array.isArray(p.output) ? p.output[0] : p.output;
  console.log(`${label} URL:`, outputUrl);

  const imgResp = await fetch(outputUrl);
  const imgBuffer = Buffer.from(await imgResp.arrayBuffer());
  const filename = join(
    __dirname,
    "render-tests",
    `${label.replace(/\s+/g, "-")}.jpg`,
  );
  writeFileSync(filename, imgBuffer);
  console.log(`Saved to ${filename}`);

  return outputUrl;
}

async function main() {
  const rotatedUrl = await downloadAndRotate(ROOM_PHOTO_URL);

  const check = await fetch(rotatedUrl, { method: "HEAD" });
  console.log(
    "Rotated URL accessible:",
    check.status,
    check.headers.get("content-length"),
    "bytes",
  );
  if (!check.ok) throw new Error("Rotated URL not accessible");

  // PROMPT VARIANT A — Transformation-first
  const promptA = [
    "Completely redesign this bedroom with professional coastal interior design staging.",
    "Transform the space: replace all furniture with coastal style pieces — " +
      "add a rattan or wicker nightstand, coastal artwork above the bed, " +
      "woven jute rug on the carpet, new styled bedding in white and blue tones, " +
      "add small coastal decorative accents.",
    "Remove all clutter, backpacks, cords, and messy items from the room.",
    "Keep completely unchanged: the light blue wall color, the beige carpet, " +
      "the white ceiling fan with light, the window with white cellular blinds on the left wall, " +
      "the DAKSH letters on the wall, the string of photos hanging on the wall, " +
      "the white bed frame with storage drawers, the camera angle and room proportions.",
    "Photorealistic interior design photography, professional staging, same lighting.",
  ].join(" ");

  const pass1UrlA = await runKontextRender(
    rotatedUrl,
    promptA,
    "pass1-variant-a",
  );

  // PROMPT VARIANT B — More explicit replacement
  const promptB = [
    "Interior design makeover: this bedroom needs a coastal redesign.",
    "REPLACE with new coastal items: messy bedding → crisp white duvet with " +
      "blue accent pillows, blue IKEA drawer unit → rattan nightstand with lamp, " +
      "office chair → rattan accent chair or remove it, backpack and clutter → remove completely.",
    "ADD coastal decor: woven jute rug, coastal wall art, simple white curtains over the blinds, " +
      "small potted plants, decorative basket.",
    "PRESERVE exactly: light blue wall color, beige carpet, white ceiling fan, " +
      "window position with cellular blinds, DAKSH letters, hanging photo string, " +
      "white bed frame with storage drawers, room layout and camera angle.",
    "Result: same room transformed into a beautiful coastal bedroom. " +
      "Photorealistic, professionally staged.",
  ].join(" ");

  const pass1UrlB = await runKontextRender(
    rotatedUrl,
    promptB,
    "pass1-variant-b",
  );

  // Pass 2 correction on variant B
  const correctionPrompt = [
    "This is a redesigned coastal bedroom. The furniture and decor style is correct.",
    "Make ONLY these corrections if needed:",
    "1. Wall color should be light sky blue — correct if wrong.",
    "2. Image should be upright — correct orientation if rotated.",
    "3. Carpet should be beige — correct if wrong.",
    "4. Do NOT change any furniture, decor, bedding, or styling elements.",
    "5. If everything looks architecturally correct, return the image unchanged.",
  ].join(" ");

  const pass2UrlB = await runKontextRender(
    pass1UrlB,
    correctionPrompt,
    "pass2-variant-b",
  );

  console.log("\n=== RENDER TEST COMPLETE ===");
  console.log("Rotated photo:", rotatedUrl);
  console.log("Pass1 Variant A:", pass1UrlA);
  console.log("Pass1 Variant B:", pass1UrlB);
  console.log("Pass2 (final):", pass2UrlB);
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});

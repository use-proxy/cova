/**
 * Verify FLUX Fill Pro swap prediction creation.
 * Does not wait for full completion — creation + polling for <60s only.
 */
import Replicate from "replicate";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN! });

async function verify() {
  console.log("=== SWAP VERIFICATION ===");
  console.log("1. Creating FLUX Fill Pro prediction...");
  const prediction = await replicate.predictions.create({
    model: "black-forest-labs/flux-fill-pro",
    input: {
      image:
        "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=1024&h=1024&fit=crop",
      mask: "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/room-photos/inpainting-masks/1d39eb18-1887-4e99-9c60-99bc34f37bcb-1775525237899.png",
      prompt:
        "modern minimalist walnut coffee table with hairpin legs, photorealistic interior design",
      steps: 28,
      guidance: 25,
      output_format: "jpg",
      safety_tolerance: 2,
    },
  });

  console.log(
    "OK prediction created:",
    prediction.id,
    "status:",
    prediction.status,
  );
  if (!prediction.id) throw new Error("No prediction ID returned");

  console.log("2. Polling (max 60s)...");
  const startTime = Date.now();
  let result = prediction;
  while (result.status !== "succeeded" && result.status !== "failed") {
    if (Date.now() - startTime > 60000) {
      console.log("INFO still running at 60s — considered creation-verified");
      console.log("INFO prediction id:", prediction.id);
      console.log("PASS SWAP: creation verified (completion not waited)");
      return;
    }
    await new Promise((r) => setTimeout(r, 3000));
    result = await replicate.predictions.get(prediction.id);
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log("   status:", result.status, "(" + elapsed + "s)");
  }

  if (result.status === "failed") {
    throw new Error("Swap failed: " + result.error);
  }
  const swapUrl = Array.isArray(result.output)
    ? String(result.output[0])
    : String(result.output);
  console.log("OK swap completed, URL:", swapUrl.slice(0, 80));

  const resp = await fetch(swapUrl, { method: "HEAD" });
  if (!resp.ok) throw new Error("Swap URL not accessible: " + resp.status);
  console.log("OK swap URL accessible");
  console.log("PASS SWAP: FULLY VERIFIED");
}

verify().catch((e) => {
  console.error("FAIL SWAP:", e.message);
  process.exit(1);
});

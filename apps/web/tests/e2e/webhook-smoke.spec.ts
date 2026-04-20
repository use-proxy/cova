/**
 * Webhook Smoke Test — Direct Pipeline Trigger (No Browser)
 *
 * Fires the redesign pipeline directly via the API route with dev bypass auth,
 * polls until redesign_pano_url updates, and verifies the render is accessible.
 *
 * This test does NOT require a browser or UI — it tests the pipeline
 * end-to-end via HTTP requests and Supabase polling.
 *
 * Requires:
 *   - Server running at BASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY in .env.local
 *   - REDESIGN_PIPELINE_WEBHOOK_URL configured
 *   - At least one room with original_photo_url in the DB
 *
 * Cost per run: ~$1.00–$2.00 (Modal pipeline + fal.ai + Anthropic)
 * Runtime: ~3–7 minutes wall clock
 */

import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const BASE_URL = `http://localhost:${process.env.E2E_PORT ?? "3001"}`;
const OUTPUTS_DIR = path.join(__dirname, "outputs");

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

test.describe("Webhook Smoke Test", () => {
  test("direct pipeline trigger → render URL", async () => {
    test.setTimeout(420_000); // 7 minutes

    const admin = adminClient();
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    expect(serviceRoleKey, "SUPABASE_SERVICE_ROLE_KEY must be set").toBeTruthy();

    // ── 1. Find a room with original_photo_url ────────────────────────────
    const { data: rooms, error: roomsErr } = await admin
      .from("rooms")
      .select("id, original_photo_url, original_image_url, user_id, redesign_pano_url, redesign_status")
      .or("original_photo_url.not.is.null,original_image_url.not.is.null")
      .order("created_at", { ascending: false })
      .limit(5);

    if (roomsErr) throw new Error(`Room query failed: ${roomsErr.message}`);
    expect(rooms?.length, "No rooms with photos found in DB").toBeGreaterThan(0);

    // Pick the most recent room that has a photo URL
    const targetRoom = rooms!.find(
      (r) => r.original_photo_url || r.original_image_url,
    )!;
    const roomId = targetRoom.id;
    const photoUrl =
      targetRoom.original_photo_url ?? targetRoom.original_image_url;

    console.log(`[smoke] Using room: ${roomId}`);
    console.log(`[smoke] Photo URL: ${photoUrl?.substring(0, 80)}`);
    console.log(`[smoke] Current redesign_pano_url: ${targetRoom.redesign_pano_url?.substring(0, 60) ?? "null"}`);

    // Record the current redesign_pano_url so we can detect when it changes
    const previousPanoUrl = targetRoom.redesign_pano_url;

    // ── 2. Clear previous render state to force a fresh render ────────────
    await admin
      .from("rooms")
      .update({
        redesign_status: null,
        redesign_pano_url: null,
      })
      .eq("id", roomId);

    console.log("[smoke] Cleared previous render state");

    // ── 3. Fire the redesign pipeline via API route ───────────────────────
    // Use x-dev-bypass header to skip browser auth
    console.log("[smoke] Firing redesign pipeline...");

    const response = await fetch(`${BASE_URL}/api/pipeline/redesign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-dev-bypass": serviceRoleKey,
      },
      body: JSON.stringify({
        room_id: roomId,
      }),
    });

    const responseText = await response.text();
    let responseData: Record<string, unknown>;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      throw new Error(
        `Pipeline response not JSON (${response.status}): ${responseText.substring(0, 500)}`,
      );
    }

    console.log(`[smoke] Pipeline response: ${response.status}`);
    console.log(`[smoke] Response body: ${JSON.stringify(responseData).substring(0, 300)}`);

    expect(
      response.ok,
      `Pipeline failed (${response.status}): ${JSON.stringify(responseData)}`,
    ).toBe(true);

    // ── 4. Poll redesign_pano_url until it updates ────────────────────────
    console.log("[smoke] Polling for render completion (up to 5 minutes)...");

    let renderUrl: string | null = null;
    const maxPollAttempts = 60; // 60 × 5s = 5 minutes
    let attempts = 0;

    while (attempts < maxPollAttempts) {
      await new Promise((r) => setTimeout(r, 5_000));
      attempts++;

      const { data: room } = await admin
        .from("rooms")
        .select("redesign_pano_url, redesign_status")
        .eq("id", roomId)
        .single();

      const status = room?.redesign_status ?? "unknown";
      const panoUrl = room?.redesign_pano_url;

      console.log(
        `[smoke] Poll ${attempts}/${maxPollAttempts}: status=${status}, pano_url=${panoUrl?.substring(0, 50) ?? "null"}`,
      );

      if (status === "error" || status === "failed") {
        throw new Error(`Pipeline failed with status: ${status}`);
      }

      if (
        panoUrl &&
        typeof panoUrl === "string" &&
        panoUrl.startsWith("https://") &&
        panoUrl !== previousPanoUrl
      ) {
        renderUrl = panoUrl;
        break;
      }
    }

    expect(
      renderUrl,
      "redesign_pano_url did not populate within 5 minutes",
    ).toBeTruthy();

    console.log(`[smoke] Render URL: ${renderUrl}`);

    // ── 5. Verify render is accessible and > 100KB ────────────────────────
    const renderResponse = await fetch(renderUrl!);
    expect(
      renderResponse.status,
      `Render URL returned ${renderResponse.status}`,
    ).toBe(200);

    const renderBuffer = Buffer.from(await renderResponse.arrayBuffer());
    const fileSizeKB = renderBuffer.byteLength / 1024;

    expect(
      renderBuffer.byteLength,
      `Render too small: ${fileSizeKB.toFixed(0)} KB`,
    ).toBeGreaterThan(100 * 1024);

    console.log(`[smoke] Render file size: ${fileSizeKB.toFixed(0)} KB`);

    // ── 6. Save render URL and file ───────────────────────────────────────
    fs.mkdirSync(OUTPUTS_DIR, { recursive: true });

    // Save URL to text file
    fs.writeFileSync(
      path.join(OUTPUTS_DIR, "smoke_render_url.txt"),
      `${renderUrl}\n\nRoom ID: ${roomId}\nTimestamp: ${new Date().toISOString()}\nFile size: ${fileSizeKB.toFixed(0)} KB\n`,
    );

    // Also save the render image
    fs.writeFileSync(
      path.join(OUTPUTS_DIR, "smoke_render.jpg"),
      renderBuffer,
    );

    console.log("\n=== WEBHOOK SMOKE TEST PASSED ===");
    console.log(`Room ID: ${roomId}`);
    console.log(`Render URL: ${renderUrl}`);
    console.log(`File size: ${fileSizeKB.toFixed(0)} KB`);
    console.log(`Saved to: tests/e2e/outputs/smoke_render_url.txt`);
  });
});

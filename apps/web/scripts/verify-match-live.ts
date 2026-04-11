/**
 * Live test of /api/match after the furniture-constraint fix.
 * Authenticates via E2E creds, creates a real room, uploads a photo,
 * runs detection to populate keep_mask, then calls /api/match for the
 * first detected item and prints what came back.
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const BASE = "http://localhost:3001";

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data: auth, error: authErr } = await sb.auth.signInWithPassword({
    email: process.env.E2E_TEST_EMAIL!,
    password: process.env.E2E_TEST_PASSWORD!,
  });
  if (authErr || !auth.session)
    throw new Error("auth failed: " + authErr?.message);

  // Build the sb-<ref>-auth-token cookie the same way the test helper does
  const projectRef = new URL(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
  ).hostname.split(".")[0];
  const cookieName = `sb-${projectRef}-auth-token`;
  const cookieValue = JSON.stringify(auth.session);
  const cookieHeader = `${cookieName}=${encodeURIComponent(cookieValue)}`;

  const fetchWithAuth = (path: string, init: RequestInit = {}) =>
    fetch(BASE + path, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string>),
        Cookie: cookieHeader,
      },
    });

  // Create a room
  const createRes = await fetchWithAuth("/api/rooms/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ room_type: "bedroom" }),
  });
  if (createRes.status !== 200)
    throw new Error("room create failed: " + createRes.status);
  const { id: roomId } = (await createRes.json()) as { id: string };
  console.log("room:", roomId);

  // Upload a photo via multipart form
  const photoBlob = await fetch(
    "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=1024",
  ).then((r) => r.arrayBuffer());
  const fd = new FormData();
  fd.append("photo", new Blob([photoBlob], { type: "image/jpeg" }), "test.jpg");
  fd.append("room_id", roomId);
  const captureRes = await fetch(BASE + "/api/rooms/capture", {
    method: "POST",
    headers: { Cookie: cookieHeader },
    body: fd,
  });
  if (captureRes.status !== 200)
    throw new Error("capture failed: " + captureRes.status);
  const { photo_url } = (await captureRes.json()) as { photo_url: string };
  console.log("photo:", photo_url.slice(0, 60));

  // Run detection
  console.log("running detection (60-120s)...");
  const detectRes = await fetchWithAuth("/api/detect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ photo_url, room_id: roomId }),
  });
  if (detectRes.status !== 200)
    throw new Error("detect failed: " + (await detectRes.text()));
  const detectData = (await detectRes.json()) as {
    detections: Array<{ label: string; bbox: number[] }>;
  };
  console.log("detections:", detectData.detections.length);

  // Pick the first furniture-looking detection
  const first =
    detectData.detections.find(
      (d) => !["Wall", "Floor", "Ceiling", "Window", "Door"].includes(d.label),
    ) ?? detectData.detections[0];
  if (!first) throw new Error("no detections to match against");
  console.log("matching:", first.label, first.bbox);

  // Call match
  const matchRes = await fetchWithAuth("/api/match", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      render_url: photo_url,
      item_id: first.label + "-" + Date.now(),
      item_label: first.label,
      item_bbox: first.bbox,
      item_keep: false,
      fingerprint_vector: {
        dimensions: {
          luminosity: 0.5,
          density: -0.3,
          temperature: 0.4,
          form: 0.5,
          era: 0.2,
          texture: 0.3,
          scale: 0,
          nature: 0.6,
          saturation: -0.3,
          materialOrigin: 0.5,
        },
        covariance: Array(10).fill(Array(10).fill(0.3)),
        confidence: 0.7,
      },
      budget_range: [500, 2000],
      room_type: "bedroom",
      room_id: roomId,
    }),
  });
  const matchData = (await matchRes.json()) as {
    products?: Array<{
      name?: string;
      retailer?: string;
      price?: number;
      affiliate_url?: string;
    }>;
    error?: string;
  };
  console.log("---");
  console.log("products returned:", matchData.products?.length ?? 0);
  console.log("error:", matchData.error || "none");
  matchData.products?.slice(0, 8).forEach((p, i) => {
    console.log(
      `  ${i + 1}. ${(p.name ?? "").slice(0, 50)} | ${p.retailer} | $${p.price}`,
    );
  });

  // Cleanup
  await createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
    .from("rooms")
    .delete()
    .eq("id", roomId);
}

main().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});

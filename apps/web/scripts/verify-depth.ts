/**
 * Verify depth estimation end-to-end:
 *  - Replicate depth-anything-v2 call returns a valid grey depth URL
 *  - URL is accessible and returns a real image
 *  - The URL can be written into rooms.depth_map_url via auth (E2E user)
 *  - Read-back verifies the column was set
 */
import Replicate from "replicate";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN! });
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function verify() {
  console.log("=== DEPTH VERIFICATION ===");

  console.log("1. Calling Depth Anything V2...");
  const out = (await replicate.run(
    "chenxwh/depth-anything-v2:b239ea33cff32bb7abb5db39ffe9a09c14cbc2894331d1ef66fe096eed88ebd4",
    {
      input: {
        image:
          "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=1024",
        model_size: "Large",
      },
    },
  )) as Record<string, unknown>;

  const greyRaw = out.grey_depth;
  let depthUrl = "";
  if (
    greyRaw &&
    typeof (greyRaw as { url?: () => { href: string } }).url === "function"
  ) {
    depthUrl = (greyRaw as { url: () => { href: string } }).url().href;
  }
  if (!depthUrl) depthUrl = String(greyRaw);
  if (!depthUrl.startsWith("http"))
    throw new Error("Depth URL invalid: " + depthUrl);
  console.log("OK Depth URL:", depthUrl.slice(0, 80));

  const headResp = await fetch(depthUrl, { method: "HEAD" });
  if (!headResp.ok)
    throw new Error("Depth URL not accessible: " + headResp.status);
  const size = headResp.headers.get("content-length");
  console.log("OK Depth URL accessible, size:", size, "bytes");
  if (parseInt(size ?? "0") < 10000) {
    throw new Error("Depth map too small — likely invalid: " + size + " bytes");
  }

  // Sign in with E2E user
  const { data: authData, error: authErr } = await sb.auth.signInWithPassword({
    email: process.env.E2E_TEST_EMAIL!,
    password: process.env.E2E_TEST_PASSWORD!,
  });
  if (authErr || !authData?.user)
    throw new Error("Auth failed: " + authErr?.message);
  const user = authData.user;

  const { data: room, error: roomErr } = await sb
    .from("rooms")
    .insert({
      user_id: user.id,
      original_photo_url:
        "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=1024",
      room_type: "living_room",
    })
    .select()
    .single();
  if (roomErr) throw new Error("Room create failed: " + roomErr.message);

  const { error: updateErr } = await sb
    .from("rooms")
    .update({ depth_map_url: depthUrl })
    .eq("id", room.id);
  if (updateErr) throw new Error("Depth write failed: " + updateErr.message);

  const { data: verified } = await sb
    .from("rooms")
    .select("depth_map_url")
    .eq("id", room.id)
    .single();
  if (!verified?.depth_map_url)
    throw new Error("depth_map_url null after write");
  console.log("OK depth_map_url written and verified in DB for room", room.id);

  await sb.from("rooms").delete().eq("id", room.id);
  console.log("OK cleanup done");
  console.log("PASS DEPTH: FULLY VERIFIED");
  return { depthUrl, size };
}

verify().catch((e) => {
  console.error("FAIL DEPTH:", e.message);
  process.exit(1);
});

/**
 * Full pipeline integration test.
 *
 * 1. Reads derived fingerprint from /tmp/derived_fingerprint.json
 * 2. Finds a real test user and photo in Supabase
 * 3. Creates a test room with complete render_context
 * 4. Fires the redesign pipeline
 * 5. Polls until complete
 * 6. Downloads the render output image
 * 7. Saves state for the comparison script
 *
 * Run: node --env-file=apps/web/.env.local apps/web/scripts/test-full-pipeline.mjs
 */

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "../../..");

// ─── CONFIG ─────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error(
    "Missing SUPABASE env vars. Run with --env-file=apps/web/.env.local"
  );
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ─── LOAD DERIVED DATA ───────────────────────────────────────────────────
const fingerprintData = JSON.parse(
  fs.readFileSync("/tmp/derived_fingerprint.json", "utf8")
);
const thresholds = JSON.parse(
  fs.readFileSync("/tmp/render_thresholds.json", "utf8")
);
const fingerprint = fingerprintData.fingerprint;
const styleBlend = fingerprintData.style_blend;

console.log(`\n[TEST] Style: ${styleBlend.primaryStyle}`);
console.log(
  `[TEST] Top dimensions: ${Object.keys(styleBlend.weights).slice(0, 3).join(", ")}`
);

// ─── DERIVE PREFERENCES FROM FINGERPRINT ────────────────────────────────
function derivePreferencesFromFingerprint(fp, styleName) {
  const prefs = {
    specialNotes: [],
    sensoryKeywords: [],
    decorObjects: [],
    plantCount: 0,
    densityDescription: "",
  };

  if (fp.density > 0.7) {
    prefs.densityDescription = "maximalist";
    prefs.specialNotes.push(
      "Maximize decoration throughout — layer objects on every surface"
    );
    prefs.decorObjects.push(
      "ceramic vessels",
      "art books",
      "woven baskets",
      "candles",
      "trays with objects"
    );
  } else if (fp.density > 0.4) {
    prefs.densityDescription = "curated";
    prefs.specialNotes.push(
      "Curated decoration — thoughtful placement of key pieces"
    );
    prefs.decorObjects.push("ceramic vessel", "art books", "single statement plant");
  } else {
    prefs.densityDescription = "minimal";
    prefs.specialNotes.push("Keep surfaces clear — minimal decoration");
    prefs.decorObjects.push("single ceramic", "one plant");
  }

  if (fp.nature > 0.6) {
    prefs.plantCount = 3;
    prefs.specialNotes.push(
      "Abundant plants throughout — include large statement plant and smaller trailing plants"
    );
  } else if (fp.nature > 0.3) {
    prefs.plantCount = 1;
    prefs.specialNotes.push("Include at least one large indoor plant");
  }

  if (fp.lightPreference > 0.75) {
    prefs.specialNotes.push(
      "Light and airy feel — maximize brightness, light neutral palette"
    );
    prefs.sensoryKeywords.push("bright", "airy", "light-filled");
  } else if (fp.lightPreference < 0.4) {
    prefs.specialNotes.push("Moody and intimate atmosphere — warm low lighting");
    prefs.sensoryKeywords.push("intimate", "cozy", "dramatic");
  }

  if (fp.material > 0.7) {
    prefs.specialNotes.push(
      "Natural materials throughout — rattan, wood, linen, jute, woven textures"
    );
    prefs.sensoryKeywords.push("natural", "organic", "tactile");
  }

  if (fp.pattern > 0.6) {
    prefs.specialNotes.push(
      "Rich pattern mix — gallery wall with varied art pieces, layered textiles"
    );
  }

  return {
    notes: prefs.specialNotes.join(". "),
    sensoryProfile: {
      density: prefs.densityDescription,
      lightQuality:
        fp.lightPreference > 0.7
          ? "bright and airy"
          : fp.lightPreference < 0.4
            ? "intimate and moody"
            : "balanced",
      plantPresence:
        fp.nature > 0.6 ? "abundant" : fp.nature > 0.3 ? "moderate" : "minimal",
      moodKeywords: prefs.sensoryKeywords,
    },
    decorObjects: prefs.decorObjects,
    plantCount: prefs.plantCount,
  };
}

const prefs = derivePreferencesFromFingerprint(
  fingerprint,
  styleBlend.primaryStyle
);
console.log(`\n[TEST] Derived preferences:`);
console.log(`  Notes: ${prefs.notes}`);
console.log(`  Density: ${prefs.sensoryProfile.density}`);
console.log(`  Plants: ${prefs.sensoryProfile.plantPresence}`);

// ─── FIND A TEST USER AND PHOTO ──────────────────────────────────────────
const { data: existingRooms, error: roomsErr } = await admin
  .from("rooms")
  .select("id, user_id, original_photo_url, room_type")
  .not("original_photo_url", "is", null)
  .order("created_at", { ascending: false })
  .limit(5);

if (!existingRooms || existingRooms.length === 0) {
  console.error(
    "[ERROR] No rooms with photos found in Supabase. Upload a photo first."
  );
  process.exit(1);
}

const sourceRoom = existingRooms[0];
const testUserId = sourceRoom.user_id;
const testPhotoUrl = sourceRoom.original_photo_url;
const testRoomType = sourceRoom.room_type || "living_room";

console.log(`\n[TEST] Using photo from room: ${sourceRoom.id}`);
console.log(`[TEST] User: ${testUserId}`);
console.log(`[TEST] Room type: ${testRoomType}`);
console.log(
  `[TEST] Photo: ${testPhotoUrl.substring(0, 60)}...`
);

// ─── WRITE FINGERPRINT TO USER ───────────────────────────────────────────
const { error: fpErr } = await admin
  .from("users")
  .update({
    style_fingerprint: { dimensions: fingerprint },
    style_blend: styleBlend,
  })
  .eq("id", testUserId);

if (fpErr) {
  console.error("[ERROR] Could not write fingerprint:", fpErr.message);
  process.exit(1);
}
console.log("[TEST] Fingerprint written to user");

// ─── CREATE TEST ROOM ────────────────────────────────────────────────────
const keepObjects = [];
const removeObjects = [];

const typicalRoomItems = [
  { label: "sofa", is_fixed: false },
  { label: "coffee table", is_fixed: false },
  { label: "area rug", is_fixed: false },
  { label: "floor lamp", is_fixed: false },
  { label: "accent chair", is_fixed: false },
];

for (const item of typicalRoomItems) {
  if (["sofa", "coffee table"].includes(item.label)) {
    keepObjects.push({
      ...item,
      keep: true,
      immovable: false,
      dominant_color: "warm neutral",
      material: "fabric/wood",
      size_in_room: "large",
      style_descriptors: ["neutral", "versatile"],
    });
  } else {
    removeObjects.push({ ...item, keep: false, immovable: false });
  }
}

const renderContext = {
  roomType: testRoomType,
  primaryFunction: [testRoomType.replace("_", " ")],
  ceilingDetail: { heightFt: 9, label: "Standard 9ft" },
  physicalConstraints: {
    floorMaterial: "Hardwood",
    keepExistingFlooring: true,
    brightestTime: fingerprint.lightPreference > 0.7 ? "Morning" : "Afternoon",
    windowCount: fingerprint.lightPreference > 0.7 ? 3 : 2,
    protectedAreas: [],
    fixtures: [],
  },
  specialNotes: prefs.notes,
  keepMask: {
    objects: [...keepObjects, ...removeObjects],
  },
  budget: { rangeMin: 2000, rangeMax: 8000, tier: "mid" },
  sensoryProfile: prefs.sensoryProfile,
  identityBrief: {
    moodKeywords: prefs.sensoryProfile.moodKeywords,
    styleDescription: styleBlend.primaryStyle,
  },
  artBrief:
    fingerprint.pattern > 0.5
      ? "Eclectic gallery wall with mixed art — prints, woven pieces, organic shapes"
      : "Simple framed art",
  techSpec: {},
  requestedProducts: [],
  styleFingerprint: fingerprint,
  styleBlend: styleBlend,
};

const { data: newRoom, error: roomErr } = await admin
  .from("rooms")
  .insert({
    user_id: testUserId,
    room_type: testRoomType,
    original_photo_url: testPhotoUrl,
    original_image_url: testPhotoUrl,
    redesign_status: "pending",
    render_context: renderContext,
  })
  .select("id")
  .single();

if (roomErr || !newRoom) {
  console.error("[ERROR] Could not create test room:", roomErr?.message);
  process.exit(1);
}

const testRoomId = newRoom.id;
console.log(`[TEST] Test room created: ${testRoomId}`);

// ─── FIRE THE REDESIGN PIPELINE ──────────────────────────────────────────
console.log(`\n[TEST] Firing redesign pipeline via test-pipeline route...`);
const res = await fetch(`${APP_URL}/api/test-pipeline`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-supabase-service-role": SUPABASE_SERVICE_KEY,
  },
  body: JSON.stringify({ room_id: testRoomId }),
});

if (!res.ok) {
  const text = await res.text();
  console.error(
    `[ERROR] Redesign API returned ${res.status}: ${text.substring(0, 200)}`
  );
  await admin.from("rooms").delete().eq("id", testRoomId);
  process.exit(1);
}

console.log(`[TEST] Pipeline fired (${res.status}) — polling for completion...`);

// ─── POLL FOR COMPLETION ─────────────────────────────────────────────────
const startTime = Date.now();
const timeoutMs = 5 * 60 * 1000;
let renderUrl = null;
let pollCount = 0;

while (Date.now() - startTime < timeoutMs) {
  await new Promise((r) => setTimeout(r, 6000));
  pollCount++;

  const { data: room } = await admin
    .from("rooms")
    .select("redesign_status, redesign_pano_url")
    .eq("id", testRoomId)
    .single();

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  process.stdout.write(
    `\r[TEST] Poll ${pollCount} (${elapsed}s): status=${room?.redesign_status || "unknown"}`
  );

  if (room?.redesign_status === "complete" && room?.redesign_pano_url) {
    renderUrl = room.redesign_pano_url;
    console.log(`\n[TEST] Render complete at ${elapsed}s`);
    break;
  }

  // Also check for kontext_complete (the redesign pipeline uses this status)
  if (
    (room?.redesign_status === "kontext_complete" ||
      room?.redesign_status === "renders_complete") &&
    room?.redesign_pano_url
  ) {
    renderUrl = room.redesign_pano_url;
    console.log(`\n[TEST] Render complete at ${elapsed}s (status: ${room.redesign_status})`);
    break;
  }

  if (room?.redesign_status === "failed") {
    console.log(`\n[ERROR] Pipeline failed`);
    await admin.from("rooms").delete().eq("id", testRoomId);
    process.exit(1);
  }
}

if (!renderUrl) {
  console.log(`\n[ERROR] Timeout — render did not complete in 5 minutes`);
  await admin.from("rooms").delete().eq("id", testRoomId);
  process.exit(1);
}

// ─── READ THE FLUX PROMPT FROM LOGS ──────────────────────────────────────
const logDir = path.join(__dirname, "../.dev-logs");
let fluxPrompt = null;
if (fs.existsSync(logDir)) {
  const logFiles = fs
    .readdirSync(logDir)
    .filter((f) => f.endsWith(".ndjson"))
    .sort()
    .reverse();

  for (const logFile of logFiles) {
    const lines = fs
      .readFileSync(path.join(logDir, logFile), "utf8")
      .split("\n");
    for (const line of lines.reverse()) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (
          entry.event === "RENDER_FLUX_PROMPT_BUILT" &&
          entry.data?.fullPrompt
        ) {
          fluxPrompt = entry.data.fullPrompt;
          break;
        }
      } catch {
        // skip malformed lines
      }
    }
    if (fluxPrompt) break;
  }
}

if (fluxPrompt) {
  console.log("\n[TEST] === FLUX PROMPT USED ===");
  console.log(fluxPrompt);
  console.log("[TEST] ===========================");
  console.log(`[TEST] Word count: ${fluxPrompt.split(/\s+/).length}`);
}

// ─── DOWNLOAD RENDER IMAGE ────────────────────────────────────────────────
console.log(
  `\n[TEST] Downloading render from: ${renderUrl.substring(0, 80)}...`
);
const imgRes = await fetch(renderUrl);
if (!imgRes.ok) {
  console.error(`[ERROR] Could not download render: ${imgRes.status}`);
  await admin.from("rooms").delete().eq("id", testRoomId);
  process.exit(1);
}

const imgBuf = await imgRes.arrayBuffer();
const renderPath = "/tmp/cova_render_output.png";
fs.writeFileSync(renderPath, Buffer.from(imgBuf));
console.log(`[TEST] Render saved to ${renderPath}`);

// ─── WRITE STATE FOR COMPARISON ──────────────────────────────────────────
fs.writeFileSync(
  "/tmp/cova_test_state.json",
  JSON.stringify({
    testRoomId,
    renderPath,
    renderUrl,
    thresholds,
    fluxPrompt: fluxPrompt || "",
  })
);

console.log(
  `\n[TEST] Ready for comparison. Run: python3 apps/web/scripts/compare-renders.py`
);
console.log(`[TEST] Room ID for cleanup: ${testRoomId}`);

/**
 * test-render-e2e.ts — End-to-end render pipeline test
 *
 * Tests the full pipeline without the app UI:
 *   sign in → create room → call render-room → poll get-render-status → verify completion
 *
 * Usage:
 *   npm run test:render
 *
 * Env vars (reads from ../.env.local):
 *   EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY
 *   TEST_USER_EMAIL, TEST_USER_PASSWORD (defaults to hellocova@gmail.com / TestCova2024!)
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Load env from apps/mobile/.env (primary) then .env.local (fallback) ─────
function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq);
    const val = trimmed.slice(eq + 1);
    if (!process.env[key]) process.env[key] = val;
  }
}
// Mobile .env has the active publishable key; .env.local has service role + secrets
loadEnvFile(path.resolve(__dirname, '..', 'apps', 'mobile', '.env'));
loadEnvFile(path.resolve(__dirname, '..', '.env.local'));

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TEST_EMAIL = process.env.TEST_USER_EMAIL || 'e2e-test@cova.ai';
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD || 'E2eTestCova2024!';

if (!SUPABASE_URL || !ANON_KEY) {
  console.error('❌ Missing SUPABASE_URL or ANON_KEY');
  process.exit(1);
}
if (!SERVICE_ROLE_KEY) {
  console.error('❌ Missing SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const startTime = Date.now();
function elapsed(): string {
  return `[${((Date.now() - startTime) / 1000).toFixed(1).padStart(6)}s]`;
}

function log(msg: string) {
  console.log(`${elapsed()}  ${msg}`);
}

async function supabaseFetch(endpoint: string, opts: RequestInit = {}): Promise<Response> {
  const url = endpoint.startsWith('http') ? endpoint : `${SUPABASE_URL}${endpoint}`;
  return fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'apikey': ANON_KEY,
      ...(opts.headers as Record<string, string> || {}),
    },
  });
}

// ── Generate a tiny 4x4 red JPEG ────────────────────────────────────────────
// Minimal valid JPEG so we don't need an external file. Depth Pro will get a
// tiny image but the pipeline still exercises all code paths.
function makeTestImageBase64(): string {
  // Use the wood floor texture if available, otherwise a minimal JPEG
  const texturePath = path.resolve(__dirname, '..', 'apps', 'mobile', 'assets', 'textures', 'floor', 'wood_floor_diff_1k.jpg');
  if (fs.existsSync(texturePath)) {
    const buf = fs.readFileSync(texturePath);
    log(`Using test image: wood_floor_diff_1k.jpg (${(buf.length / 1024).toFixed(0)}kb)`);
    return buf.toString('base64');
  }
  // Fallback: minimal valid JPEG (1x1 pixel, red)
  const minJpeg = Buffer.from(
    'ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707070909' +
    '0810100e0c0c0e191413101e1c201e1d1c1d1e2428342c24261e1e283a282e30313434341f' +
    '27393d38323c2e333432ffc0000b08000100010101001100ffc4001f0000010501010101010' +
    '10000000000000000020304050607080900ffda00080101000003fa0000ffd9',
    'hex',
  );
  log(`Using minimal test JPEG (${minJpeg.length} bytes)`);
  return minJpeg.toString('base64');
}

async function main() {
  log('🚀 Render pipeline E2E test starting');
  log(`   Supabase: ${SUPABASE_URL}`);
  log(`   User: ${TEST_EMAIL}`);

  // ── Step 1: Sign in (create test user via admin API if needed) ─────────
  log('Signing in...');
  let authRes = await supabaseFetch('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });

  if (!authRes.ok) {
    log('Test user not found, creating via admin API...');
    // Create user via admin endpoint (service role key)
    const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        email_confirm: true,
      }),
    });
    if (!createRes.ok) {
      const err = await createRes.text();
      log(`⚠️  Admin create user returned ${createRes.status}: ${err}`);
    } else {
      log('Test user created');
    }

    // Retry sign in
    authRes = await supabaseFetch('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    });
    if (!authRes.ok) {
      const err = await authRes.text();
      log(`❌ FAIL: Auth failed after user creation (${authRes.status}): ${err}`);
      process.exit(1);
    }
  }

  const authData = await authRes.json();
  const accessToken: string = authData.access_token;
  const userId: string = authData.user?.id;
  log(`Signed in as ${userId?.slice(0, 8)}...`);

  const authHeaders = {
    'Authorization': `Bearer ${accessToken}`,
    'apikey': ANON_KEY,
  };

  // Ensure users row exists (render-room checks token_balance)
  await fetch(`${SUPABASE_URL}/rest/v1/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify({
      id: userId,
      token_balance: 999,
      tokens_enabled: false,
    }),
  });

  // ── Step 2: Create test room ───────────────────────────────────────────
  log('Creating test room...');
  const roomRes = await supabaseFetch('/rest/v1/rooms', {
    method: 'POST',
    headers: { ...authHeaders, 'Prefer': 'return=representation' },
    body: JSON.stringify({
      user_id: userId,
      name: `E2E Test ${new Date().toISOString()}`,
      room_type: 'living_room',
      style_blend: { japandi: 0.6, minimalist: 0.4 },
      dimensions_json: { width: 4.9, depth: 4.3, height: 2.7, unit: 'm' },
      status: 'active',
    }),
  });

  if (!roomRes.ok) {
    const err = await roomRes.text();
    log(`❌ FAIL: Room creation failed (${roomRes.status}): ${err}`);
    process.exit(1);
  }

  const rooms = await roomRes.json();
  const room = Array.isArray(rooms) ? rooms[0] : rooms;
  const roomId: string = room.id;
  log(`Room created: ${roomId.slice(0, 8)}...`);

  // ── Step 3: Prepare test image ─────────────────────────────────────────
  const imageBase64 = makeTestImageBase64();
  log(`Image base64 length: ${(imageBase64.length / 1024).toFixed(0)}kb`);

  // ── Step 4: Call render-room ───────────────────────────────────────────
  log('Calling render-room edge function...');
  const renderRes = await supabaseFetch('/functions/v1/render-room', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      room_id: roomId,
      image_base64: imageBase64,
      style_blend: { japandi: 0.6, minimalist: 0.4 },
      room_type: 'living_room',
      render_type: 'draft',
    }),
  });

  const renderBody = await renderRes.text();
  if (!renderRes.ok) {
    log(`❌ FAIL: render-room returned ${renderRes.status}: ${renderBody}`);
    process.exit(1);
  }

  let renderData: { render_id: string; prediction_id: string; status: string };
  try {
    renderData = JSON.parse(renderBody);
  } catch {
    log(`❌ FAIL: render-room returned non-JSON: ${renderBody.slice(0, 200)}`);
    process.exit(1);
  }

  log(`✓ render-room returned: render_id=${renderData.render_id?.slice(0, 8)}... prediction_id=${renderData.prediction_id?.slice(0, 12)}...`);

  if (!renderData.render_id || !renderData.prediction_id) {
    log(`❌ FAIL: Missing render_id or prediction_id in response`);
    process.exit(1);
  }

  // ── Step 5: Poll get-render-status ─────────────────────────────────────
  const POLL_INTERVAL = 5000;
  const MAX_POLL_TIME = 120_000;
  const pollStart = Date.now();
  let lastStatus = 'processing';

  while (Date.now() - pollStart < MAX_POLL_TIME) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));

    const statusRes = await supabaseFetch('/functions/v1/get-render-status', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ render_id: renderData.render_id }),
    });

    if (!statusRes.ok) {
      log(`⚠️  get-render-status returned ${statusRes.status}`);
      continue;
    }

    const statusData = await statusRes.json() as {
      status: string;
      image_url?: string;
      error?: string;
    };
    lastStatus = statusData.status;

    if (statusData.status === 'completed' && statusData.image_url) {
      log(`✅ RENDER COMPLETE: ${statusData.image_url.slice(0, 80)}...`);
      log(`   Total time: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
      process.exit(0);
    }

    if (statusData.status === 'failed') {
      log(`❌ FAIL: ${statusData.error ?? 'Unknown error from Replicate'}`);
      process.exit(1);
    }

    log(`status: ${statusData.status}`);
  }

  log(`❌ TIMEOUT after 120s — last status: ${lastStatus}`);
  process.exit(1);
}

main().catch((err) => {
  log(`❌ UNHANDLED: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});

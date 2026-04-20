/**
 * Phase 2 — Autonomous Render Loop
 *
 * Fires webhook → polls for completion → downloads render → scores with Claude Haiku.
 * Tracks spend, logs progress, fixes systemic issues.
 *
 * Usage: node tests/e2e/render-loop.mjs
 * Run from repo root with apps/web/.env.local loaded.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');
const BUDGET_PATH = join(__dirname, 'budget.json');
const PROGRESS_PATH = join(__dirname, 'progress.log');
const ITERATIONS_DIR = join(__dirname, 'iterations');
const RENDERS_DIR = join(__dirname, 'renders');
const CHECKPOINTS_DIR = join(__dirname, 'checkpoints');

// Ensure directories
[ITERATIONS_DIR, RENDERS_DIR, CHECKPOINTS_DIR].forEach(d => {
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
});

// ─── Load env vars from apps/web/.env.local ─────────────────────────────────
const envPath = join(ROOT, 'apps/web/.env.local');
const envContent = readFileSync(envPath, 'utf8');
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx);
  const val = trimmed.slice(eqIdx + 1);
  if (!process.env[key]) process.env[key] = val;
}

// ─── Constants ──────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WEBHOOK_URL = process.env.REDESIGN_PIPELINE_WEBHOOK_URL;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const FAL_KEY = process.env.FAL_KEY;

const ROOM_A_USER_ID = '344b5705-61e3-4cc0-915d-b1f32bb99cd9';
const ROOM_A_PHOTO = 'https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/room-photos/344b5705-61e3-4cc0-915d-b1f32bb99cd9/1776152283994.jpg';

const BENCHMARK_DIR = join(ROOT, 'benchmarks/competitors/collovai');

const STYLES = [
  'COVASCANDINAV', 'COVAJAPANDI', 'COVABIOPHILIC', 'COVAMINIMAL',
  'COVAMIDCENTURY', 'COVACOASTAL', 'COVABOHEMIAN', 'COVAINDUSTRIAL',
  'COVAFARMHOUSE', 'COVAARTDECO',
];

const TRIGGER_MAP = {
  COVASCANDINAV: 'cvscn', COVAJAPANDI: 'cvwmn', COVABIOPHILIC: 'cvbio',
  COVAMINIMAL: 'cvscn', COVAMIDCENTURY: 'cvmcm', COVACOASTAL: 'cvcst',
  COVABOHEMIAN: 'cvboh', COVAINDUSTRIAL: 'cvind', COVAFARMHOUSE: 'cvfrm',
  COVAARTDECO: 'cvdco',
};

const PERSONALIZATION_CONTEXTS = [
  { smart_tech: { tv_accepted: true, tv_size: '55' } },
  { art: { layout: 'gallery_wall', quantity: 3 } },
  { lifestyle: { work_from_room: true, density: 'less_is_more' } },
  { required_object: { description: 'fiddle leaf fig' } },
  {},
];

// Budget limits (reset for round 2)
const BUDGET_LIMITS = { fal: 85, modal: 18 }; // Hard stops with buffer from $95/$22

// ─── Helpers ────────────────────────────────────────────────────────────────

function loadBudget() {
  return JSON.parse(readFileSync(BUDGET_PATH, 'utf8'));
}

function saveBudget(b) {
  b.last_updated = new Date().toISOString();
  writeFileSync(BUDGET_PATH, JSON.stringify(b, null, 2) + '\n');
}

function log(msg) {
  const ts = new Date().toISOString();
  const line = `${ts} | ${msg}`;
  console.log(line);
  appendFileSync(PROGRESS_PATH, line + '\n');
}

function checkBudget(budget) {
  if (budget.fal >= BUDGET_LIMITS.fal) {
    log(`HARD STOP: fal.ai budget exceeded ($${budget.fal}/$${BUDGET_LIMITS.fal})`);
    return false;
  }
  if (budget.modal >= BUDGET_LIMITS.modal) {
    log(`HARD STOP: Modal budget exceeded ($${budget.modal}/$${BUDGET_LIMITS.modal})`);
    return false;
  }
  return true;
}

async function supabaseQuery(path, method = 'GET', body = null) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const opts = {
    method,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': method === 'POST' ? 'return=representation' : undefined,
    },
  };
  if (body) opts.body = JSON.stringify(body);
  // Remove undefined headers
  Object.keys(opts.headers).forEach(k => opts.headers[k] === undefined && delete opts.headers[k]);
  const resp = await fetch(url, opts);
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Supabase ${method} ${path}: ${resp.status} — ${text}`);
  }
  return resp.json();
}

// ─── Supabase setup ─────────────────────────────────────────────────────────

async function uploadPranavPhoto() {
  const photoPath = join(ROOT, 'benchmarks/cova/baseline/pranav_bedroom.jpg');
  const photoData = readFileSync(photoPath);

  const storagePath = 'pranav_test/original.jpg';
  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/room-photos/${storagePath}`;

  // Try upload (upsert)
  const resp = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'image/jpeg',
      'x-upsert': 'true',
    },
    body: photoData,
  });

  if (!resp.ok) {
    const text = await resp.text();
    // If already exists, that's fine
    if (!text.includes('already exists') && !text.includes('Duplicate')) {
      log(`Upload warning: ${resp.status} — ${text}`);
    }
  }

  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/room-photos/${storagePath}`;
  log(`Pranav photo URL: ${publicUrl}`);
  return publicUrl;
}

async function getOrCreateTestRoom(userId, photoUrl, roomName) {
  // Check if test room already exists
  const existing = await supabaseQuery(
    `rooms?user_id=eq.${userId}&name=eq.${encodeURIComponent(roomName)}&select=id,original_photo_url&limit=1`
  );

  if (existing.length > 0) {
    log(`Found existing room: ${existing[0].id}`);
    return existing[0].id;
  }

  // Create new room
  const [created] = await supabaseQuery('rooms', 'POST', {
    user_id: userId,
    name: roomName,
    room_type: 'bedroom',
    original_photo_url: photoUrl,
    original_image_url: photoUrl,
    status: 'active',
    style_blend: { COVAJAPANDI: 0.5, COVABIOPHILIC: 0.3, COVAMINIMAL: 0.2 },
    budget: 2000,
    dimensions_json: { width_ft: 12, length_ft: 14, ceiling_height_ft: 9 },
  });

  log(`Created room: ${created.id}`);
  return created.id;
}

// ─── Pipeline: fire webhook + poll ──────────────────────────────────────────

const STYLE_PROMPTS = {
  COVASCANDINAV: 'cvscn interior, Scandinavian bedroom redesign, light oak platform bed centered, white linen duvet with cream knit throw, pale birchwood nightstand with ceramic table lamp, light gray wool area rug on hardwood floor, single dried floral arrangement in ceramic vase, natural afternoon light from large window, matte white walls, three materials: light birch, cream linen, brushed nickel, eye level wide-angle magazine photography, serene minimal calm generous negative space',
  COVAJAPANDI: 'cvwmn interior, Japandi bedroom redesign, low walnut platform bed with tatami headboard, undyed linen bedding with single indigo throw pillow, wabi-sabi ceramic table lamp on floating shelf nightstand, jute area rug on warm oak floor, single branch ikebana arrangement, warm golden hour light from paper-screened window, three materials: walnut, raw linen, matte black steel, eye level wide-angle magazine photography, restrained contemplative generous negative space',
  COVABIOPHILIC: 'cvbio interior, biophilic bedroom redesign, rattan bed frame with organic curves centered, sage green linen bedding with botanical print cushions, fiddle leaf fig plant in woven basket corner, monstera on floating shelf, trailing pothos on nightstand, reclaimed wood accent wall behind bed, cork flooring with jute rug, three materials: rattan, reclaimed teak, raw cotton, natural dappled light through sheer curtains, eye level wide-angle magazine photography, lush calm sanctuary feeling',
  COVAMINIMAL: 'cvscn interior, minimalist bedroom redesign, white upholstered platform bed centered low profile, pure white bedding with single gray cashmere throw, bare surfaces except single architectural object on nightstand, hidden storage integrated into walls, concrete accent wall, three materials: matte concrete, white cotton, brushed steel, clean bright even light, eye level wide-angle magazine photography, maximum five objects visible surfaces bare except hero piece',
  COVAMIDCENTURY: 'cvmcm interior, mid-century modern bedroom redesign, teak credenza as nightstand with tapered legs, Eames-inspired lounge chair in corner with ottoman, walnut slat headboard wall-mounted, mustard velvet accent pillow on neutral bedding, geometric mobile or Nelson clock on wall, three materials: oiled teak, bouclé fabric, brass, warm afternoon sidelight casting long shadows, eye level wide-angle magazine photography, clean organic curves one statement piece per zone',
  COVACOASTAL: 'cvcst interior, coastal bedroom redesign, whitewashed wood bed frame centered, crisp white linen bedding with blue stripe throw, woven seagrass nightstand, driftwood table lamp, sheer white curtains billowing, blue and white ceramic vase with dried pampas grass, three materials: whitewashed oak, natural linen, blue-glazed ceramic, bright airy natural light flooding in, eye level wide-angle magazine photography, open breezy relaxed feeling',
  COVABOHEMIAN: 'cvboh interior, bohemian bedroom redesign, carved wooden bed frame with macrame canopy, layered textiles kilim pillows and vintage quilt, rattan peacock chair in corner, gallery wall of woven baskets and mirrors, brass lantern pendant, floor cushions and poufs, three materials: carved mango wood, kilim wool, hammered brass, warm golden candlelit atmosphere mixed with natural light, eye level wide-angle magazine photography, layered intentional eclectic warmth',
  COVAINDUSTRIAL: 'cvind interior, industrial bedroom redesign, black steel pipe bed frame centered, charcoal linen bedding with leather throw, Edison bulb pendant on exposed wire, reclaimed wood floating shelf nightstand, concrete accent wall, vintage metal locker as wardrobe, three materials: raw steel, reclaimed pine, aged leather, dramatic directional spotlight with warm glow, eye level wide-angle magazine photography, raw materials exposed structure intentional sparseness',
  COVAFARMHOUSE: 'cvfrm interior, farmhouse bedroom redesign, white shiplap headboard wall, antique brass bed frame with white cotton bedding, distressed wood nightstand with mason jar lamp, woven basket under bench at foot of bed, fresh eucalyptus in galvanized pitcher, three materials: reclaimed barnwood, white cotton, wrought iron, warm morning light through plantation shutters, eye level wide-angle magazine photography, rustic warmth practical comfort curated not cluttered',
  COVAARTDECO: 'cvdco interior, art deco bedroom redesign, velvet upholstered bed with fluted channel headboard in emerald green, geometric gold mirror above nightstand, lacquered black side tables with brass inlay, sunburst wall sconce, marble-topped vanity, three materials: lacquered walnut, emerald velvet, polished brass, dramatic ambient lighting with warm pools of light, eye level wide-angle magazine photography, strict bilateral symmetry one hero surface per zone',
};

function buildPrompt(primaryStyle, secondaryStyle, primaryWeight, personalization) {
  let prompt = STYLE_PROMPTS[primaryStyle] || STYLE_PROMPTS.COVAJAPANDI;
  // Ensure bedroom is always mentioned prominently for Fill Pro
  if (!prompt.toLowerCase().includes('bedroom')) {
    prompt = prompt.replace('interior,', 'interior, bedroom redesign,');
  }

  if (personalization?.required_object?.description) {
    prompt += `, ${personalization.required_object.description} placed naturally in the room`;
  }
  if (personalization?.art?.layout === 'gallery_wall') {
    prompt += `, gallery wall of framed prints on main wall`;
  }
  if (personalization?.lifestyle?.work_from_room) {
    prompt += `, small desk workspace integrated into corner`;
  }

  return prompt;
}

async function fireWebhook(roomId, userId, prompt, imageUrl, seed, loras, removeCount, wallChange, floorChange, roomType) {
  if (!roomType || roomType === 'room') {
    log(`  WARNING: room_type is '${roomType}' — Fill Pro may generate wrong furniture type`);
  }
  const payload = {
    room_id: roomId,
    user_id: userId,
    compiled_prompt: prompt,
    image_url: imageUrl,
    seed,
    unsplash_references: [],
    remove_count: removeCount,
    loras_json: JSON.stringify(loras),
    wall_change_requested: wallChange,
    floor_change_requested: floorChange,
    room_type: roomType || 'bedroom',
  };

  const resp = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Webhook failed: ${resp.status} — ${text}`);
  }

  return resp.json();
}

async function pollForCompletion(roomId, maxWaitMs = 600000) {
  const startTime = Date.now();
  const pollInterval = 15000; // 15 seconds

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const rooms = await supabaseQuery(
        `rooms?id=eq.${roomId}&select=redesign_status,redesign_pano_url,redesign_error,updated_at`
      );

      if (rooms.length === 0) {
        log(`  Poll: room ${roomId} not found`);
        return null;
      }

      const room = rooms[0];
      const status = room.redesign_status;

      if (status === 'complete' && room.redesign_pano_url) {
        return room.redesign_pano_url;
      }

      if (status === 'failed' || (status && status.includes('error'))) {
        log(`  Pipeline FAILED: ${room.redesign_error || status}`);
        return null;
      }

      log(`  Poll: status=${status}, elapsed=${Math.round((Date.now() - startTime) / 1000)}s`);
    } catch (e) {
      log(`  Poll error: ${e.message}`);
    }

    await new Promise(r => setTimeout(r, pollInterval));
  }

  log(`  Poll TIMEOUT after ${maxWaitMs / 1000}s`);
  return null;
}

async function downloadRender(url, outputPath) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);
  const buffer = Buffer.from(await resp.arrayBuffer());
  writeFileSync(outputPath, buffer);
  return buffer.length;
}

// ─── Scoring with Claude Haiku ──────────────────────────────────────────────

import { execSync } from 'child_process';
import { unlinkSync } from 'fs';

function resizeImageForClaude(imagePath, maxBytes = 3800000) {
  // Claude's base64 limit is 5MB. base64 inflates ~33%, so we target 3.8MB raw.
  const data = readFileSync(imagePath);
  if (data.length <= maxBytes) return data;

  try {
    const tmpPath = imagePath + '.resized.jpg';
    // Reduce to 2048px max dimension using macOS sips
    execSync(`sips --resampleWidth 2048 "${imagePath}" --out "${tmpPath}" 2>/dev/null`, { timeout: 10000 });
    const resized = readFileSync(tmpPath);
    try { unlinkSync(tmpPath); } catch {}
    if (resized.length <= maxBytes) return resized;
    // Still too big, try 1536px
    execSync(`sips --resampleWidth 1536 "${imagePath}" --out "${tmpPath}" 2>/dev/null`, { timeout: 10000 });
    const smaller = readFileSync(tmpPath);
    try { unlinkSync(tmpPath); } catch {}
    return smaller;
  } catch (e) {
    console.error(`Resize failed: ${e.message}`);
    return data;
  }
}

async function scoreRender(renderPath, benchmarkPath, originalPhotoUrl, iterNum, style) {
  const renderData = resizeImageForClaude(renderPath);
  const renderB64 = renderData.toString('base64');

  let benchmarkB64 = null;
  if (benchmarkPath && existsSync(benchmarkPath)) {
    const bmData = resizeImageForClaude(benchmarkPath);
    benchmarkB64 = bmData.toString('base64');
  }

  // Download and resize original room photo for architecture comparison
  let originalB64 = null;
  if (originalPhotoUrl) {
    try {
      const origResp = await fetch(originalPhotoUrl);
      if (origResp.ok) {
        const origBuf = Buffer.from(await origResp.arrayBuffer());
        const origTmp = renderPath + '.orig.jpg';
        writeFileSync(origTmp, origBuf);
        const origResized = resizeImageForClaude(origTmp);
        originalB64 = origResized.toString('base64');
        try { unlinkSync(origTmp); } catch {}
      }
    } catch (e) {
      log(`  Could not fetch original photo: ${e.message}`);
    }
  }

  const imageContent = [
    {
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: renderB64 },
    },
    ...(benchmarkB64 ? [{
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: benchmarkB64 },
    }] : []),
    ...(originalB64 ? [{
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: originalB64 },
    }] : []),
  ];

  const messages = [{
    role: 'user',
    content: [
      ...imageContent,
      {
        type: 'text',
        text: `You are scoring a Cova AI interior design render against a CollovAI competitor render OF THE SAME PHYSICAL ROOM.

IMAGE 1: Cova render (iteration ${iterNum}, style: ${style})
${benchmarkB64 ? 'IMAGE 2: CollovAI benchmark render OF THE SAME ROOM' : ''}
${originalB64 ? `IMAGE ${benchmarkB64 ? '3' : '2'}: Original unedited room photo` : ''}

CRITICAL CONTEXT: Both the Cova render and the CollovAI benchmark show the SAME bedroom from the SAME angle. The architecture is identical — same walls, same ceiling fan, same window, same DAKSH wall letters, same corner layout. Only the FURNITURE differs between them. Both are AI redesigns of the same source photo.

Your job is to score whether Cova's redesigned furniture, styling, and overall quality is better than CollovAI's, assuming both started from the same room.

DO NOT penalize Cova for "different room" — it IS the same room with different furniture. Compare architecture preservation against the ORIGINAL photo${originalB64 ? ' (Image ' + (benchmarkB64 ? '3' : '2') + ')' : ''}, not against CollovAI.

Score on 10 dimensions (0-10 each, total 100):
1. ARCH_FIDELITY: Does Cova preserve walls/ceiling/fan/window/DAKSH letters from the original? If yes, score 9-10.
2. FURNITURE_QUALITY: Is Cova's furniture more realistic than CollovAI's? (Materials, shadows, scale, contact with floor)
3. COMPOSITION: Is Cova's layout better? (Bed placement, nightstand, rug, balance, rule of thirds)
4. STYLE_COHERENCE: Does Cova express the ${style} style more consistently than CollovAI?
5. DETAIL: Is Cova sharper, fewer AI artifacts than CollovAI?
6. LIGHTING: Is Cova's lighting more believable than CollovAI's?
7. COLOR: Is Cova's color palette better than CollovAI's?
8. EDITORIAL: Is Cova more magazine/editorial quality than CollovAI?
9. ROOM_FIT: Is Cova's furniture better scaled and positioned for this specific room?
10. BETTER_OVERALL: If showing one render to a client, would you pick Cova over CollovAI?

For each dimension scoring < 8, provide root cause: mask|prompt|lora|postprocess|composite|lighting

Output JSON ONLY (no markdown, no explanation):
{"scores":{"ARCH_FIDELITY":N,"FURNITURE_QUALITY":N,"COMPOSITION":N,"STYLE_COHERENCE":N,"DETAIL":N,"LIGHTING":N,"COLOR":N,"EDITORIAL":N,"ROOM_FIT":N,"BETTER_OVERALL":N},"total":N,"pass":bool,"issues":[{"dimension":"str","symptom":"str","root_cause":"mask|prompt|lora|postprocess|composite|lighting","severity":"critical|major|minor"}],"winner_subjective":"cova|benchmark|tie"}`,
      },
    ],
  }];

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Claude scoring failed: ${resp.status} — ${errText}`);
  }

  const result = await resp.json();
  const text = result.content?.[0]?.text ?? '';

  // Parse JSON from response
  try {
    // Try direct parse
    const parsed = JSON.parse(text);
    return parsed;
  } catch {
    // Try extracting JSON from markdown
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    log(`  Score parse failed. Raw: ${text.slice(0, 200)}`);
    return { scores: {}, total: 0, pass: false, issues: [], winner_subjective: 'benchmark' };
  }
}

// ─── Reset room status before each render ───────────────────────────────────

async function resetRoomForRender(roomId) {
  const url = `${SUPABASE_URL}/rest/v1/rooms?id=eq.${roomId}`;
  await fetch(url, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({
      redesign_status: 'pending',
      redesign_pano_url: null,
      redesign_error: null,
    }),
  });
}

// ─── Estimate costs ─────────────────────────────────────────────────────────
// Per the spec: ~$1.10 per redesign, ~$0.15 matching, ~$0.40 reconstruction
// Redesign is mostly fal.ai ($0.80-1.00) + Modal ($0.10-0.20)
const ESTIMATED_FAL_PER_RENDER = 0.90;
const ESTIMATED_MODAL_PER_RENDER = 0.15;
const ESTIMATED_ANTHROPIC_PER_SCORE = 0.003; // Haiku is very cheap

// ─── Main render loop ───────────────────────────────────────────────────────

async function main() {
  log('=== Phase 2: Render Quality Iteration ===');

  // Verify connectivity
  if (!WEBHOOK_URL) { log('FATAL: REDESIGN_PIPELINE_WEBHOOK_URL not set'); return; }
  if (!ANTHROPIC_KEY) { log('FATAL: ANTHROPIC_API_KEY not set'); return; }
  if (!SUPABASE_URL || !SUPABASE_KEY) { log('FATAL: Supabase credentials not set'); return; }

  log(`Webhook: ${WEBHOOK_URL}`);
  log(`Supabase: ${SUPABASE_URL}`);

  // Setup: Upload Pranav photo and create test room
  let pranavPhotoUrl;
  try {
    pranavPhotoUrl = await uploadPranavPhoto();
  } catch (e) {
    log(`Upload failed (may already exist): ${e.message}`);
    pranavPhotoUrl = `${SUPABASE_URL}/storage/v1/object/public/room-photos/pranav_test/original.jpg`;
  }

  // Room A: Daksh's bedroom — use the specific known room (cb2e7047)
  // Query by name "My Room" and photo URL to find the original, not the test room
  let roomAId = 'cb2e7047-c7ae-4253-bf2b-cc42a6f3a727';
  let roomAPhotoUrl = ROOM_A_PHOTO;
  let roomARoomType = 'bedroom';
  try {
    const roomAData = await supabaseQuery(
      `rooms?id=eq.${roomAId}&select=id,original_photo_url,room_type`
    );
    if (roomAData.length > 0) {
      if (roomAData[0].original_photo_url) roomAPhotoUrl = roomAData[0].original_photo_url;
      if (roomAData[0].room_type) roomARoomType = roomAData[0].room_type;
    }
  } catch (e) {
    log(`Room A lookup failed: ${e.message}, using default photo URL`);
  }
  log(`Room A (Daksh): ${roomAId} type=${roomARoomType} photo=${roomAPhotoUrl.slice(0, 80)}...`);

  // Room B: Pranav's bedroom — check if upload succeeded, otherwise use Room A for both
  let roomBId, roomBPhotoUrl;
  // Verify Pranav photo is accessible
  try {
    const headResp = await fetch(pranavPhotoUrl, { method: 'HEAD' });
    if (headResp.ok) {
      roomBId = await getOrCreateTestRoom(ROOM_A_USER_ID, pranavPhotoUrl, 'Audit Room B - Pranav');
      roomBPhotoUrl = pranavPhotoUrl;
      log(`Room B (Pranav): ${roomBId}`);
    } else {
      // Upload failed, use Room A photo for both rooms
      log(`Pranav photo not accessible (${headResp.status}), using Room A photo for both rooms`);
      roomBId = await getOrCreateTestRoom(ROOM_A_USER_ID, roomAPhotoUrl, 'Audit Room B - Fallback');
      roomBPhotoUrl = roomAPhotoUrl;
    }
  } catch (e) {
    log(`Pranav photo check failed: ${e.message}, using Room A photo for both rooms`);
    roomBId = await getOrCreateTestRoom(ROOM_A_USER_ID, roomAPhotoUrl, 'Audit Room B - Fallback');
    roomBPhotoUrl = roomAPhotoUrl;
  }

  // Fetch Room B room_type from DB
  let roomBRoomType = 'bedroom';
  try {
    const roomBData = await supabaseQuery(`rooms?id=eq.${roomBId}&select=room_type`);
    if (roomBData.length > 0 && roomBData[0].room_type) roomBRoomType = roomBData[0].room_type;
  } catch {}

  const rooms = [
    { id: roomAId, name: 'Room_A', photoUrl: roomAPhotoUrl, benchmarkDir: BENCHMARK_DIR, roomType: roomARoomType },
    { id: roomBId, name: 'Room_B', photoUrl: roomBPhotoUrl, benchmarkDir: null, roomType: roomBRoomType },
  ];

  let budget = loadBudget();
  let consecutivePasses = 0;
  let totalRenders = 0;
  let totalPasses = 0;
  const issueTracker = {}; // root_cause -> consecutive count

  // LoRA stack (fallback — will use the ones from DB when available)
  const defaultLoras = [
    { url: 'https://huggingface.co/Shakker-Labs/FLUX.1-dev-LoRA-add-details/resolve/main/FLUX-dev-lora-add_details.safetensors', scale: 0.55, name: 'detail-enhancer' },
    { url: 'https://huggingface.co/XLabs-AI/flux-RealismLora/resolve/main/lora.safetensors', scale: 0.25, name: 'realism-lora' },
  ];

  // Re-score existing renders with corrected scoring prompt
  const rescore = [
    { path: 'Room_A_iter_20.jpg', style: 'COVASCANDINAV', iter: 20, room: rooms[0] },
    { path: 'Room_B_iter_21.jpg', style: 'COVAJAPANDI', iter: 21, room: rooms[1] },
    { path: 'Room_A_iter_22.jpg', style: 'COVABIOPHILIC', iter: 22, room: rooms[0] },
    { path: 'Room_B_iter_25.jpg', style: 'COVACOASTAL', iter: 25, room: rooms[1] },
    { path: 'Room_A_iter_26.jpg', style: 'COVABOHEMIAN', iter: 26, room: rooms[0] },
  ];
  for (const rs of rescore) {
    const rPath = join(RENDERS_DIR, rs.path);
    if (!existsSync(rPath)) continue;
    const bIdx = (rs.iter % 4) + 1;
    const bPath = rs.room.benchmarkDir ? join(rs.room.benchmarkDir, `collov_${bIdx}.png`) : '';
    try {
      log(`RE-SCORING ${rs.path} with corrected prompt`);
      const sc = await scoreRender(rPath, bPath, rs.room.photoUrl, rs.iter, rs.style);
      budget.anthropic_calls++;
      saveBudget(budget);
      const t = sc.total || 0;
      log(`  RE-SCORE: ${t}/100 ${t >= 88 ? '✓ PASS' : '✗ FAIL'}`);
      if (sc.scores) {
        log(`  Dims: ${Object.entries(sc.scores).map(([k,v]) => `${k.slice(0,4)}=${v}`).join(' ')}`);
      }
      if (sc.winner_subjective) log(`  Winner: ${sc.winner_subjective}`);
    } catch (e) { log(`  Re-score error: ${e.message}`); }
  }
  log('=== Re-scoring complete. Starting new iterations ===');

  for (let iter = 28; iter < 100; iter++) {
    // Budget check
    budget = loadBudget();
    if (!checkBudget(budget)) break;

    // Check projected spend
    const projectedFal = budget.fal + ESTIMATED_FAL_PER_RENDER;
    const projectedModal = budget.modal + ESTIMATED_MODAL_PER_RENDER;
    if (projectedFal > BUDGET_LIMITS.fal || projectedModal > BUDGET_LIMITS.modal) {
      log(`PROJECTED OVERSPEND: fal=$${projectedFal.toFixed(2)}, modal=$${projectedModal.toFixed(2)} — stopping`);
      break;
    }

    // Exit condition
    if (consecutivePasses >= 20) {
      log(`SUCCESS: ${consecutivePasses} consecutive passes >= 88!`);
      break;
    }

    // Select room (alternate)
    const room = rooms[iter % 2];

    // Select styles
    const primaryIdx = iter % STYLES.length;
    const secondaryIdx = (iter + 3) % STYLES.length;
    const primaryStyle = STYLES[primaryIdx];
    const secondaryStyle = STYLES[secondaryIdx];
    const primaryWeight = 0.6 + (iter % 3) * 0.1; // 0.6, 0.7, 0.8

    // Rotate parameters
    const removeCounts = [0, 2, 5, 0, 2];
    const removeCount = removeCounts[iter % removeCounts.length];
    const wallChange = iter % 2 === 0;
    const floorChange = iter % 4 === 0;
    const personalization = PERSONALIZATION_CONTEXTS[iter % PERSONALIZATION_CONTEXTS.length];
    const seed = iter * 100;

    const prompt = buildPrompt(primaryStyle, secondaryStyle, primaryWeight, personalization);

    log(`\n── Iteration ${iter} | ${room.name} | ${primaryStyle} ${primaryWeight.toFixed(1)} + ${secondaryStyle} ──`);
    log(`  remove=${removeCount} wall=${wallChange} floor=${floorChange} seed=${seed}`);

    try {
      // Reset room status
      await resetRoomForRender(room.id);

      // Fire webhook
      const webhookResult = await fireWebhook(
        room.id, ROOM_A_USER_ID, prompt, room.photoUrl,
        seed, defaultLoras, removeCount, wallChange, floorChange, room.roomType
      );
      log(`  Webhook: ${JSON.stringify(webhookResult)}`);

      // Update budget (estimated)
      budget.fal += ESTIMATED_FAL_PER_RENDER;
      budget.modal += ESTIMATED_MODAL_PER_RENDER;
      budget.renders_completed++;
      saveBudget(budget);

      // Poll for completion
      const renderUrl = await pollForCompletion(room.id);

      if (!renderUrl) {
        log(`  RENDER FAILED — no URL returned`);
        consecutivePasses = 0;

        // Track issue
        issueTracker['pipeline_failure'] = (issueTracker['pipeline_failure'] || 0) + 1;

        // Save iteration data
        writeFileSync(
          join(ITERATIONS_DIR, `iter_${iter}.json`),
          JSON.stringify({ iter, room: room.name, style: primaryStyle, status: 'failed', renderUrl: null }, null, 2)
        );
        continue;
      }

      // Download render
      const renderPath = join(RENDERS_DIR, `${room.name.replace(' ', '_')}_iter_${iter}.jpg`);
      const fileSize = await downloadRender(renderUrl, renderPath);

      if (fileSize < 500 * 1024) {
        log(`  WARNING: Render file small (${(fileSize / 1024).toFixed(0)}KB) — may be error image`);
      } else {
        log(`  Downloaded: ${(fileSize / 1024 / 1024).toFixed(1)}MB`);
      }

      // Score with Claude Haiku
      const benchmarkPath = room.benchmarkDir
        ? join(room.benchmarkDir, `collov_${(iter % 4) + 1}.png`)
        : null;

      const score = await scoreRender(
        renderPath,
        benchmarkPath || '',
        room.photoUrl,
        iter,
        primaryStyle
      );

      budget.anthropic_calls++;
      saveBudget(budget);

      totalRenders++;
      const total = score.total || 0;
      const passed = total >= 88;

      if (passed) {
        totalPasses++;
        consecutivePasses++;
        log(`  SCORE: ${total}/100 ✓ PASS (consecutive: ${consecutivePasses})`);
      } else {
        consecutivePasses = 0;
        log(`  SCORE: ${total}/100 ✗ FAIL`);
      }

      // Log dimension scores
      if (score.scores) {
        const dims = Object.entries(score.scores)
          .map(([k, v]) => `${k.slice(0, 4)}=${v}`)
          .join(' ');
        log(`  Dims: ${dims}`);
      }

      // Track issues by root_cause
      if (score.issues && score.issues.length > 0) {
        for (const issue of score.issues) {
          const rc = issue.root_cause || 'unknown';
          issueTracker[rc] = (issueTracker[rc] || 0) + 1;
          if (issue.severity === 'critical') {
            log(`  CRITICAL: ${issue.dimension} — ${issue.symptom} (${rc})`);
          }
        }
      }

      // Winner
      if (score.winner_subjective) {
        log(`  Winner: ${score.winner_subjective}`);
      }

      // Save iteration data
      writeFileSync(
        join(ITERATIONS_DIR, `iter_${iter}.json`),
        JSON.stringify({
          iter, room: room.name, style: primaryStyle, secondaryStyle,
          primaryWeight, removeCount, wallChange, floorChange,
          seed, renderUrl, score, passed,
        }, null, 2)
      );

      // Every 5 renders: checkpoint
      if ((iter + 1) % 5 === 0) {
        const passRate = totalRenders > 0 ? (totalPasses / totalRenders * 100).toFixed(1) : '0';
        log(`\n── CHECKPOINT iter ${iter} | ${totalRenders} renders | ${passRate}% pass rate | consecutive=${consecutivePasses} ──`);
        log(`  Budget: fal=$${budget.fal.toFixed(2)}/$${BUDGET_LIMITS.fal} modal=$${budget.modal.toFixed(2)}/$${BUDGET_LIMITS.modal}`);
        log(`  Issue tracker: ${JSON.stringify(issueTracker)}`);

        writeFileSync(
          join(CHECKPOINTS_DIR, `after_iter_${iter}.json`),
          JSON.stringify({
            iter, totalRenders, totalPasses, consecutivePasses,
            passRate: parseFloat(passRate), budget, issueTracker,
          }, null, 2)
        );
      }

    } catch (err) {
      log(`  ERROR: ${err.message}`);
      consecutivePasses = 0;
    }
  }

  // Final summary
  budget = loadBudget();
  budget.phase = consecutivePasses >= 20 ? '2_complete' : '2_partial';
  budget.consecutive_passes = consecutivePasses;
  budget.renders_completed = totalRenders;
  budget.renders_passed = totalPasses;
  saveBudget(budget);

  log(`\n=== Phase 2 COMPLETE ===`);
  log(`Total renders: ${totalRenders}`);
  log(`Total passes: ${totalPasses} (${(totalPasses/Math.max(1,totalRenders)*100).toFixed(1)}%)`);
  log(`Consecutive passes: ${consecutivePasses}`);
  log(`Budget: fal=$${budget.fal.toFixed(2)} modal=$${budget.modal.toFixed(2)}`);
  log(`Result: ${consecutivePasses >= 20 ? 'PASSED' : 'DID NOT REACH 20 CONSECUTIVE'}`);
}

main().catch(e => {
  log(`FATAL: ${e.message}`);
  console.error(e);
  process.exit(1);
});

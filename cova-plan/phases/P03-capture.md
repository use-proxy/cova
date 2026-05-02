# Phase 3 — Capture

**Cova V1 implementation · Phase 3 of 12 · Self-contained**

---

## Phase identity

| | |
|---|---|
| **Phase number** | 3 of 12 |
| **Goal** | Take a single user-uploaded room photo. Validate it. EXIF-strip server-side. Classify hard-room difficulty. Route to personalization or hard-room interstitial. Output: clean, privacy-respecting `rooms` record ready for personalization. |
| **Executor session estimate** | 1–2 sessions |
| **Calendar estimate** | 1 week |
| **Predicted Claude credits** | ~$15–25 |
| **Predicted infra spend** | ~$1 (Haiku classifier test calls, fixture HEIC processing) |
| **Depends on** | Phase 1 closed (EXIF strip pipeline already wired in M3); Phase 2 closed (quiz produces `style_blend` for downstream pipeline) |
| **Blocks** | Phase 4 (personalization needs `rooms` record) |

---

## 1. The session loop for this phase

1. **Open new claude.ai chat.** Paste this entire phase doc.
2. **Chat summarizes back.** Confirms understanding, lists gaps. You confirm.
3. **Planner fires.** Fresh Claude Code session. Drift check: confirm Phase 1 EXIF pipeline at `apps/web/lib/capture/process.ts` exists (it was wired in Phase 1 M3 as a defensive shell). Confirm Phase 2 quiz routes operational. Use Context7 MCP for: current Sharp libheif HEIC support, current Anthropic Haiku 4.5 vision API, current Supabase signed PUT URL TTL options. Use EXA MCP for: image upload exploit patterns (SVG XSS, polyglots), magic-byte validation libs. Writes executor prompt to `cova-plan/planner-output/P3-executor-prompt.md`.
4. **Executor prompt returns.** Verify covers all M7 acceptance criteria.
5. **Executor fires.** 1–2 sessions.
6. **Verifier session 1 fires.** Reviews EXIF strip correctness via raw bucket-byte test, Haiku classifier output schema, signed URL TTL, magic-byte validation, rate limit middleware. Self-heals.
7. **Verifier session 2 fires.** Independent. Hunts for: HEIC iOS edge cases, classifier API down fallback, race condition between upload completion and classification.
8. **Manual screenshot review.** §15 click-script. ~12 screenshots + raw bucket-byte EXIF dump.
9. **Document updates.** `PHASE_STATUS.md`, `OPEN_DECISIONS.md`, `EMPIRICAL_FINDINGS.md` (classifier accuracy on real photos).

---

## 2. Prereq verification

### Phase 1 + 2 closure checks
- `PHASE_STATUS.md` shows P1 and P2 → CLOSED
- `apps/web/lib/capture/process.ts` exists from Phase 1 M3 (Sharp pipeline shell)
- `tests/exif/strip.test.ts` exists and passes (Phase 1 fixture test)
- `apps/web/lib/log/redact.ts`, `apps/web/lib/cost/log.ts`, `apps/web/lib/errors/categories.ts`, `apps/web/lib/config/timeouts.ts` all in place
- `users.style_blend` populated for test user (Phase 2 deliverable)
- `users.onboarding_state.quiz_complete = true` for test user
- Supabase `room-uploads` bucket exists with users-own-folder policies (Phase 1 M1 RLS consolidation)
- Sentry server runtime capturing
- PostHog client initialized

### Halt conditions
- Phase 1 EXIF pipeline shell missing → halt, escalate (Phase 1 incomplete)
- `room-uploads` bucket policies wrong → halt, fix in remediation
- Required MCPs not connected → halt

---

## 3. Pre-decisions

**G1. HEIC fixture acquisition.** Real iPhone photo with HEIC + GPS EXIF needed for fixture test. *Resolution:* Daksh provides one before Phase 3. Stored at `tests/fixtures/heic-iphone-with-gps.heic`. If not provided, planner generates synthetic HEIC via `imagemagick` with embedded GPS — less authentic but acceptable.

**G2. Hard-room threshold.** Spec says `score >= 0.5` triggers interstitial. *Resolution locked:* threshold 0.5. Tunable post-launch via feature flag `hard_room_threshold` if false-positive rate too high.

**G3. `hard_room_reason` jsonb format.** Either `["clutter", "lowlight"]` (string array) or `{"clutter": 0.7, "lowlight": 0.6}` (object with confidence). *Resolution locked:* string array of category codes. Confidence per code is OOS for V1 (operationally complex, low value to user).

**G4. People-in-photo handling.** Haiku classifier returns `contains_people: true|false`. *Resolution locked:* if true, show modal *"We noticed people in this photo. Cova will edit them out for privacy. Continue or choose another?"* Two CTAs: Continue / Choose another. Continue persists `contains_people: true` flag on `rooms` row; Phase 5 director adds clause "remove all people from final render."

**G5. Non-room rejection.** Haiku returns `is_room: false` if photo is meme/dog/non-interior. *Resolution locked:* reject pre-pipeline with friendly modal *"Looks like this isn't a room photo. Try uploading an interior space."* Single CTA: "Try again."

**G6. SVG rejection.** Magic-byte check rejects SVG (XSS vector). *Resolution locked:* return 415 Unsupported Media Type with copy *"That file format isn't supported. Try JPEG, PNG, or HEIC."*

**G7. Upload size cap.** *Resolution locked:* 20MB pre-resize. Vercel function 4.5MB body limit on Hobby tier handled by direct-to-Supabase signed PUT URL (bypasses Vercel function). Pro tier Phase 1 confirmed.

**G8. Mobile camera capture UX.** *Resolution locked:* `<input type="file" accept="image/*" capture="environment">` for native iOS/Android camera. Drag-and-drop on desktop. Browse-file fallback on both.

**G9. Rate limit.** *Resolution locked:* 20 uploads per hour per user via Cloudflare WAF rule (or middleware fallback if WAF rule not feasible).

**G10. Existing renders bucket retention.** Audit mentions ~200MB old V0 renders in `cova-renders` R2 bucket. *Resolution:* archive to cold storage (R2 lifecycle policy) or delete entirely. Planner decides based on whether V0 renders have any reference value (they do not — V1 is fresh start). **Delete.**

---

## 4. Background context (self-contained)

### 4.1 What capture delivers

After capture completes, Cova has:
- `rooms` row with: `user_id`, `original_url`, `processed_url`, `hard_room_score`, `hard_room_reason`, `contains_people`, `is_room`, `status='ready_for_personalization'`
- Original upload preserved at `room-uploads/{user_id}/{ts}-{rand}.{ext}`
- Processed image (EXIF-stripped, resized, JPEG q90) at `room-uploads/{user_id}/processed-{ts}.jpg`
- Classification result determines next route: `/onboarding/personalization/art` (clean) or `/onboarding/capture/hard-room` (flagged)

### 4.2 Privacy guarantees [D-009]

EXIF strip is mandatory per Hard Rule. Server-side via Sharp. Verified per CI test.
- All EXIF including GPS removed via `.withMetadata({})`
- Auto-rotation applied from EXIF orientation, then EXIF stripped (so image displays correctly without metadata)
- Original raw upload retained for 30 days then auto-deleted (lifecycle policy on `room-uploads` bucket)
- Processed image is what feeds the render pipeline — it has zero EXIF

### 4.3 Hard rules

- **D-001:** ONE photo per room. Not video, not multiple, not 360.
- **D-009:** Server-side EXIF strip. CI verified per upload.
- **D-002:** No catalog scraping (irrelevant to capture; reaffirmed)
- People detection: classifier flags; user confirms continue or choose another
- Non-room detection: classifier rejects; user retries
- SVG: magic-byte rejection (XSS vector)
- Image processing: Sharp (libvips), NOT ImageMagick (CVE history)

### 4.4 Capture flow

```
/onboarding/style-reveal Phase B → click Continue →
  /onboarding/capture/intro
    → click "Take or upload your photo"
  /onboarding/capture/upload
    → user picks file or takes photo
    → client validates: file size <20MB, type JPEG/PNG/HEIC
    → POST /api/capture/upload-url returns signed PUT URL
    → browser uploads directly to Supabase Storage
    → POST /api/capture/process triggered
      → server: Sharp pipeline (EXIF strip, resize, re-encode)
      → server: Haiku 4.5 classifier (is_room, contains_people, score, reasons)
      → server: insert rooms row
      → returns { roomId, classification }
  Branch:
    - hard_room_score < 0.5 AND is_room=true AND contains_people=false:
        → /onboarding/personalization/art (Phase 4)
    - is_room=false:
        → modal "Not a room photo" → /onboarding/capture/upload
    - contains_people=true:
        → modal "We'll edit them out" → continue or choose another
    - hard_room_score >= 0.5:
        → /onboarding/capture/hard-room interstitial
          → "Use this anyway" → personalization
          → "Take another photo" → /onboarding/capture/upload
```

---

## 5. Tech stack for this phase

| Layer | Tool | Notes |
|---|---|---|
| Image processing | Sharp (libvips) | EXIF strip via `.withMetadata({})`, HEIC via libheif |
| Hard-room classifier | Anthropic Haiku 4.5 vision | ~$0.001/call, ~1.5s p50 |
| Storage | Supabase `room-uploads` bucket | Signed PUT URL 1h TTL; lifecycle policy 30d archive |
| Direct upload | Browser → Supabase via signed URL | Bypasses Vercel 4.5MB function limit |
| Magic-byte validation | `file-type` npm lib | Server-side after upload |
| Rate limiting | Cloudflare WAF rule (preferred) or Upstash Redis middleware | 20 uploads/hr/user |
| Camera capture (mobile) | `<input type="file" accept="image/*" capture="environment">` | Native iOS/Android camera |
| Drop zone (desktop) | React Dropzone | Drag-and-drop UI |
| Realtime upload progress | Native `XMLHttpRequest` upload progress event | Or Supabase Realtime channel for processing status |

---

## 6. Scope

### 3A — Backend (M7)

1. **Schema migration:**
```sql
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS hard_room_score numeric(3,2);
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS hard_room_reason jsonb DEFAULT '[]'::jsonb;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS processed_url text;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS contains_people boolean DEFAULT false;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS is_room boolean DEFAULT true;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS original_url text;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending' CHECK (status IN ('pending','processing','ready_for_personalization','retaken','failed'));
```
   Paired down migration drops these columns.

2. **Sharp pipeline** at `apps/web/lib/capture/process.ts` (extends Phase 1 shell):
```typescript
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';
import { supabaseService } from '@/lib/supabase/service';
import { classifyRoomDifficulty } from './classify';
import { logCost } from '@/lib/cost/log';
import { redactLogPayload } from '@/lib/log/redact';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/heif'];
const MAX_FILE_SIZE = 20 * 1024 * 1024;

export async function processUploadedImage(
  bucketPath: string,
  userId: string
): Promise<ProcessedImageResult> {
  const startMs = Date.now();
  
  try {
    // 1. Download from Supabase room-uploads
    const { data: rawFile, error: dlErr } = await supabaseService.storage
      .from('room-uploads')
      .download(bucketPath);
    if (dlErr || !rawFile) throw new Error('bucket_download_fail');
    const buf = Buffer.from(await rawFile.arrayBuffer());
    
    // 2. Magic-byte validation (defense vs MIME spoofing + SVG XSS)
    const detected = await fileTypeFromBuffer(buf);
    if (!detected || !ACCEPTED_TYPES.includes(detected.mime)) {
      throw new Error(detected?.mime === 'image/svg+xml' ? 'svg_rejected' : 'unsupported_format');
    }
    
    // 3. Size check
    if (buf.byteLength > MAX_FILE_SIZE) throw new Error('image_too_large');
    
    // 4. Sharp pipeline
    const processed = await sharp(buf)
      .rotate()                                              // Auto-rotate from EXIF, then strip
      .resize(1536, 1536, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 90, mozjpeg: true })
      .withMetadata({})                                       // Strip ALL EXIF including GPS
      .toBuffer();
    
    // 5. Min-size check (post-resize)
    const meta = await sharp(processed).metadata();
    if ((meta.width ?? 0) < 500 || (meta.height ?? 0) < 500) {
      throw new Error('image_too_small');
    }
    
    // 6. Upload processed
    const processedPath = `${userId}/processed-${Date.now()}.jpg`;
    const { error: upErr } = await supabaseService.storage
      .from('room-uploads')
      .upload(processedPath, processed, { contentType: 'image/jpeg' });
    if (upErr) throw new Error('processed_upload_fail');
    
    // 7. Classify via Haiku 4.5
    const classification = await classifyRoomDifficulty(processed, userId);
    
    // 8. Reject non-room early
    if (!classification.is_room) throw new Error('not_a_room');
    
    // 9. Insert rooms
    const { data: room, error: insErr } = await supabaseService
      .from('rooms')
      .insert({
        user_id: userId,
        original_url: bucketPath,
        processed_url: processedPath,
        hard_room_score: classification.score,
        hard_room_reason: classification.reasons,
        contains_people: classification.contains_people,
        is_room: classification.is_room,
        status: 'ready_for_personalization',
      })
      .select()
      .single();
    if (insErr) throw new Error('rooms_insert_fail');
    
    return { roomId: room.id, classification };
  } catch (e: any) {
    const failureCategory = e.message || 'capture_process_unknown';
    await logCost({
      userId, category: 'hard_room_classify',
      costUsd: 0, model: 'sharp+haiku-4-5',
      durationMs: Date.now() - startMs,
      failureCategory,
    });
    throw e;
  }
}
```

3. **Haiku 4.5 classifier** at `apps/web/lib/capture/classify.ts`:
```typescript
import Anthropic from '@anthropic-ai/sdk';
import { TIMEOUTS } from '@/lib/config/timeouts';
import { logCost } from '@/lib/cost/log';

const HARD_ROOM_PROMPT = `You are evaluating an interior room photograph for an AI redesign service.

Classify:
1. is_room: true if interior room photo, false if meme/dog/non-room
2. contains_people: true if any people visible
3. score: 0.0-1.0 difficulty (0 = perfect, 1 = unrenderable)
4. reasons: array of red flag codes

Red flags:
- clutter (>40% floor occluded)
- mirror (reflections confuse spatial understanding)
- angle (extreme up/down/distorted perspective)
- lowlight (cannot see surfaces clearly)
- shadow (heavy shadow occlusion)
- multiroom (multiple rooms through doorways)
- people (in frame)
- distortion (fisheye, very wide angle)

Output JSON only, no preamble:
{"is_room": bool, "contains_people": bool, "score": number, "reasons": string[]}`;

export async function classifyRoomDifficulty(imageBuf: Buffer, userId: string) {
  const startMs = Date.now();
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    timeout: TIMEOUTS.haikuClassifier,  // 15s
  });
  
  try {
    const resp = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBuf.toString('base64') } },
          { type: 'text', text: HARD_ROOM_PROMPT },
        ],
      }],
    });
    
    const text = resp.content[0].type === 'text' ? resp.content[0].text : '';
    const parsed = JSON.parse(text);
    
    if (typeof parsed.is_room !== 'boolean') throw new Error('classifier_malformed_response');
    if (typeof parsed.score !== 'number' || parsed.score < 0 || parsed.score > 1) {
      throw new Error('classifier_invalid_score');
    }
    
    const costUsd = (resp.usage.input_tokens * 0.000001) + (resp.usage.output_tokens * 0.000005);
    await logCost({
      userId, category: 'hard_room_classify',
      costUsd, model: 'claude-haiku-4-5-20251001',
      durationMs: Date.now() - startMs,
    });
    
    return parsed;
  } catch (e: any) {
    await logCost({
      userId, category: 'hard_room_classify',
      costUsd: 0, model: 'claude-haiku-4-5-20251001',
      durationMs: Date.now() - startMs,
      failureCategory: e.message || 'classifier_unknown',
    });
    
    // Graceful degradation: classifier down → return safe defaults, proceed
    return { is_room: true, contains_people: false, score: 0, reasons: [] };
  }
}
```

4. **API routes:**

**POST /api/capture/upload-url**
```
Body: { fileName: string, contentType: string }
Validation: contentType in ACCEPTED_TYPES
Returns: { ok: true, signedUrl: string, bucketPath: string, expiresAt: ISO }
TTL: 1h
```

**POST /api/capture/process**
```
Body: { bucketPath: string }
Validation: bucketPath starts with `${user_id}/`
Triggers processUploadedImage()
Returns: { ok: true, roomId, classification: {is_room, contains_people, score, reasons} }
On is_room=false: returns { ok: false, failure_category: 'not_a_room', user_message: "Looks like this isn't a room photo." }
```

**POST /api/capture/retake**
```
Body: { roomId: string }
Validates: room belongs to user
Updates: rooms.status = 'retaken'
Returns: { ok: true }
Allows fresh upload to start
```

5. **Rate limiting:** 20 uploads/hr/user via middleware or WAF rule.

6. **Lifecycle policy on `room-uploads` bucket:** original raw uploads (`{user_id}/{ts}-{rand}.{ext}`) auto-delete after 30 days. Processed images (`{user_id}/processed-{ts}.jpg`) retained until user deletes account.

7. **Delete V0 renders from `cova-renders` R2 bucket** (G10).

### 3B — UI

#### Capture intro (/onboarding/capture/intro)

**Tool:** Frontend Visionary

**Layout:**
- Full-bleed navy
- Top: Cova logo gold left
- Headline EB Garamond Italic 48px ivory: *"One photo. That's all we need."*
- Subhead DM Sans 16px ivory 70%: *"We'll redesign it in your style."*
- 6-tile grid (3 GOOD + 3 BAD examples), 240×160 each, 16px gap, 2 rows on desktop / 3 cols × 2 rows on mobile
  - Top row labeled "DO" gold tracking 0.18em uppercase
    - Tile 1: Room from doorway/corner, daylight, full visibility
    - Tile 2: Living room with even lighting, no clutter
    - Tile 3: Bedroom with good angle, no people
  - Bottom row labeled "DON'T" warm-error tracking 0.18em uppercase
    - Tile 4: Mirror selfie / extreme close-up
    - Tile 5: Dark room / silhouette
    - Tile 6: Cluttered surface, partial view
- Below grid: bullet list (DM Sans 14px ivory 80%, no actual bullets, just line breaks):
  - "Stand in a doorway or corner."
  - "Get the whole room in frame."
  - "Daylight if possible."
- Single CTA gold pill: "Take or upload your photo →"
- Microcopy: *"We'll process and add personalization next."*

**Tile assets:** stored at `/public/capture-guide/{do,dont}-{1,2,3}.jpg`. WebP q88, ~80KB each.

**Behavior:**
- CTA → routes to /onboarding/capture/upload
- Guard: if `users.style_blend` not set, redirect to /onboarding/welcome
- Guard: if `users.onboarding_state.quiz_complete=false`, redirect to /onboarding/welcome

**Reduced motion:** static layout, no animations.

**Analytics:**
- capture_intro_viewed
- capture_intro_cta_clicked

#### Capture upload (/onboarding/capture/upload)

**Tool:** Frontend Visionary

**Layout:**
- Full-bleed navy
- Top: Cova logo gold left, "Step 2 of 3" tracking 0.18em uppercase ivory 60% right
- Headline EB Garamond Italic 36px ivory: *"Upload your room."*
- Drop zone: centered, 640×420 desktop / 90% width × 280 mobile
  - Dashed 2px gold border, ivory 5% bg
  - Centered content: gold camera icon (24px SVG) + DM Sans 16px ivory 80%: *"Drop a photo here or"* + secondary button "Browse files"
  - Hover: bg shifts to ivory 10%, border to 2.5px, slight scale 1.01
  - Drag-over: bg shifts to gold 10%, border to gold solid, "Drop now" caption replaces
- Mobile additionally: secondary button "Take photo" (uses `<input capture="environment">`)
- Below drop zone: caption *"JPEG, PNG, or HEIC. Up to 20MB."* DM Sans 13px ivory 50%
- After file selected: drop zone replaced with preview + filename + "Remove" link + "Continue →" gold pill primary
- During upload: progress bar 4px gold inside drop zone; caption *"Uploading… 67%"*
- After upload complete, before classify: spinner + caption *"Processing your room…"*
- Skip: not allowed (capture is required)

**Behavior:**
- File picked → client validates size + type → POST /api/capture/upload-url → upload via signed URL → POST /api/capture/process → wait for response
- Drag-over events: `e.preventDefault(); e.stopPropagation();` to prevent default browser file open
- Multiple files dropped: only first processed; warning toast "We use one photo at a time."
- Network drop during upload: signed URL has 1h TTL → user can retry → no partial state
- Processing failure: show error state with retry CTA + "Choose different photo"
- Successfully processed:
  - is_room=false → navigate to /onboarding/capture/upload with modal "Not a room photo. Try again."
  - contains_people=true → modal "We'll edit them out" → confirm or retake
  - hard_room_score >= 0.5 → navigate to /onboarding/capture/hard-room
  - else → navigate to /onboarding/personalization/art (Phase 4)

**Reduced motion:** drop zone hover effects disabled; spinner replaced by static "Processing…" text.

**Mobile UX:**
- Drop zone replaced by stacked CTAs: "Take photo" + "Choose from library"
- Camera capture uses `capture="environment"` (back camera) for room shots
- Image preview after capture, with "Retake" / "Use this" CTAs

**Edge cases:**
- iOS HEIC: server handles transparently (Sharp libheif). User sees same flow as JPEG.
- Image upload mid-rotation (iOS Safari quirk): EXIF strip via `.rotate()` before metadata strip handles it.
- Slow connection: progress bar shows real-time XHR upload progress.
- Browser file size limits: 20MB enforced client-side first.

**Analytics:**
- capture_upload_viewed
- capture_file_selected {file_size, file_type}
- capture_upload_started
- capture_upload_progress {pct} (sampled every 25%)
- capture_upload_completed {duration_ms}
- capture_processing_started
- capture_processing_completed {duration_ms, classification}
- capture_process_failed {failure_category}
- capture_not_a_room_modal_shown
- capture_people_modal_shown
- capture_hard_room_redirect

#### Hard-room interstitial (/onboarding/capture/hard-room)

**Tool:** Frontend Visionary

**Layout:**
- Full-bleed navy
- Top: Cova logo gold left
- Centered card 640px ivory bg, 4px radius, 32px padding
  - Headline EB Garamond Italic 28px navy: *"Heads up about this photo."*
  - User's photo preview, 480×320, 4px radius
  - Below photo: chip list of reasons, e.g.: `[Clutter]` `[Low light]` `[Mirror]` — gold-bg pills with navy text, DM Sans 13px medium tracking 0.05em uppercase
  - Subhead DM Sans 14px navy 70%: *"We'll do our best, but the result may not be perfect. Want to try a different photo?"*
  - Two CTAs side-by-side:
    - Ghost: "Take another photo" (returns to /onboarding/capture/upload)
    - Primary: "Use this anyway" gold pill (proceeds to /onboarding/personalization/art)

**Reason code → display label mapping:**
| Code | Label |
|---|---|
| clutter | Clutter |
| mirror | Mirror reflection |
| angle | Extreme angle |
| lowlight | Low light |
| shadow | Heavy shadow |
| multiroom | Multiple rooms in view |
| people | People in frame (but contains_people branch handles this separately) |
| distortion | Lens distortion |

**Reduced motion:** static layout.

**Analytics:**
- hard_room_interstitial_shown {score, reasons}
- hard_room_use_anyway
- hard_room_retake

#### Modals (rendered as components, not separate routes)

**Not-a-room modal:** centered card on dimmed backdrop. Headline *"That doesn't look like a room."* Subhead *"Try uploading a photo of an interior space — living room, bedroom, kitchen, etc."* Single CTA "Try again" → closes modal, returns to upload screen.

**People-in-photo modal:** centered card. Headline *"We noticed people in this photo."* Subhead *"Cova will edit them out for privacy in the redesign. Continue, or pick another?"* Two CTAs: "Choose another photo" (ghost) / "Continue" (gold pill).

### 3C — Integration + review

- Wire frontend to /api/capture/upload-url and /api/capture/process
- Direct upload flow tested with real iPhone HEIC photo
- Modals trigger correctly based on classification result
- Hard-room interstitial routes correctly
- Rate limit middleware confirmed working (21st upload in 1hr returns 429)
- EXIF strip CI test passes against fixture with known GPS
- HEIC variant of fixture test passes (separate fixture)
- Magic-byte validation rejects SVG with 415
- 30-day lifecycle policy on `room-uploads` bucket configured
- V0 `cova-renders` R2 bucket cleared

---

## 7. Out of scope

- Personalization (Phase 4)
- Render pipeline (Phase 5)
- Multiple photos per room — never V1
- Video / 360 — never V1
- iOS app changes — never V1
- Pre-existing renders restoration

---

## 8. Files touched

### Created
- `apps/web/app/onboarding/capture/intro/page.tsx`
- `apps/web/app/onboarding/capture/upload/page.tsx`
- `apps/web/app/onboarding/capture/hard-room/page.tsx`
- `apps/web/app/api/capture/upload-url/route.ts`
- `apps/web/app/api/capture/process/route.ts`
- `apps/web/app/api/capture/retake/route.ts`
- `apps/web/lib/capture/classify.ts`
- `apps/web/lib/capture/process.ts` (extends Phase 1 shell)
- `apps/web/lib/capture/file-validate.ts` (magic-byte + size)
- `apps/web/components/capture/DropZone.tsx`
- `apps/web/components/capture/ImagePreview.tsx`
- `apps/web/components/capture/UploadProgress.tsx`
- `apps/web/components/capture/NotARoomModal.tsx`
- `apps/web/components/capture/PeopleInPhotoModal.tsx`
- `apps/web/components/capture/HardRoomInterstitial.tsx`
- `public/capture-guide/do-1.jpg` … `do-3.jpg`
- `public/capture-guide/dont-1.jpg` … `dont-3.jpg`
- `tests/fixtures/heic-iphone-with-gps.heic`
- `tests/fixtures/svg-payload.svg`
- `tests/capture/sharp-pipeline.test.ts`
- `tests/capture/classifier.test.ts`
- `tests/capture/api-routes.test.ts`
- `tests/capture/exif-strip-heic.test.ts`
- `tests/capture/magic-byte-rejection.test.ts`

### Migrations
- `supabase/migrations/{ts}-rooms-capture-cols.sql` + `_down.sql`
- `supabase/migrations/{ts}-rooms-status-check.sql` + `_down.sql`

### Modified
- `apps/web/lib/analytics/events.ts` (add capture events)
- `apps/web/middleware.ts` (rate limit for upload routes)
- `apps/web/lib/errors/categories.ts` (add CaptureFailure union)

---

## 9. API contracts

### POST /api/capture/upload-url
```
Auth: required
Body: { fileName: string, contentType: 'image/jpeg' | 'image/png' | 'image/heic' | 'image/heif' }
Validation: contentType in whitelist, fileName length 1..200
Returns: { ok: true, signedUrl: string, bucketPath: string, expiresAt: ISO }
Side effects: signed PUT URL minted via Supabase service role
TTL: 1h
Rate limit: 20/hr/user (shared with /process)
```

### POST /api/capture/process
```
Auth: required
Body: { bucketPath: string }
Validation: bucketPath matches /^{user_id}\//, file exists in bucket
Returns: 
  { ok: true, roomId: string, classification: { is_room, contains_people, score, reasons } }
  | { ok: false, failure_category: 'not_a_room' | 'image_too_small' | 'image_too_large' | 'svg_rejected' | 'unsupported_format' | 'classifier_api_fail' | 'bucket_download_fail' | 'processed_upload_fail' | 'rooms_insert_fail', user_message }
Timeout: 60s (Vercel route)
Cost log: writes render_cost_log row with category 'hard_room_classify'
```

### POST /api/capture/retake
```
Auth: required
Body: { roomId: string }
Validation: room belongs to user
Returns: { ok: true }
Side effect: rooms.status = 'retaken'
```

---

## 10. Schema migrations (full DDL)

```sql
-- {ts}-rooms-capture-cols.sql
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS hard_room_score numeric(3,2);
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS hard_room_reason jsonb DEFAULT '[]'::jsonb;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS processed_url text;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS contains_people boolean DEFAULT false;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS is_room boolean DEFAULT true;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS original_url text;

-- {ts}-rooms-status-check.sql
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending';
-- Migrate existing rows
UPDATE rooms SET status='ready_for_personalization' WHERE status IS NULL AND processed_url IS NOT NULL;
UPDATE rooms SET status='pending' WHERE status IS NULL;
ALTER TABLE rooms ADD CONSTRAINT rooms_status_check CHECK (status IN ('pending','processing','ready_for_personalization','retaken','failed'));

-- Down: ALTER TABLE rooms DROP COLUMN ...; ALTER TABLE rooms DROP CONSTRAINT rooms_status_check;
```

### Storage bucket lifecycle policy

Configured via Supabase dashboard → Storage → `room-uploads` → Lifecycle:
- Path prefix `{user_id}/[0-9]+-` (raw uploads, not processed-) → delete after 30 days
- Path prefix `{user_id}/processed-` → retain until user deletes account

---

## 11. Failure handling

```typescript
export type CaptureFailure =
  | 'capture_upload_url_fail'
  | 'bucket_download_fail'
  | 'processed_upload_fail'
  | 'image_decode_fail'
  | 'image_too_small'
  | 'image_too_large'
  | 'svg_rejected'
  | 'unsupported_format'
  | 'classifier_api_fail'    // graceful degradation
  | 'classifier_malformed_response'
  | 'classifier_invalid_score'
  | 'not_a_room'
  | 'rooms_insert_fail'
  | 'capture_rate_limit';
```

| Category | Recovery |
|---|---|
| capture_upload_url_fail | Retry once; if still fails, show error toast |
| bucket_download_fail | Retry once after 2s; show error toast |
| image_decode_fail | Show "Couldn't read this photo. Try a different one." |
| image_too_small | Show "Photo is too small. Try one with more detail." |
| image_too_large | Show "Compress first or try a different photo." |
| svg_rejected | Show "That format isn't supported. Try JPEG, PNG, or HEIC." |
| classifier_api_fail | Graceful degradation: returns safe defaults, proceeds without hard-room flag |
| not_a_room | Modal "Not a room photo. Try again." |
| rooms_insert_fail | Sentry alert; user sees generic error + retry CTA |
| capture_rate_limit | "You've uploaded a lot today. Try again in [time]." |

---

## 12. Cost budget

| Source | Estimated cost |
|---|---|
| Claude credits | $15–25 |
| Haiku classifier test calls (~100) | <$0.10 |
| FLUX test renders (capture guide tiles, one-time) | ~$0.50 |
| **Total** | **~$15–26** |

---

## 13. Verifier focus areas

| Criterion | Verifier check |
|---|---|
| EXIF strip works on JPEG | `tests/exif/strip.test.ts` (Phase 1) still passes; raw bucket-byte check via `exiftool` confirms zero EXIF on processed file |
| EXIF strip works on HEIC | New `tests/capture/exif-strip-heic.test.ts` passes against iPhone fixture |
| SVG rejected | New `tests/capture/magic-byte-rejection.test.ts` passes |
| Magic-byte validation server-side | Verify `file-type` lib used in process.ts, not just MIME header trust |
| Sharp pipeline matches spec | `.rotate().resize(1536, 1536, {fit:inside, withoutEnlargement:true}).jpeg({quality:90, mozjpeg:true}).withMetadata({})` |
| Haiku classifier wired | `lib/capture/classify.ts` calls Haiku 4.5, parses JSON, validates schema |
| Cost telemetry | Each classifier call writes render_cost_log with category='hard_room_classify' |
| Graceful degradation | Mock Haiku 5xx → process completes with safe defaults, room.is_room=true, score=0 |
| Rate limit | 21st upload in 1hr returns 429 |
| Direct PUT URL | /api/capture/upload-url returns Supabase signed URL, NOT proxied through Vercel |
| 30-day lifecycle | Bucket policy configured for raw uploads |
| Hard-room threshold | score >= 0.5 routes to interstitial |
| People modal triggers | contains_people=true → modal shown |
| Non-room modal triggers | is_room=false → modal shown |
| All 14 failure_category enum values used | Each failure path has corresponding enum |
| failure_category populated on every error path | Verify via grep |

---

## 14. Adversarial code review checklist

- [ ] Sharp pipeline ALWAYS includes `.withMetadata({})` — never accidentally omitted
- [ ] `.rotate()` called BEFORE `.withMetadata({})` (so orientation applied before EXIF strip)
- [ ] Image upload path validates bucket path starts with `{user_id}/` (prevents User A uploading to User B's folder)
- [ ] Magic-byte check happens BEFORE Sharp processing (prevents Sharp processing malicious payloads)
- [ ] SVG rejection: any SVG returns 415, NOT 200 with empty result
- [ ] Sharp version pinned (no auto-bump in package.json)
- [ ] HEIC handling actually tested with real iPhone photo, not synthetic
- [ ] Min size check (500×500) happens AFTER resize (post-resize dimensions)
- [ ] Max size check (20MB) happens BEFORE Sharp (pre-decode, prevents DoS via 1GB image)
- [ ] Haiku classifier timeout from `lib/config/timeouts.ts`, not hardcoded
- [ ] Classifier JSON parse failure handled (malformed response)
- [ ] Classifier score validation: number, in [0, 1] range
- [ ] Classifier graceful degradation: API down returns safe defaults, NOT throws to user
- [ ] cost telemetry writes with failureCategory on classifier errors
- [ ] Signed PUT URL TTL = 1h, not longer
- [ ] Signed URL contains user_id in path so cross-user uploads impossible
- [ ] Rate limit middleware applied to /upload-url AND /process (combined budget)
- [ ] Rate limit returns 429 with Retry-After header
- [ ] Vercel function maxDuration = 60s for /process (not Phase 5's 290s)
- [ ] No console.log of imageBuf or rooms data (PII via redactLogPayload)
- [ ] Cleanup on partial failure: if classifier succeeds but rooms insert fails, processed file still in bucket → orphan; cron job to clean up orphans (post-V1)
- [ ] HEIC fixture test uses real iPhone EXIF + GPS, raw bytes verified
- [ ] Mobile camera capture: `capture="environment"` for back camera (room shots)
- [ ] iOS Safari orientation handled: Sharp `.rotate()` applies EXIF orientation correctly
- [ ] Drop zone: drag-over preventDefault to avoid browser default file-open
- [ ] Multiple files dropped: only first processed; warning shown
- [ ] Session timeout during long upload: signed URL still works (1h TTL); auth checked again on /process
- [ ] Lifecycle policy verified via Supabase dashboard, not just claimed in code

---

## 15. Manual click-script

Save screenshots to `cova-plan/manual-evidence/P3/`.

### Capture happy path (clean room)
1. Sign in test user with completed quiz (style_blend set)
2. Navigate to /onboarding/style-reveal Phase B → click Continue → /onboarding/capture/intro **[C1: intro.png]**
3. Click "Take or upload your photo →" → /onboarding/capture/upload **[C2: upload-empty.png]**
4. Drag and drop a clean room photo (e.g., living room, daylight, no clutter, no people, no mirror) → preview appears **[C3: preview.png]**
5. Watch upload progress bar → confirm reaches 100% → "Processing your room…" spinner **[C4: processing.png]**
6. After ~2-3s, redirects to /onboarding/personalization/art (Phase 4 not built yet — confirm URL bar shows correct route)

### EXIF strip verification
7. Locally inspect raw original upload: `exiftool` shows GPS, date, camera info
8. Locally inspect processed JPEG: `exiftool` shows zero EXIF tags **[C5: exiftool-original.png + C6: exiftool-processed.png]**

### HEIC iPhone path
9. From iPhone, take a fresh photo (HEIC by default, with location services on so GPS embeds)
10. AirDrop/save to Mac, then upload via /onboarding/capture/upload
11. Watch flow → confirm preview shows JPEG (not HEIC) → processing succeeds **[C7: heic-flow.png]**
12. Verify processed JPEG has zero EXIF (run exiftool on downloaded processed file)

### Hard-room flow
13. Upload a deliberately bad photo: very dark room OR cluttered desk OR mirror selfie
14. After processing, /onboarding/capture/hard-room loads **[C8: hard-room.png]**
15. Confirm reasons display as chips
16. Click "Take another photo" → returns to /onboarding/capture/upload
17. Re-upload same bad photo → /onboarding/capture/hard-room again
18. Click "Use this anyway" → routes to /onboarding/personalization/art

### Non-room rejection
19. Upload a meme image (e.g., dog photo, screenshot of text)
20. After processing, modal appears: "That doesn't look like a room." **[C9: not-a-room.png]**
21. Click "Try again" → modal closes, upload screen ready

### People-in-photo modal
22. Upload a room photo with a person in frame
23. Modal appears: "We noticed people in this photo. Cova will edit them out for privacy." **[C10: people-modal.png]**
24. Click "Continue" → routes forward; verify rooms row has contains_people=true via Supabase MCP

### File rejections
25. Try to upload an SVG file → toast/error "That format isn't supported." **[C11: svg-rejected.png]**
26. Try to upload a 25MB JPEG → client-side rejected before upload "Compress first or try a different photo." **[C12: too-large.png]**
27. Try to upload a 200×200 image (post-resize would be <500×500 if dims are off) → "Photo is too small."

### Rate limit
28. Upload 20 photos in rapid succession (or stub)
29. 21st attempt returns 429 with Retry-After

### Mobile native camera
30. iPhone Safari: open /onboarding/capture/upload → tap "Take photo" → native camera opens with back camera **[C13: mobile-capture.png]**
31. Take photo → preview shows → upload

### Reduced motion
32. Enable OS reduced motion → reload upload screen → drop zone hover effects disabled **[C14: reduced-motion.png]**

---

## 16. Manual evidence bundle

- 14+ screenshots from §15
- exiftool output before + after for original and processed (proves EXIF stripped)
- HEIC fixture exiftool output (proves HEIC handling correct)
- SQL screenshots from Supabase MCP showing rooms rows with correct hard_room_score, hard_room_reason, contains_people, is_room columns
- Sample rooms row jsonb from happy path
- INDEX.md linking each artifact to spec criterion

---

## 17. Remediation budget

- Round 1: Verifier session 1 self-heals
- Round 2: Verifier session 2 finds new issues → remediation prompt → fresh executor session
- Round 3 (escalation): write `cova-plan/escalations/P3.md`, halt

---

## 18. Closing checklist

- [ ] All screenshots in `cova-plan/manual-evidence/P3/`
- [ ] exiftool dumps captured (original + processed)
- [ ] INDEX.md written
- [ ] `PHASE_STATUS.md` Phase 3 → CLOSED
- [ ] `OPEN_DECISIONS.md` updated with: hard_room_threshold (0.5), reason-array-not-object, max upload size (20MB), HEIC supported, SVG rejected
- [ ] `EMPIRICAL_FINDINGS.md` updated with: classifier accuracy on N test photos (manual labeling vs Haiku output), classifier latency p50/p95, false-positive rate of hard-room flag, average upload time on 4G/wifi
- [ ] V0 `cova-renders` R2 bucket cleared
- [ ] Lifecycle policy confirmed in Supabase dashboard
- [ ] Phase 4 prereq section reviewed
- [ ] Verifier reports archived
- [ ] Session handoffs written

---

## 19. Rollback plan

- Revert merge commit on main → Vercel rolls back
- Run paired _down.sql:
  1. rooms-status-check down
  2. rooms-capture-cols down
- Reinstate Phase 1 EXIF pipeline shell (already committed in Phase 1)
- Bucket lifecycle policy: documented for manual revert in Supabase dashboard if needed

---

## 20. Feature flags introduced

| Flag key | Description | Default |
|---|---|---|
| `hard_room_threshold` | Score threshold to trigger interstitial | 0.5 |
| `capture_classifier_enabled` | Run Haiku classifier (false = bypass, all rooms is_room=true score=0) | true |
| `capture_people_modal_enabled` | Show people-in-photo modal | true |

---

## End of Phase 3 doc.

Next: Phase 4 (Personalization).

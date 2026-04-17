#!/usr/bin/env node
/**
 * Generate SAM masks for a room by calling the segmentation pipeline.
 *
 * Usage:
 *   node scripts/generate-masks-for-room.mjs <room_id>
 *
 * This calls the Next.js segment-masks API endpoint which in turn calls
 * the Modal segmentation pipeline. Results are written to rooms.render_context.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Load env
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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SEGMENTATION_URL = process.env.LAYERED_SEGMENTATION_URL;

const roomId = process.argv[2];
if (!roomId) {
  console.error('Usage: node scripts/generate-masks-for-room.mjs <room_id>');
  process.exit(1);
}

async function main() {
  console.log(`[masks] Generating masks for room: ${roomId}`);
  console.log(`[masks] Segmentation URL: ${SEGMENTATION_URL}`);

  // 1. Fetch room data
  const roomResp = await fetch(
    `${SUPABASE_URL}/rest/v1/rooms?id=eq.${roomId}&select=original_photo_url,pre_detection_result,render_context`,
    {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
    }
  );
  const rooms = await roomResp.json();
  if (!rooms.length) {
    console.error(`Room ${roomId} not found`);
    process.exit(1);
  }

  const room = rooms[0];
  const photoUrl = room.original_photo_url;
  const preDetection = room.pre_detection_result || [];
  const renderContext = room.render_context || {};

  console.log(`[masks] Photo: ${photoUrl?.slice(0, 80)}...`);
  console.log(`[masks] Pre-detection items: ${Array.isArray(preDetection) ? preDetection.length : 0}`);

  // 2. Build detected_items from pre_detection_result
  const detectedItems = (Array.isArray(preDetection) ? preDetection : []).map(item => ({
    label: item.label || item.name || 'unknown',
    category: item.category || 'furniture',
    estimated_bbox_pct: item.estimated_bbox_pct || item.bbox_pct || null,
    is_fixed: item.is_fixed || false,
    confidence: item.confidence || 0.8,
    size_in_room: item.size_in_room || null,
  }));

  if (!photoUrl) {
    console.error(`Room ${roomId} has no photo URL`);
    process.exit(1);
  }

  // 3. Call segmentation endpoint
  console.log(`[masks] Calling segmentation pipeline...`);
  const segResp = await fetch(SEGMENTATION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      room_id: roomId,
      photo_url: photoUrl,
      detected_items: detectedItems,
    }),
    signal: AbortSignal.timeout(300000), // 5 min timeout
  });

  if (!segResp.ok) {
    const text = await segResp.text();
    console.error(`Segmentation failed: ${segResp.status} — ${text}`);
    process.exit(1);
  }

  const segResult = await segResp.json();
  console.log(`[masks] Segmentation result keys: ${Object.keys(segResult).join(', ')}`);

  if (segResult.error) {
    console.error(`Segmentation error: ${segResult.error}`);
    process.exit(1);
  }

  // 4. Write results to render_context
  const updatedContext = {
    ...renderContext,
    archMaskUrl: segResult.arch_mask_url || segResult.archMaskUrl || null,
    depthMapUrl: segResult.depth_url || segResult.depthMapUrl || renderContext.depth_map_url || null,
    itemMasks: segResult.instance_masks || segResult.itemMasks || {},
    segmentation_complete: true,
  };

  // Also update depth_map_url if provided
  const updatePayload = {
    render_context: updatedContext,
  };

  if (segResult.depth_url) {
    updatePayload.depth_map_url = segResult.depth_url;
  }

  const updateResp = await fetch(
    `${SUPABASE_URL}/rest/v1/rooms?id=eq.${roomId}`,
    {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(updatePayload),
    }
  );

  if (!updateResp.ok) {
    const text = await updateResp.text();
    console.error(`DB update failed: ${updateResp.status} — ${text}`);
    process.exit(1);
  }

  console.log(`[masks] ✓ Masks saved to render_context`);
  console.log(`[masks]   archMaskUrl: ${updatedContext.archMaskUrl ? 'set' : 'none'}`);
  console.log(`[masks]   itemMasks: ${Object.keys(updatedContext.itemMasks).length} items`);
  console.log(`[masks]   depthMapUrl: ${updatedContext.depthMapUrl ? 'set' : 'none'}`);
}

main().catch(e => {
  console.error(`[masks] FATAL: ${e.message}`);
  process.exit(1);
});

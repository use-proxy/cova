/**
 * Sprint 10 — Tag and link GLB models in the products table.
 *
 * 1. Tags all 3D model products (retailer=polyhaven/sketchfab/poly_pizza)
 *    with style[], room_type[], category, and dimensions_m.
 * 2. Links each 3D model to the best matching purchasable product by
 *    category + style overlap.
 *
 * Run: npx ts-node scripts/sprint10-tag-models.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env
dotenv.config({ path: resolve(__dirname, '../.env.local') });
dotenv.config({ path: resolve(__dirname, '../apps/mobile/.env') });

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or key');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Keyword-based inference ──

const STYLE_KEYWORDS: Record<string, string[]> = {
  coastal: ['coastal', 'beach', 'ocean', 'nautical', 'wicker', 'rattan', 'driftwood', 'linen', 'light wood', 'bleach', 'white wash', 'sea', 'marine', 'tropical'],
  japandi: ['japandi', 'japanese', 'zen', 'bamboo', 'maple', 'ash', 'shoji', 'tatami', 'bonsai', 'minimal wood', 'simple', 'natural', 'pine', 'birch'],
  bohemian: ['bohemian', 'boho', 'macrame', 'kilim', 'moroccan', 'turkish', 'woven', 'fringe', 'tassel', 'jute', 'pattern', 'eclectic', 'colorful', 'handmade'],
  mid_century: ['mid century', 'midcentury', 'retro', 'vintage', 'eames', 'teak', 'walnut', 'rosewood', 'atomic', 'hairpin', 'tulip', '1960', '1950', 'danish'],
  minimalist: ['minimalist', 'minimal', 'modern', 'clean', 'sleek', 'glass', 'chrome', 'steel', 'concrete', 'monochrome', 'white', 'grey', 'black', 'simple'],
};

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  sofa: ['sofa', 'couch', 'loveseat', 'settee', 'sectional', 'futon', 'divan'],
  chair: ['chair', 'armchair', 'stool', 'seat', 'rocker', 'recliner', 'ottoman', 'pouf', 'bench'],
  table: ['table', 'desk', 'coffee table', 'side table', 'end table', 'console', 'dining table', 'nightstand', 'bedside'],
  bed: ['bed', 'mattress', 'headboard', 'bunk', 'crib', 'daybed'],
  desk: ['desk', 'workstation', 'writing table', 'computer desk', 'office desk'],
  lamp: ['lamp', 'light', 'chandelier', 'pendant', 'sconce', 'lantern', 'floor lamp', 'table lamp', 'ceiling light'],
  shelf: ['shelf', 'shelving', 'bookcase', 'bookshelf', 'rack', 'display', 'cabinet', 'cupboard', 'dresser', 'wardrobe', 'armoire', 'storage'],
  rug: ['rug', 'carpet', 'mat', 'runner'],
  plant: ['plant', 'pot', 'planter', 'vase', 'flower', 'fern', 'succulent', 'cactus', 'tree'],
  mirror: ['mirror', 'looking glass'],
  wardrobe: ['wardrobe', 'closet', 'armoire'],
};

const ROOM_TYPE_MAP: Record<string, string[]> = {
  sofa: ['living_room'],
  chair: ['living_room', 'bedroom', 'dining_room', 'home_office'],
  table: ['living_room', 'dining_room'],
  bed: ['bedroom'],
  desk: ['home_office', 'bedroom'],
  lamp: ['living_room', 'bedroom', 'home_office'],
  shelf: ['living_room', 'bedroom', 'home_office'],
  rug: ['living_room', 'bedroom'],
  plant: ['living_room', 'bedroom', 'home_office'],
  mirror: ['bedroom', 'bathroom'],
  wardrobe: ['bedroom'],
};

const DIMENSION_DEFAULTS: Record<string, { width: number; depth: number; height: number }> = {
  sofa: { width: 2.2, depth: 0.9, height: 0.85 },
  chair: { width: 0.7, depth: 0.7, height: 0.9 },
  table: { width: 1.2, depth: 0.8, height: 0.75 },
  bed: { width: 1.6, depth: 2.0, height: 0.5 },
  desk: { width: 1.4, depth: 0.7, height: 0.75 },
  lamp: { width: 0.4, depth: 0.4, height: 1.5 },
  shelf: { width: 1.0, depth: 0.3, height: 1.8 },
  rug: { width: 2.0, depth: 1.5, height: 0.02 },
  plant: { width: 0.5, depth: 0.5, height: 1.0 },
  mirror: { width: 0.8, depth: 0.1, height: 1.2 },
  wardrobe: { width: 1.8, depth: 0.6, height: 2.0 },
};

function inferStyles(name: string): string[] {
  const lower = name.toLowerCase();
  const styles: string[] = [];
  for (const [style, keywords] of Object.entries(STYLE_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      styles.push(style);
    }
  }
  // Default to minimalist if nothing matched
  if (styles.length === 0) styles.push('minimalist');
  return styles;
}

function inferCategory(name: string): string {
  const lower = name.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) return cat;
  }
  return 'decor'; // fallback
}

function buildStyleWeights(styles: string[]): Record<string, number> {
  const w: Record<string, number> = {
    coastal: 0.04, japandi: 0.04, bohemian: 0.04, mid_century: 0.04, minimalist: 0.04,
  };
  const mainWeight = 0.8 / styles.length;
  for (const s of styles) w[s] = mainWeight;
  // Normalize
  const sum = Object.values(w).reduce((a, v) => a + v, 0);
  for (const k of Object.keys(w)) w[k] = w[k] / sum;
  return w;
}

// ══════════════════════════════════════
// Main
// ══════════════════════════════════════

async function main() {
  console.log('Sprint 10 — Tag and link GLB models\n');

  // ── Step 1: Fetch all 3D model products ──
  const { data: models, error: fetchErr } = await supabase
    .from('products')
    .select('id, name, category, style_tags, room_types, dimensions_m, retailer')
    .in('retailer', ['polyhaven', 'sketchfab', 'poly_pizza']);

  if (fetchErr) { console.error('Fetch error:', fetchErr); return; }
  if (!models || models.length === 0) { console.log('No 3D models found.'); return; }
  console.log(`Found ${models.length} 3D model products\n`);

  // ── Step 2: Tag each model ──
  let tagCount = 0;
  for (const model of models) {
    const name = model.name ?? '';
    const category = inferCategory(name);
    const styles = inferStyles(name);
    const roomTypes = ROOM_TYPE_MAP[category] ?? ['living_room'];
    const dims = DIMENSION_DEFAULTS[category] ?? DIMENSION_DEFAULTS.chair;
    const styleWeights = buildStyleWeights(styles);

    const updates: Record<string, unknown> = {};

    // Only update if not already set or different
    if (!model.category || model.category === 'decor') updates.category = category;
    if (!model.style_tags || model.style_tags.length === 0) updates.style_tags = styles;
    if (!model.room_types || model.room_types.length === 0) updates.room_types = roomTypes;
    if (!model.dimensions_m) {
      updates.dimensions_m = { width: dims.width, depth: dims.depth, height: dims.height, unit: 'm' };
    }
    updates.style_weights = styleWeights;
    updates.primary_style = styles[0];

    if (Object.keys(updates).length > 0) {
      const { error: upErr } = await supabase
        .from('products')
        .update(updates)
        .eq('id', model.id);
      if (!upErr) tagCount++;
      else console.warn(`  Tag error for ${name}: ${upErr.message}`);
    }
  }
  console.log(`Tagged ${tagCount} / ${models.length} 3D models\n`);

  // ── Step 3: Link to purchasable products ──
  console.log('Linking 3D models to purchasable products...');

  // Fetch purchasable products (non-3D, with real images)
  const { data: realProducts, error: rpErr } = await supabase
    .from('products')
    .select('id, name, category, style_tags, image_url')
    .not('retailer', 'in', '("polyhaven","sketchfab","poly_pizza")')
    .not('image_url', 'is', null)
    .limit(3000);

  if (rpErr) { console.error('Fetch real products error:', rpErr); return; }
  if (!realProducts || realProducts.length === 0) { console.log('No purchasable products found.'); return; }
  console.log(`Found ${realProducts.length} purchasable products to match against\n`);

  // Build category index
  const catIndex = new Map<string, typeof realProducts>();
  for (const p of realProducts) {
    const cat = p.category ?? 'unknown';
    if (!catIndex.has(cat)) catIndex.set(cat, []);
    catIndex.get(cat)!.push(p);
  }

  let linkCount = 0;
  for (const model of models) {
    const modelName = model.name ?? '';
    const category = model.category ?? inferCategory(modelName);
    const modelStyles = new Set(model.style_tags ?? inferStyles(modelName));

    // Find candidates in same category
    const candidates = catIndex.get(category) ?? [];
    if (candidates.length === 0) continue;

    // Score by style overlap
    let bestId: string | null = null;
    let bestScore = -1;
    for (const cand of candidates) {
      const candStyles = new Set(cand.style_tags ?? []);
      let score = 0;
      for (const s of modelStyles) {
        if (candStyles.has(s)) score++;
      }
      // Bonus for name similarity
      const candLower = (cand.name ?? '').toLowerCase();
      const modelLower = modelName.toLowerCase();
      if (candLower.includes(category) && modelLower.includes(category)) score += 0.5;

      if (score > bestScore) {
        bestScore = score;
        bestId = cand.id;
      }
    }

    if (bestId) {
      const { error: linkErr } = await supabase
        .from('products')
        .update({ linked_product_id: bestId })
        .eq('id', model.id);
      if (!linkErr) linkCount++;
    }
  }
  console.log(`Linked ${linkCount} / ${models.length} 3D models to purchasable products\n`);
  console.log('Done!');
}

main().catch(console.error);

/**
 * generate-furniture-catalog.ts
 *
 * Automated furniture GLB pipeline:
 *   1. Fetches free GLB assets from Sketchfab for 35 room×style combos
 *   2. Optimizes each GLB via @gltf-transform/cli (target <500 KB)
 *   3. Reads actual bounding-box dimensions from each GLB
 *   4. Generates FurnitureCatalogItem entries
 *   5. Merges with existing manually-curated entries (price > 0 && retailer !== 'TBD')
 *   6. Overwrites apps/mobile/src/data/furnitureCatalog.ts
 *
 * Run:  npx ts-node scripts/generate-furniture-catalog.ts
 * Deps: npm install @gltf-transform/core @gltf-transform/functions node-fetch
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'
import fetch from 'node-fetch'
import { NodeIO, Document } from '@gltf-transform/core'

const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)
import { getBounds } from '@gltf-transform/functions'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SKETCHFAB_API = 'https://api.sketchfab.com/v3/models'
const SKETCHFAB_API_KEY = process.env.SKETCHFAB_API_KEY ?? ''
const MIN_PER_COMBO = 15
const MAX_TARGET_KB = 500

const ROOM_TYPES = [
  'living_room',
  'bedroom',
  'dining_room',
  'home_office',
  'kitchen',
  'bathroom',
  'entryway',
] as const

const STYLES = [
  'coastal',
  'japandi',
  'bohemian',
  'mid_century',
  'minimalist',
] as const

type RoomType = typeof ROOM_TYPES[number]
type StyleName = typeof STYLES[number]
type FurnitureCategory = 'seating' | 'tables' | 'lighting' | 'storage' | 'decor' | 'plants' | 'beds'
type PriceRange = 'budget' | 'mid' | 'premium' | 'luxury'

// Human-readable search term per style (used to build API query strings)
const STYLE_SEARCH_TERMS: Record<StyleName, string> = {
  coastal:     'coastal beach natural',
  japandi:     'japandi minimal zen wood',
  bohemian:    'bohemian boho eclectic',
  mid_century: 'mid century retro modern',
  minimalist:  'minimalist clean simple white',
}

// Lead furniture item per room type (used as the primary search noun)
const ROOM_SEARCH_NOUNS: Record<RoomType, string[]> = {
  living_room: ['sofa', 'couch', 'armchair', 'coffee table', 'tv stand', 'bookshelf', 'ottoman', 'side table'],
  bedroom:     ['bed', 'nightstand', 'dresser', 'wardrobe', 'headboard', 'bench', 'lamp', 'mirror'],
  dining_room: ['dining table', 'dining chair', 'buffet', 'sideboard', 'bar stool', 'bench', 'chandelier'],
  home_office: ['desk', 'office chair', 'bookcase', 'filing cabinet', 'monitor stand', 'shelf', 'lamp'],
  kitchen:     ['bar cart', 'kitchen island', 'kitchen stool', 'shelf', 'pendant light', 'plant'],
  bathroom:    ['vanity', 'mirror', 'towel rack', 'shelf', 'bath mat', 'plant', 'stool'],
  entryway:    ['console table', 'bench', 'coat rack', 'mirror', 'plant', 'shoe rack', 'lamp'],
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const REPO_ROOT    = path.resolve(__dirname, '..')
const MODELS_ROOT  = path.join(REPO_ROOT, 'apps/mobile/assets/models/furniture')
const CATALOG_PATH = path.join(REPO_ROOT, 'apps/mobile/src/data/furnitureCatalog.ts')
const LOG_SKIPPED  = path.join(REPO_ROOT, 'scripts/generate-furniture-catalog.skipped.log')

// ---------------------------------------------------------------------------
// Category inference
// ---------------------------------------------------------------------------

const CATEGORY_KEYWORDS: Record<FurnitureCategory, string[]> = {
  seating:  ['sofa', 'couch', 'chair', 'stool', 'bench', 'ottoman', 'settee', 'loveseat', 'sectional'],
  tables:   ['table', 'desk', 'counter', 'island', 'stand', 'console'],
  lighting: ['lamp', 'light', 'sconce', 'pendant', 'chandelier', 'lantern'],
  storage:  ['shelf', 'shelves', 'rack', 'cabinet', 'dresser', 'wardrobe', 'bookcase', 'bookshelf', 'buffet', 'sideboard'],
  decor:    ['mirror', 'rug', 'art', 'vase', 'frame', 'sculpture', 'curtain', 'throw', 'pillow'],
  plants:   ['plant', 'tree', 'succulent', 'cactus', 'fern', 'leaf', 'pot'],
  beds:     ['bed', 'mattress', 'headboard', 'bedframe'],
}

function inferCategory(name: string): FurnitureCategory {
  const lower = name.toLowerCase()
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS) as [FurnitureCategory, string[]][]) {
    if (keywords.some((kw) => lower.includes(kw))) return cat
  }
  return 'decor'
}

// ---------------------------------------------------------------------------
// Style score helper
// ---------------------------------------------------------------------------

function buildStyleTags(primaryStyle: StyleName): StyleName[] {
  return [primaryStyle]
}

// ---------------------------------------------------------------------------
// Name formatting
// ---------------------------------------------------------------------------

function toTitleCase(str: string): string {
  return str
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()
}

// ---------------------------------------------------------------------------
// Sketchfab API
// ---------------------------------------------------------------------------

interface SketchfabModel {
  uid: string
  name: string
  thumbnails?: { images?: Array<{ url: string }> }
}

interface SketchfabSearchResponse {
  results?: SketchfabModel[]
}

interface SketchfabDownloadResponse {
  glb?: { url: string }
  gltf?: { url: string }
}

// Normalised result shape (same as before so downstream code is unchanged)
interface SketchfabResult {
  ID: string
  Title: string
  Download: string
  Thumbnail?: string
}

async function fetchModelsForQuery(
  query: string,
  limit: number,
): Promise<SketchfabResult[]> {
  if (!SKETCHFAB_API_KEY) {
    console.warn('  ⚠ SKETCHFAB_API_KEY not set — skipping query')
    return []
  }

  const params = new URLSearchParams({
    q:                 query,
    tags:              'furniture',
    archives_flavours: 'glb',
    count:             String(limit),
    sort_by:           '-likeCount',
  })
  const authHeaders: Record<string, string> = {
    'Accept':        'application/json',
    'Authorization': `Token ${SKETCHFAB_API_KEY}`,
  }

  // 1. Search
  const searchRes = await fetch(`${SKETCHFAB_API}?${params}`, { headers: authHeaders })
  if (!searchRes.ok) {
    console.warn(`  Sketchfab API error ${searchRes.status} for query "${query}"`)
    return []
  }
  const searchJson = await searchRes.json() as SketchfabSearchResponse
  const models = searchJson.results ?? []

  // 2. Fetch download URL for each model
  const out: SketchfabResult[] = []
  for (const model of models) {
    const dlRes = await fetch(`${SKETCHFAB_API}/${model.uid}/download`, { headers: authHeaders })
    if (!dlRes.ok) continue
    const dlJson = await dlRes.json() as SketchfabDownloadResponse
    const glbUrl = dlJson.glb?.url ?? dlJson.gltf?.url
    if (!glbUrl) continue
    out.push({
      ID:        model.uid,
      Title:     model.name,
      Download:  glbUrl,
      Thumbnail: model.thumbnails?.images?.[0]?.url,
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// Download a GLB file
// ---------------------------------------------------------------------------

async function downloadGlb(url: string, destPath: string): Promise<boolean> {
  try {
    const res = await fetch(url)
    if (!res.ok) return false
    const buffer = await res.buffer()
    fs.mkdirSync(path.dirname(destPath), { recursive: true })
    fs.writeFileSync(destPath, buffer)
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Optimize GLB via gltf-transform CLI
// ---------------------------------------------------------------------------

function optimizeGlb(inputPath: string, outputPath: string): boolean {
  try {
    execSync(
      `npx gltf-transform optimize "${inputPath}" "${outputPath}" --texture-compress webp --simplify --target-error 0.01`,
      { stdio: 'pipe', timeout: 60_000 },
    )
    const sizeKb = fs.statSync(outputPath).size / 1024
    if (sizeKb > MAX_TARGET_KB) {
      console.warn(`  ⚠ ${path.basename(outputPath)} is ${sizeKb.toFixed(0)} KB (>${MAX_TARGET_KB} KB) — keeping anyway`)
    }
    return true
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    fs.appendFileSync(LOG_SKIPPED, `OPTIMIZE_FAIL\t${inputPath}\t${msg.slice(0, 120)}\n`)
    return false
  }
}

// ---------------------------------------------------------------------------
// Read bounding box from GLB
// ---------------------------------------------------------------------------

async function readGlbDimensions(
  glbPath: string,
): Promise<{ width: number; depth: number; height: number }> {
  try {
    const io = new NodeIO()
    const doc: Document = await io.read(glbPath)
    const bbox = getBounds(doc.getRoot().listScenes()[0])
    const w = Math.abs(bbox.max[0] - bbox.min[0])
    const h = Math.abs(bbox.max[1] - bbox.min[1])
    const d = Math.abs(bbox.max[2] - bbox.min[2])
    // Sanity clamp: models occasionally have wildly wrong scale
    return {
      width:  Math.min(Math.max(w, 0.1), 5.0),
      depth:  Math.min(Math.max(d, 0.1), 5.0),
      height: Math.min(Math.max(h, 0.1), 3.0),
    }
  } catch {
    // Return sensible defaults if bounding box read fails
    return { width: 0.8, depth: 0.8, height: 0.8 }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface CatalogEntry {
  id: string
  name: string
  category: FurnitureCategory
  room_types: RoomType[]
  style_tags: StyleName[]
  glb_path: string
  thumbnail_url: string
  width: number
  depth: number
  height: number
  price_range: PriceRange
  colors: string[]
}

async function run() {
  console.log('=== Cova Furniture GLB Pipeline ===\n')

  // Install deps if missing (no-op if already installed)
  console.log('Checking dependencies...')
  try {
    execSync('node -e "require(\'@gltf-transform/core\')"', { stdio: 'pipe' })
  } catch {
    console.log('Installing @gltf-transform/core @gltf-transform/functions node-fetch...')
    execSync('npm install --save-dev @gltf-transform/core @gltf-transform/functions node-fetch', {
      stdio: 'inherit',
      cwd: REPO_ROOT,
    })
  }

  const generatedEntries: CatalogEntry[] = []
  const coverage: Record<string, number> = {}
  const undercoveredCombos: string[] = []
  const skippedFiles: string[] = []

  let globalIndex = 0

  for (const roomType of ROOM_TYPES) {
    for (const style of STYLES) {
      const comboKey = `${roomType}__${style}`
      console.log(`\n── ${roomType} × ${style} ──`)

      const nouns = ROOM_SEARCH_NOUNS[roomType]
      const styleTerm = STYLE_SEARCH_TERMS[style]

      // Collect model results across multiple nouns until we hit MIN_PER_COMBO
      const collected: PolyPizzaResult[] = []
      const seenIds = new Set<string>()

      for (const noun of nouns) {
        if (collected.length >= MIN_PER_COMBO) break
        const query = `${styleTerm} ${noun}`
        const results = await fetchModelsForQuery(query, MIN_PER_COMBO)
        for (const r of results) {
          if (!seenIds.has(r.ID) && r.Download) {
            seenIds.add(r.ID)
            collected.push(r)
          }
          if (collected.length >= MIN_PER_COMBO) break
        }
        // Brief pause to respect rate limits
        await new Promise((resolve) => setTimeout(resolve, 300))
      }

      console.log(`  Found ${collected.length} models`)
      if (collected.length < MIN_PER_COMBO) {
        undercoveredCombos.push(`${comboKey} (${collected.length}/${MIN_PER_COMBO})`)
      }

      let comboCount = 0

      for (const model of collected) {
        globalIndex++
        const safeName = model.Title
          .replace(/[^a-z0-9 ]/gi, '')
          .replace(/\s+/g, '-')
          .toLowerCase()
          .slice(0, 60)
        const filename = `${safeName}-${model.ID.slice(-6)}.glb`
        const rawDir  = path.join(MODELS_ROOT, roomType, style, 'raw')
        const optDir  = path.join(MODELS_ROOT, roomType, style)
        const rawPath = path.join(rawDir, filename)
        const optPath = path.join(optDir, filename)

        // Download
        if (!fs.existsSync(rawPath)) {
          const ok = await downloadGlb(model.Download, rawPath)
          if (!ok) {
            console.warn(`  ✗ Download failed: ${model.Title}`)
            skippedFiles.push(`DOWNLOAD_FAIL\t${model.Download}`)
            continue
          }
        }

        // Optimize
        if (!fs.existsSync(optPath)) {
          fs.mkdirSync(optDir, { recursive: true })
          const ok = optimizeGlb(rawPath, optPath)
          if (!ok) {
            console.warn(`  ✗ Optimize failed: ${filename}`)
            skippedFiles.push(`OPTIMIZE_FAIL\t${rawPath}`)
            continue
          }
        }

        // Dimensions
        const dims = await readGlbDimensions(optPath)

        // Catalog entry
        const entryId   = `${roomType}-${style}-${globalIndex}`
        const entryName = toTitleCase(model.Title)
        const category  = inferCategory(model.Title)
        // GLB path relative to the mobile app's assets root (Metro bundle)
        const relGlbPath = `assets/models/furniture/${roomType}/${style}/${filename}`

        generatedEntries.push({
          id:            entryId,
          name:          entryName,
          category,
          room_types:    [roomType],
          style_tags:    buildStyleTags(style),
          glb_path:      relGlbPath,
          thumbnail_url: model.Thumbnail ?? '',
          width:         Math.round(dims.width  * 100) / 100,
          depth:         Math.round(dims.depth  * 100) / 100,
          height:        Math.round(dims.height * 100) / 100,
          price_range:   'mid',   // to be updated by update-furniture-prices.ts
          colors:        [],
        })

        comboCount++
        console.log(`  ✓ [${comboCount}] ${entryName} (${dims.width.toFixed(2)}×${dims.depth.toFixed(2)}×${dims.height.toFixed(2)} m)`)
      }

      coverage[comboKey] = comboCount
    }
  }

  // ---------------------------------------------------------------------------
  // Merge with existing manually-curated entries
  // ---------------------------------------------------------------------------

  console.log('\n── Merging with existing catalog ──')

  // Dynamically eval the existing catalog to extract manually-curated items.
  // We look for entries that have a non-empty glb_path that starts with 'assets/3d'
  // (manually placed) rather than the generated 'assets/models' path.
  let existingManualEntries: CatalogEntry[] = []
  if (fs.existsSync(CATALOG_PATH)) {
    const raw = fs.readFileSync(CATALOG_PATH, 'utf8')
    // Extract entries via regex — each entry is a {...} block between array brackets
    const blockRe = /\{[\s\S]*?glb_path:\s*['"`]([^'"`]*)['"`][\s\S]*?\}/g
    let match: RegExpExecArray | null
    while ((match = blockRe.exec(raw)) !== null) {
      const glbPath = match[1]
      // Keep only manually-placed assets (not ones we generated previously)
      if (glbPath.startsWith('assets/3d/')) {
        // Parse the full block as best we can — extract key fields
        const block = match[0]
        const get = (key: string): string => {
          const m = new RegExp(`${key}:\\s*['"\`]([^'"\`]*)['"\`]`).exec(block)
          return m?.[1] ?? ''
        }
        const getArr = (key: string): string[] => {
          const m = new RegExp(`${key}:\\s*\\[([^\\]]*)\\]`).exec(block)
          if (!m) return []
          return m[1].split(',').map((s) => s.replace(/['"\s]/g, '')).filter(Boolean)
        }
        const getNum = (key: string): number => parseFloat(
          new RegExp(`${key}:\\s*([0-9.]+)`).exec(block)?.[1] ?? '0',
        )
        existingManualEntries.push({
          id:            get('id'),
          name:          get('name'),
          category:      get('category') as FurnitureCategory,
          room_types:    getArr('room_types') as RoomType[],
          style_tags:    getArr('style_tags') as StyleName[],
          glb_path:      glbPath,
          thumbnail_url: get('thumbnail_url'),
          width:         getNum('width'),
          depth:         getNum('depth'),
          height:        getNum('height'),
          price_range:   (get('price_range') || 'mid') as PriceRange,
          colors:        getArr('colors'),
        })
      }
    }
    console.log(`  Preserved ${existingManualEntries.length} manually-curated entries`)
  }

  const mergedEntries = [...existingManualEntries, ...generatedEntries]

  // ---------------------------------------------------------------------------
  // Write furnitureCatalog.ts
  // ---------------------------------------------------------------------------

  console.log('\n── Writing furnitureCatalog.ts ──')

  const stringify = (entry: CatalogEntry): string => {
    const roomTypesStr = entry.room_types.map((r) => `'${r}'`).join(', ')
    const styleTagsStr = entry.style_tags.map((s) => `'${s}'`).join(', ')
    const colorsStr    = entry.colors.map((c) => `'${c}'`).join(', ')
    return `  {
    id:            '${entry.id}',
    name:          '${entry.name.replace(/'/g, "\\'")}',
    category:      '${entry.category}',
    room_types:    [${roomTypesStr}],
    style_tags:    [${styleTagsStr}],
    glb_path:      '${entry.glb_path}',
    thumbnail_url: '${entry.thumbnail_url}',
    width:         ${entry.width},
    depth:         ${entry.depth},
    height:        ${entry.height},
    price_range:   '${entry.price_range}',
    colors:        [${colorsStr}],
  }`
  }

  const catalogTs = `import type {
  FurnitureCatalogItem,
  FurniturePiece,
  StyleName,
  RoomType,
  StyleBlend,
} from '@cova/shared';

// AUTO-GENERATED by scripts/generate-furniture-catalog.ts
// Manually-curated entries (assets/3d/) are preserved automatically.
// DO NOT hand-edit generated entries — re-run the pipeline instead.

export const FURNITURE_CATALOG: FurnitureCatalogItem[] = [
${mergedEntries.map(stringify).join(',\n')}
];

export const STYLE_PALETTE: Record<StyleName, {
  floor: string; walls: string; ceiling: string; trim: string; emissive: string;
}> = {
  coastal:     { floor: '#C8B89A', walls: '#E8DFD0', ceiling: '#F5F0E8', trim: '#FFFFFF', emissive: '#FFF8F0' },
  japandi:     { floor: '#8B7355', walls: '#D4CAB8', ceiling: '#EDE8DF', trim: '#F0EDE6', emissive: '#FFFAF5' },
  bohemian:    { floor: '#A0785A', walls: '#D4B896', ceiling: '#E8D5B7', trim: '#C8A882', emissive: '#FFF5E8' },
  mid_century: { floor: '#8B6914', walls: '#C8A870', ceiling: '#E8D098', trim: '#5C3D1E', emissive: '#FFF0D0' },
  minimalist:  { floor: '#D0D0D0', walls: '#E8E8E8', ceiling: '#F5F5F5', trim: '#FFFFFF', emissive: '#FFFFFF' },
};

export function getFurnitureForRoom(
  roomType: RoomType,
  styleBlend: StyleBlend,
  priceRange?: string,
): FurnitureCatalogItem[] {
  return FURNITURE_CATALOG
    .filter((item) => item.room_types.includes(roomType))
    .filter((item) => !priceRange || item.price_range === priceRange)
    .sort((a, b) => {
      const scoreA = a.style_tags.reduce((sum, tag) => sum + (styleBlend[tag as StyleName] ?? 0), 0);
      const scoreB = b.style_tags.reduce((sum, tag) => sum + (styleBlend[tag as StyleName] ?? 0), 0);
      return scoreB - scoreA;
    });
}
`

  fs.writeFileSync(CATALOG_PATH, catalogTs, 'utf8')

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------

  console.log('\n=== Pipeline Complete ===\n')

  const perRoom: Record<string, number> = {}
  const perStyle: Record<string, number> = {}
  for (const e of generatedEntries) {
    for (const r of e.room_types) perRoom[r] = (perRoom[r] ?? 0) + 1
    for (const s of e.style_tags) perStyle[s] = (perStyle[s] ?? 0) + 1
  }

  console.log('Generated entries per room type:')
  for (const [r, n] of Object.entries(perRoom)) console.log(`  ${r.padEnd(14)} ${n}`)
  console.log('\nGenerated entries per style:')
  for (const [s, n] of Object.entries(perStyle)) console.log(`  ${s.padEnd(14)} ${n}`)
  console.log(`\nManually-curated preserved: ${existingManualEntries.length}`)
  console.log(`Generated new:              ${generatedEntries.length}`)
  console.log(`Grand total:                ${mergedEntries.length}`)

  if (undercoveredCombos.length > 0) {
    console.log('\n⚠ Combos with fewer than 15 items:')
    for (const c of undercoveredCombos) console.log(`  ${c}`)
  } else {
    console.log('\n✓ All 35 combos met the 15-item minimum')
  }

  if (skippedFiles.length > 0) {
    fs.writeFileSync(LOG_SKIPPED, skippedFiles.join('\n') + '\n', 'utf8')
    console.log(`\n${skippedFiles.length} files skipped — see ${LOG_SKIPPED}`)
  }
}

run().catch((err) => {
  console.error('Pipeline failed:', err)
  process.exit(1)
})

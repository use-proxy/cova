/**
 * generate-furniture-catalog.ts
 *
 * Generates 525 placeholder GLBs programmatically (no downloads, no API calls).
 * Each GLB is a box mesh sized to the correct approximate dimensions for its
 * furniture type. Real models can replace them one-by-one later.
 *
 * Output:
 *   assets/models/furniture/[room_type]/[style]/[name].glb  (525 files)
 *   apps/mobile/src/data/furnitureCatalog.ts                (updated)
 *
 * Run: cd scripts && npx tsx generate-furniture-catalog.ts
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { Document, NodeIO } from '@gltf-transform/core'

const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)

// ── Constants ────────────────────────────────────────────────────────────────

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

type RoomType       = typeof ROOM_TYPES[number]
type StyleName      = typeof STYLES[number]
type FurnitureType  = keyof typeof DIMENSIONS
type FurnitureCat   = 'seating' | 'tables' | 'lighting' | 'storage' | 'decor' | 'plants' | 'beds'

const ITEMS_PER_COMBO = 15   // 7 rooms × 5 styles × 15 = 525

// ── Dimension map (width × height × depth in metres) ─────────────────────────

const DIMENSIONS = {
  sofa:         { width: 2.1, height: 0.85, depth: 0.9  },
  armchair:     { width: 0.85, height: 0.85, depth: 0.9  },
  coffee_table: { width: 1.2, height: 0.45, depth: 0.4  },
  bed_queen:    { width: 1.6, height: 0.5,  depth: 2.1  },
  dining_table: { width: 1.8, height: 0.75, depth: 0.9  },
  desk:         { width: 1.4, height: 0.75, depth: 0.6  },
  wardrobe:     { width: 1.2, height: 2.0,  depth: 0.6  },
  nightstand:   { width: 0.5, height: 0.6,  depth: 0.4  },
  dresser:      { width: 1.0, height: 1.0,  depth: 0.5  },
  bookshelf:    { width: 0.8, height: 1.8,  depth: 0.3  },
  default:      { width: 0.8, height: 0.8,  depth: 0.8  },
} as const satisfies Record<string, { width: number; height: number; depth: number }>

// ── Category per furniture type ───────────────────────────────────────────────

const FURNITURE_CATEGORY: Record<FurnitureType, FurnitureCat> = {
  sofa:         'seating',
  armchair:     'seating',
  coffee_table: 'tables',
  bed_queen:    'beds',
  dining_table: 'tables',
  desk:         'tables',
  wardrobe:     'storage',
  nightstand:   'storage',
  dresser:      'storage',
  bookshelf:    'storage',
  default:      'decor',
}

// ── 15 furniture slots per room type (cycles through furniture types) ─────────
// Exactly ITEMS_PER_COMBO entries each.

const ROOM_SLOTS: Record<RoomType, FurnitureType[]> = {
  living_room:  ['sofa','sofa','sofa','armchair','armchair','armchair','coffee_table','coffee_table','coffee_table','bookshelf','bookshelf','bookshelf','default','default','default'],
  bedroom:      ['bed_queen','bed_queen','bed_queen','nightstand','nightstand','nightstand','dresser','dresser','dresser','wardrobe','wardrobe','wardrobe','default','default','default'],
  dining_room:  ['dining_table','dining_table','dining_table','armchair','armchair','armchair','armchair','armchair','armchair','bookshelf','bookshelf','bookshelf','default','default','default'],
  home_office:  ['desk','desk','desk','desk','desk','armchair','armchair','armchair','armchair','armchair','bookshelf','bookshelf','bookshelf','bookshelf','bookshelf'],
  kitchen:      ['coffee_table','coffee_table','coffee_table','default','default','default','default','default','default','default','default','default','default','default','default'],
  bathroom:     ['nightstand','nightstand','nightstand','dresser','dresser','dresser','default','default','default','default','default','default','default','default','default'],
  entryway:     ['armchair','armchair','armchair','nightstand','nightstand','nightstand','bookshelf','bookshelf','bookshelf','default','default','default','default','default','default'],
}

// ── Paths ─────────────────────────────────────────────────────────────────────

const REPO_ROOT    = path.resolve(__dirname, '..')
const MODELS_ROOT  = path.join(REPO_ROOT, 'assets', 'models', 'furniture')
const CATALOG_PATH = path.join(REPO_ROOT, 'apps', 'mobile', 'src', 'data', 'furnitureCatalog.ts')

// ── Box GLB generator ─────────────────────────────────────────────────────────
//
// Creates a minimal valid GLB containing a single box mesh centred at the origin.
// The box has 6 faces × 4 vertices = 24 vertices and 6 faces × 2 tris = 36 indices.

async function createBoxGlb(
  width: number,
  height: number,
  depth: number,
): Promise<Uint8Array> {
  const hw = width  / 2
  const hh = height / 2
  const hd = depth  / 2

  // 24 positions — 4 vertices per face, 6 faces: -X +X -Y +Y -Z +Z
  const positions = new Float32Array([
    // -X
    -hw, -hh, -hd,  -hw,  hh, -hd,  -hw,  hh,  hd,  -hw, -hh,  hd,
    // +X
     hw, -hh,  hd,   hw,  hh,  hd,   hw,  hh, -hd,   hw, -hh, -hd,
    // -Y (floor)
    -hw, -hh, -hd,  -hw, -hh,  hd,   hw, -hh,  hd,   hw, -hh, -hd,
    // +Y (top)
    -hw,  hh,  hd,  -hw,  hh, -hd,   hw,  hh, -hd,   hw,  hh,  hd,
    // -Z (front)
     hw, -hh, -hd,   hw,  hh, -hd,  -hw,  hh, -hd,  -hw, -hh, -hd,
    // +Z (back)
    -hw, -hh,  hd,  -hw,  hh,  hd,   hw,  hh,  hd,   hw, -hh,  hd,
  ])

  const normals = new Float32Array([
    -1, 0, 0,  -1, 0, 0,  -1, 0, 0,  -1, 0, 0,
     1, 0, 0,   1, 0, 0,   1, 0, 0,   1, 0, 0,
     0,-1, 0,   0,-1, 0,   0,-1, 0,   0,-1, 0,
     0, 1, 0,   0, 1, 0,   0, 1, 0,   0, 1, 0,
     0, 0,-1,   0, 0,-1,   0, 0,-1,   0, 0,-1,
     0, 0, 1,   0, 0, 1,   0, 0, 1,   0, 0, 1,
  ])

  // 36 indices — 2 triangles per face: (0,1,2) (0,2,3) with per-face offset
  const indices = new Uint16Array(36)
  for (let f = 0; f < 6; f++) {
    const b = f * 4
    const i = f * 6
    indices[i]     = b;     indices[i + 1] = b + 1; indices[i + 2] = b + 2
    indices[i + 3] = b;     indices[i + 4] = b + 2; indices[i + 5] = b + 3
  }

  const doc    = new Document()
  const buffer = doc.createBuffer()

  const posAcc = doc.createAccessor()
    .setType('VEC3').setArray(positions).setBuffer(buffer)
  const normAcc = doc.createAccessor()
    .setType('VEC3').setArray(normals).setBuffer(buffer)
  const idxAcc = doc.createAccessor()
    .setType('SCALAR').setArray(indices).setBuffer(buffer)

  const mat = doc.createMaterial('PlaceholderMat')
    .setBaseColorFactor([0.76, 0.70, 0.63, 1.0])  // warm neutral

  const prim = doc.createPrimitive()
    .setAttribute('POSITION', posAcc)
    .setAttribute('NORMAL', normAcc)
    .setIndices(idxAcc)
    .setMaterial(mat)

  const mesh  = doc.createMesh('Box').addPrimitive(prim)
  const node  = doc.createNode('Box').setMesh(mesh)
  const scene = doc.createScene('Scene').addChild(node)
  doc.getRoot().setDefaultScene(scene)

  const io = new NodeIO()
  return io.writeBinary(doc)
}

// ── Catalog entry type ────────────────────────────────────────────────────────

interface CatalogEntry {
  id:            string
  name:          string
  category:      FurnitureCat
  room_types:    RoomType[]
  style_tags:    StyleName[]
  glb_path:      string
  thumbnail_url: string
  width:         number
  depth:         number
  height:        number
  price_range:   'budget'
  colors:        string[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toTitleCase(str: string): string {
  return str.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  console.log('=== Cova Furniture GLB Generator (Placeholder Mode) ===\n')
  console.log(`Target: ${ROOM_TYPES.length} rooms × ${STYLES.length} styles × ${ITEMS_PER_COMBO} items = ${ROOM_TYPES.length * STYLES.length * ITEMS_PER_COMBO} GLBs\n`)

  const io = new NodeIO()
  const generatedEntries: CatalogEntry[] = []
  const coverageMap: Record<string, number> = {}

  let totalGlbs = 0

  for (const roomType of ROOM_TYPES) {
    for (const style of STYLES) {
      const comboKey = `${roomType} × ${style}`
      const slots    = ROOM_SLOTS[roomType]
      const outDir   = path.join(MODELS_ROOT, roomType, style)
      fs.mkdirSync(outDir, { recursive: true })

      let comboCount = 0

      for (let idx = 0; idx < ITEMS_PER_COMBO; idx++) {
        const furnitureType = slots[idx]
        const dims          = DIMENSIONS[furnitureType]
        const category      = FURNITURE_CATEGORY[furnitureType]
        const entryId       = `${roomType}-${style}-${furnitureType}-${idx}`
        const filename      = `${roomType}-${style}-${furnitureType}-${idx}.glb`
        const filePath      = path.join(outDir, filename)
        const catalogPath   = `assets/models/furniture/${roomType}/${style}/${filename}`

        if (!fs.existsSync(filePath)) {
          const glbBytes = await createBoxGlb(dims.width, dims.height, dims.depth)
          fs.writeFileSync(filePath, glbBytes)
        }

        generatedEntries.push({
          id:            entryId,
          name:          `${toTitleCase(style)} ${toTitleCase(furnitureType)}`,
          category,
          room_types:    [roomType],
          style_tags:    [style],
          glb_path:      catalogPath,
          thumbnail_url: '',
          width:         round2(dims.width),
          depth:         round2(dims.depth),
          height:        round2(dims.height),
          price_range:   'budget',
          colors:        [],
        })

        comboCount++
        totalGlbs++
      }

      coverageMap[comboKey] = comboCount
      console.log(`  ✓ ${comboKey.padEnd(30)} ${comboCount} GLBs`)
    }
  }

  // ── Preserve existing manually-curated catalog entries ─────────────────────
  // Keep any entry whose glb_path starts with 'assets/3d/' (hand-placed models).

  let existingManual: CatalogEntry[] = []
  if (fs.existsSync(CATALOG_PATH)) {
    const raw = fs.readFileSync(CATALOG_PATH, 'utf8')
    const blockRe = /\{[\s\S]*?glb_path:\s*['"`]([^'"`]*)['"`][\s\S]*?\}/g
    let m: RegExpExecArray | null
    while ((m = blockRe.exec(raw)) !== null) {
      if (!m[1].startsWith('assets/3d/')) continue
      const b   = m[0]
      const get = (key: string) => new RegExp(`${key}:\\s*['"\`]([^'"\`]*)['"\`]`).exec(b)?.[1] ?? ''
      const getArr = (key: string): string[] => {
        const am = new RegExp(`${key}:\\s*\\[([^\\]]*)\\]`).exec(b)
        if (!am) return []
        return am[1].split(',').map((s) => s.replace(/['"\s]/g, '')).filter(Boolean)
      }
      const getNum = (key: string) => parseFloat(new RegExp(`${key}:\\s*([0-9.]+)`).exec(b)?.[1] ?? '0')
      existingManual.push({
        id:            get('id'),
        name:          get('name'),
        category:      get('category') as FurnitureCat,
        room_types:    getArr('room_types') as RoomType[],
        style_tags:    getArr('style_tags') as StyleName[],
        glb_path:      m[1],
        thumbnail_url: get('thumbnail_url'),
        width:         getNum('width'),
        depth:         getNum('depth'),
        height:        getNum('height'),
        price_range:   'budget',
        colors:        getArr('colors'),
      })
    }
  }
  console.log(`\nPreserved ${existingManual.length} manually-curated entries (assets/3d/)`)

  const merged = [...existingManual, ...generatedEntries]

  // ── Serialize catalog entry ─────────────────────────────────────────────────

  const serializeEntry = (e: CatalogEntry): string => {
    const roomTypes  = e.room_types.map((r) => `'${r}'`).join(', ')
    const styleTags  = e.style_tags.map((s) => `'${s}'`).join(', ')
    const colors     = e.colors.map((c) => `'${c}'`).join(', ')
    return `  {
    id:            '${e.id}',
    name:          '${e.name.replace(/'/g, "\\'")}',
    category:      '${e.category}',
    room_types:    [${roomTypes}],
    style_tags:    [${styleTags}],
    glb_path:      '${e.glb_path}',
    thumbnail_url: '${e.thumbnail_url}',
    width:         ${e.width},
    depth:         ${e.depth},
    height:        ${e.height},
    price_range:   '${e.price_range}',
    colors:        [${colors}],
  }`
  }

  // ── Write furnitureCatalog.ts ───────────────────────────────────────────────

  const catalogTs = `import type { FurnitureCatalogItem, StyleName, RoomType, StyleBlend } from '@cova/shared';

// AUTO-GENERATED by scripts/generate-furniture-catalog.ts — do not hand-edit generated entries.
// Manually-curated entries (glb_path starts with 'assets/3d/') are preserved on re-run.

export const FURNITURE_CATALOG: FurnitureCatalogItem[] = [
${merged.map(serializeEntry).join(',\n')}
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

  // ── Final report ───────────────────────────────────────────────────────────

  const combosHit    = Object.values(coverageMap).filter((n) => n === ITEMS_PER_COMBO).length
  const totalCombos  = ROOM_TYPES.length * STYLES.length

  console.log('\n=== Complete ===\n')
  console.log(`1. Total GLBs generated:       ${totalGlbs}`)
  console.log(`2. Coverage:                   ${combosHit}/${totalCombos} combos at ${ITEMS_PER_COMBO} items each`)
  console.log(`3. Total catalog entries:      ${merged.length} (${existingManual.length} manual + ${generatedEntries.length} generated)`)
}

run().catch((err) => {
  console.error('Generator failed:', err)
  process.exit(1)
})

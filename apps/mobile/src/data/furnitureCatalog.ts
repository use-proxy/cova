import type {
  FurnitureCatalogItem,
  FurniturePiece,
  StyleName,
  RoomType,
  StyleBlend,
} from '@cova/shared';

// GLB files loaded via expo-asset at runtime — require() replaced to prevent Metro crash if files missing.
// ── Catalog ──────────────────────────────────────

export const FURNITURE_CATALOG: FurnitureCatalogItem[] = [
  // ── Bohemian ───────────────────────────────────
  // All dimensions in METRES (converted from feet ÷ 3.28084)
  {
    id: 'boho-sofa-01',
    name: 'Velvet Boho Sofa',
    category: 'seating',
    room_types: ['living_room', 'bedroom'],
    style_tags: ['bohemian'],
    glb_path: 'assets/3d/furniture/ready/boho_sofa.glb',
    thumbnail_url: '',
    width: 2.13, depth: 0.91, height: 0.91,
    price_range: 'mid',
    colors: ['#8B4513', '#C47B3C', '#1B3A2D'],
  },
  {
    id: 'boho-chair-01',
    name: 'Boho Accent Chair',
    category: 'seating',
    room_types: ['living_room', 'bedroom'],
    style_tags: ['bohemian'],
    glb_path: 'assets/3d/furniture/ready/boho_chair.glb',
    thumbnail_url: '',
    width: 0.91, depth: 0.91, height: 1.07,
    price_range: 'budget',
    colors: ['#C47B3C', '#8B4513'],
  },
  {
    id: 'boho-rug-01',
    name: 'Kilim Area Rug',
    category: 'decor',
    room_types: ['living_room', 'bedroom', 'dining_room'],
    style_tags: ['bohemian'],
    glb_path: 'assets/3d/furniture/ready/boho_rug.glb',
    thumbnail_url: '',
    width: 2.44, depth: 1.83, height: 0.02,
    price_range: 'budget',
    colors: ['#C47B3C', '#1B3A2D', '#8B7355'],
  },
  {
    id: 'boho-mirror-01',
    name: 'Boho Round Mirror',
    category: 'decor',
    room_types: ['living_room', 'bedroom', 'dining_room'],
    style_tags: ['bohemian'],
    glb_path: 'assets/3d/furniture/ready/boho_mirror.glb',
    thumbnail_url: '',
    width: 0.61, depth: 0.03, height: 0.61,
    price_range: 'budget',
    colors: ['#8B7355'],
  },
  {
    id: 'boho-plant-01',
    name: 'Trailing Pothos',
    category: 'decor',
    room_types: ['living_room', 'bedroom', 'dining_room'],
    style_tags: ['bohemian'],
    glb_path: 'assets/3d/furniture/ready/boho_plant.glb',
    thumbnail_url: '',
    width: 0.46, depth: 0.46, height: 0.61,
    price_range: 'budget',
    colors: [],
  },
  {
    id: 'boho-floor-lamp-01',
    name: 'Boho Floor Lamp',
    category: 'lighting',
    room_types: ['living_room', 'bedroom', 'dining_room'],
    style_tags: ['bohemian'],
    glb_path: 'assets/3d/furniture/ready/boho_floor_lamp.glb',
    thumbnail_url: '',
    width: 0.46, depth: 0.46, height: 1.83,
    price_range: 'budget',
    colors: ['#8B7355'],
  },
  {
    id: 'boho-pendant-01',
    name: 'Rattan Pendant',
    category: 'lighting',
    room_types: ['living_room', 'bedroom', 'dining_room'],
    style_tags: ['bohemian'],
    glb_path: 'assets/3d/furniture/ready/boho_pendant_lamp.glb',
    thumbnail_url: '',
    width: 0.46, depth: 0.46, height: 0.61,
    price_range: 'budget',
    colors: ['#8B7355'],
  },

  // ── Coastal ────────────────────────────────────
  {
    id: 'coastal-sofa-01',
    name: 'Linen Coastal Sofa',
    category: 'seating',
    room_types: ['living_room'],
    style_tags: ['coastal'],
    glb_path: 'assets/3d/furniture/ready/coastal_sofa.glb',
    thumbnail_url: '',
    width: 2.13, depth: 1.07, height: 0.91,
    price_range: 'mid',
    colors: ['#F5F0E8', '#C8B89A'],
  },
  {
    id: 'coastal-chair-01',
    name: 'Rattan Accent Chair',
    category: 'seating',
    room_types: ['living_room', 'bedroom'],
    style_tags: ['coastal'],
    glb_path: 'assets/3d/furniture/ready/coastal_rattan_chair.glb',
    thumbnail_url: '',
    width: 0.91, depth: 0.91, height: 1.07,
    price_range: 'budget',
    colors: ['#8B7355'],
  },
  {
    id: 'coastal-coffee-01',
    name: 'Whitewash Coffee Table',
    category: 'tables',
    room_types: ['living_room'],
    style_tags: ['coastal'],
    glb_path: 'assets/3d/furniture/ready/coastal_coffee_table.glb',
    thumbnail_url: '',
    width: 1.22, depth: 0.61, height: 0.46,
    price_range: 'budget',
    colors: ['#F5F0E8', '#C8B89A'],
  },
  {
    id: 'coastal-rug-01',
    name: 'Seagrass Rug',
    category: 'decor',
    room_types: ['living_room', 'bedroom'],
    style_tags: ['coastal'],
    glb_path: 'assets/3d/furniture/ready/coastal_rug.glb',
    thumbnail_url: '',
    width: 2.44, depth: 1.83, height: 0.02,
    price_range: 'budget',
    colors: ['#C8B89A', '#F5F0E8'],
  },
  {
    id: 'coastal-plant-01',
    name: 'Coastal Palm',
    category: 'plants',
    room_types: ['living_room', 'bedroom'],
    style_tags: ['coastal'],
    glb_path: 'assets/3d/furniture/ready/coastal_plant.glb',
    thumbnail_url: '',
    width: 0.61, depth: 0.61, height: 1.52,
    price_range: 'budget',
    colors: [],
  },
  {
    id: 'coastal-lamp-01',
    name: 'Coastal Arc Lamp',
    category: 'lighting',
    room_types: ['living_room', 'bedroom'],
    style_tags: ['coastal'],
    glb_path: 'assets/3d/furniture/ready/coastal_floor_lamp.glb',
    thumbnail_url: '',
    width: 0.61, depth: 0.61, height: 2.13,
    price_range: 'mid',
    colors: ['#F5F0E8'],
  },
  {
    id: 'coastal-mirror-01',
    name: 'Rope Mirror',
    category: 'decor',
    room_types: ['living_room', 'bedroom', 'bathroom'],
    style_tags: ['coastal'],
    glb_path: 'assets/3d/furniture/ready/coastal_mirror.glb',
    thumbnail_url: '',
    width: 0.61, depth: 0.03, height: 0.76,
    price_range: 'budget',
    colors: ['#8B7355'],
  },
  {
    id: 'coastal-pendant-01',
    name: 'Coastal Pendant',
    category: 'lighting',
    room_types: ['dining_room', 'kitchen'],
    style_tags: ['coastal'],
    glb_path: 'assets/3d/furniture/ready/coastal_pendant_lamp.glb',
    thumbnail_url: '',
    width: 0.46, depth: 0.46, height: 0.61,
    price_range: 'budget',
    colors: ['#F5F0E8'],
  },

  // ── Japandi ────────────────────────────────────
  {
    id: 'japandi-sofa-01',
    name: 'Low Profile Linen Sofa',
    category: 'seating',
    room_types: ['living_room'],
    style_tags: ['japandi'],
    glb_path: 'assets/3d/furniture/ready/japandi_sofa.glb',
    thumbnail_url: '',
    width: 2.13, depth: 0.91, height: 0.85,
    price_range: 'mid',
    colors: ['#F5F0E8', '#8B7355', '#1B3A2D'],
  },
  {
    id: 'japandi-chair-01',
    name: 'Oak Accent Chair',
    category: 'seating',
    room_types: ['living_room', 'bedroom'],
    style_tags: ['japandi'],
    glb_path: 'assets/3d/furniture/ready/japandi_chair.glb',
    thumbnail_url: '',
    width: 0.76, depth: 0.76, height: 0.91,
    price_range: 'mid',
    colors: ['#8B7355'],
  },
  {
    id: 'japandi-coffee-01',
    name: 'Round Teak Table',
    category: 'tables',
    room_types: ['living_room'],
    style_tags: ['japandi'],
    glb_path: 'assets/3d/furniture/ready/japandi_coffee_table.glb',
    thumbnail_url: '',
    width: 1.07, depth: 1.07, height: 0.46,
    price_range: 'mid',
    colors: ['#8B7355', '#5C3D1E'],
  },
  {
    id: 'japandi-side-01',
    name: 'Bamboo Side Table',
    category: 'tables',
    room_types: ['living_room', 'bedroom'],
    style_tags: ['japandi'],
    glb_path: 'assets/3d/furniture/ready/japandi_side_table.glb',
    thumbnail_url: '',
    width: 0.46, depth: 0.46, height: 0.61,
    price_range: 'budget',
    colors: ['#8B7355'],
  },
  {
    id: 'japandi-rug-01',
    name: 'Natural Jute Rug',
    category: 'decor',
    room_types: ['living_room', 'bedroom'],
    style_tags: ['japandi'],
    glb_path: 'assets/3d/furniture/ready/japandi_rug.glb',
    thumbnail_url: '',
    width: 2.44, depth: 1.83, height: 0.02,
    price_range: 'budget',
    colors: ['#C8B89A'],
  },
  {
    id: 'japandi-lamp-01',
    name: 'Paper Floor Lamp',
    category: 'lighting',
    room_types: ['living_room', 'bedroom'],
    style_tags: ['japandi'],
    glb_path: 'assets/3d/furniture/ready/japandi_floor_lamp.glb',
    thumbnail_url: '',
    width: 0.46, depth: 0.46, height: 1.83,
    price_range: 'budget',
    colors: ['#F5F0E8'],
  },
  {
    id: 'japandi-pendant-01',
    name: 'Washi Pendant',
    category: 'lighting',
    room_types: ['dining_room', 'kitchen'],
    style_tags: ['japandi'],
    glb_path: 'assets/3d/furniture/ready/japandi_pendant_lamp.glb',
    thumbnail_url: '',
    width: 0.46, depth: 0.46, height: 0.61,
    price_range: 'budget',
    colors: ['#F5F0E8'],
  },
  {
    id: 'japandi-mirror-01',
    name: 'Arch Wood Mirror',
    category: 'decor',
    room_types: ['living_room', 'bedroom'],
    style_tags: ['japandi'],
    glb_path: 'assets/3d/furniture/ready/japandi_mirror.glb',
    thumbnail_url: '',
    width: 0.61, depth: 0.03, height: 0.91,
    price_range: 'mid',
    colors: ['#8B7355'],
  },
  {
    id: 'japandi-plant-01',
    name: 'Bonsai Plant',
    category: 'plants',
    room_types: ['living_room', 'bedroom', 'home_office'],
    style_tags: ['japandi'],
    glb_path: 'assets/3d/furniture/ready/japandi_plant_small.glb',
    thumbnail_url: '',
    width: 0.30, depth: 0.30, height: 0.46,
    price_range: 'budget',
    colors: [],
  },

  // ── Mid-Century ────────────────────────────────
  {
    id: 'mid-sofa-01',
    name: 'MCM Tufted Sofa',
    category: 'seating',
    room_types: ['living_room'],
    style_tags: ['mid_century'],
    glb_path: 'assets/3d/furniture/ready/midcentury_sofa.glb',
    thumbnail_url: '',
    width: 2.13, depth: 0.91, height: 0.91,
    price_range: 'premium',
    colors: ['#C47B3C', '#1B3A2D', '#8B7355'],
  },
  {
    id: 'mid-chair-01',
    name: 'Lounge Chair',
    category: 'seating',
    room_types: ['living_room', 'home_office'],
    style_tags: ['mid_century'],
    glb_path: 'assets/3d/furniture/ready/midcentury_eames_chair.glb',
    thumbnail_url: '',
    width: 0.91, depth: 0.91, height: 1.07,
    price_range: 'premium',
    colors: ['#5C3D1E', '#1B3A2D'],
  },
  {
    id: 'mid-dining-chair-01',
    name: 'MCM Dining Chair',
    category: 'seating',
    room_types: ['dining_room'],
    style_tags: ['mid_century'],
    glb_path: 'assets/3d/furniture/ready/midcentury_dining_chair.glb',
    thumbnail_url: '',
    width: 0.55, depth: 0.61, height: 0.91,
    price_range: 'mid',
    colors: ['#8B7355'],
  },
  {
    id: 'mid-ottoman-01',
    name: 'Round Ottoman',
    category: 'seating',
    room_types: ['living_room'],
    style_tags: ['mid_century'],
    glb_path: 'assets/3d/furniture/ready/midcentury_ottoman.glb',
    thumbnail_url: '',
    width: 0.76, depth: 0.76, height: 0.46,
    price_range: 'mid',
    colors: ['#C47B3C', '#8B7355'],
  },
  {
    id: 'mid-sideboard-01',
    name: 'Walnut Sideboard',
    category: 'storage',
    room_types: ['living_room', 'dining_room'],
    style_tags: ['mid_century'],
    glb_path: 'assets/3d/furniture/ready/midcentury_sideboard.glb',
    thumbnail_url: '',
    width: 1.52, depth: 0.46, height: 0.91,
    price_range: 'premium',
    colors: ['#5C3D1E', '#8B7355'],
  },
  {
    id: 'mid-lamp-01',
    name: 'Arc Floor Lamp',
    category: 'lighting',
    room_types: ['living_room', 'bedroom'],
    style_tags: ['mid_century'],
    glb_path: 'assets/3d/furniture/ready/midcentury_floor_lamp.glb',
    thumbnail_url: '',
    width: 0.61, depth: 0.61, height: 2.13,
    price_range: 'mid',
    colors: ['#C47B3C', '#5C3D1E'],
  },
  {
    id: 'mid-pendant-01',
    name: 'Sputnik Pendant',
    category: 'lighting',
    room_types: ['dining_room', 'living_room'],
    style_tags: ['mid_century'],
    glb_path: 'assets/3d/furniture/ready/midcentury_pendant_lamp.glb',
    thumbnail_url: '',
    width: 0.61, depth: 0.61, height: 0.61,
    price_range: 'mid',
    colors: ['#C47B3C'],
  },
  {
    id: 'mid-table-lamp-01',
    name: 'Ceramic Table Lamp',
    category: 'lighting',
    room_types: ['bedroom', 'living_room'],
    style_tags: ['mid_century'],
    glb_path: 'assets/3d/furniture/ready/midcentury_table_lamp.glb',
    thumbnail_url: '',
    width: 0.30, depth: 0.30, height: 0.61,
    price_range: 'budget',
    colors: ['#C47B3C'],
  },
  {
    id: 'mid-rug-01',
    name: 'Geometric Rug',
    category: 'decor',
    room_types: ['living_room', 'dining_room'],
    style_tags: ['mid_century'],
    glb_path: 'assets/3d/furniture/ready/midcentury_rug.glb',
    thumbnail_url: '',
    width: 2.44, depth: 1.83, height: 0.02,
    price_range: 'mid',
    colors: ['#C47B3C', '#1B3A2D', '#8B7355'],
  },

  // ── Minimalist ──────────────────────────────────
  {
    id: 'min-sofa-01',
    name: 'Clean Line Sofa',
    category: 'seating',
    room_types: ['living_room'],
    style_tags: ['minimalist'],
    glb_path: 'assets/3d/furniture/ready/industrial_sofa.glb',
    thumbnail_url: '',
    width: 2.13, depth: 0.91, height: 0.85,
    price_range: 'mid',
    colors: ['#E8E8E8', '#D0D0D0', '#1A1A1A'],
  },
  {
    id: 'min-coffee-01',
    name: 'Minimal Coffee Table',
    category: 'tables',
    room_types: ['living_room'],
    style_tags: ['minimalist'],
    glb_path: 'assets/3d/furniture/ready/industrial_coffee_table.glb',
    thumbnail_url: '',
    width: 1.22, depth: 0.61, height: 0.46,
    price_range: 'mid',
    colors: ['#1A1A1A', '#E8E8E8'],
  },
  {
    id: 'min-floor-lamp-01',
    name: 'Minimal Arc Lamp',
    category: 'lighting',
    room_types: ['living_room', 'bedroom', 'home_office'],
    style_tags: ['minimalist'],
    glb_path: 'assets/3d/furniture/ready/industrial_floor_lamp.glb',
    thumbnail_url: '',
    width: 0.46, depth: 0.46, height: 2.13,
    price_range: 'budget',
    colors: ['#1A1A1A', '#E8E8E8'],
  },
  {
    id: 'min-pendant-01',
    name: 'Minimal Pendant Light',
    category: 'lighting',
    room_types: ['dining_room', 'kitchen', 'home_office'],
    style_tags: ['minimalist'],
    glb_path: 'assets/3d/furniture/ready/industrial_pendant_lamp.glb',
    thumbnail_url: '',
    width: 0.46, depth: 0.46, height: 0.61,
    price_range: 'budget',
    colors: ['#1A1A1A'],
  },
  {
    id: 'min-shelf-01',
    name: 'Floating Wall Shelf',
    category: 'storage',
    room_types: ['living_room', 'home_office', 'bedroom'],
    style_tags: ['minimalist'],
    glb_path: 'assets/3d/furniture/ready/industrial_pipe_shelf.glb',
    thumbnail_url: '',
    width: 0.91, depth: 0.30, height: 0.09,
    price_range: 'budget',
    colors: ['#1A1A1A', '#E8E8E8'],
  },
  {
    id: 'min-rug-01',
    name: 'Solid Neutral Rug',
    category: 'decor',
    room_types: ['living_room', 'bedroom'],
    style_tags: ['minimalist'],
    glb_path: 'assets/3d/furniture/ready/industrial_rug.glb',
    thumbnail_url: '',
    width: 2.44, depth: 1.83, height: 0.02,
    price_range: 'budget',
    colors: ['#D0D0D0', '#E8E8E8', '#1A1A1A'],
  },
  {
    id: 'min-table-lamp-01',
    name: 'Minimal Table Lamp',
    category: 'lighting',
    room_types: ['bedroom', 'home_office'],
    style_tags: ['minimalist'],
    glb_path: 'assets/3d/furniture/ready/industrial_table_lamp.glb',
    thumbnail_url: '',
    width: 0.30, depth: 0.30, height: 0.61,
    price_range: 'budget',
    colors: ['#1A1A1A', '#E8E8E8'],
  },
  {
    id: 'min-plant-01',
    name: 'Structural Cactus',
    category: 'plants',
    room_types: ['living_room', 'home_office', 'bedroom'],
    style_tags: ['minimalist'],
    glb_path: 'assets/3d/furniture/ready/industrial_cactus.glb',
    thumbnail_url: '',
    width: 0.30, depth: 0.30, height: 0.91,
    price_range: 'budget',
    colors: [],
  },

  // ── Bohemian (additional) ──────────────────────
  {
    id: 'boho-cushions-01',
    name: 'Floor Cushion Set',
    category: 'seating',
    room_types: ['living_room', 'bedroom'],
    style_tags: ['bohemian'],
    glb_path: 'assets/3d/furniture/ready/boho_floor_cushions.glb',
    thumbnail_url: '',
    width: 0.91, depth: 0.91, height: 0.15,
    price_range: 'budget',
    colors: ['#C47B3C', '#8B4513', '#1B3A2D'],
  },

  // ── Shared ─────────────────────────────────────
  {
    id: 'plant-fiddle-01',
    name: 'Fiddle Leaf Fig',
    category: 'plants',
    room_types: ['living_room', 'bedroom', 'dining_room', 'home_office'],
    style_tags: ['coastal', 'bohemian', 'japandi', 'minimalist'],
    glb_path: 'assets/3d/furniture/ready/plant_fiddle_leaf.glb',
    thumbnail_url: '',
    width: 0.61, depth: 0.61, height: 1.83,
    price_range: 'budget',
    colors: [],
  },
];

// ── Style Palette (BoxRoom §10.3) ─────────────────

export const STYLE_PALETTE: Record<StyleName, { floor: string; walls: string; ceiling: string; trim: string; emissive: string }> = {
  coastal:     { floor: '#C8B89A', walls: '#E8DFD0', ceiling: '#F5F0E8', trim: '#FFFFFF', emissive: '#FFF8F0' },
  japandi:     { floor: '#8B7355', walls: '#D4CAB8', ceiling: '#EDE8DF', trim: '#F0EDE6', emissive: '#FFFAF5' },
  bohemian:    { floor: '#A0785A', walls: '#D4B896', ceiling: '#E8D5B7', trim: '#C8A882', emissive: '#FFF5E8' },
  mid_century: { floor: '#8B6914', walls: '#C8A870', ceiling: '#E8D098', trim: '#5C3D1E', emissive: '#FFF0D0' },
  minimalist:  { floor: '#D0D0D0', walls: '#E8E8E8', ceiling: '#F5F5F5', trim: '#FFFFFF', emissive: '#FFFFFF' },
};

// ── Helpers ──────────────────────────────────────

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

// ── Placement Algorithms ──────────────────────────
// Each returns a positioned FurniturePiece[] for the given room dimensions.
// Positions are in metres, centred on room origin (0,0). Y is always 0 (floor).

function makePiece(id: string, catalogId: string, x: number, z: number, rotationY = 0): FurniturePiece {
  const item = FURNITURE_CATALOG.find((c) => c.id === catalogId);
  if (!item) {
    // Fallback: return minimal piece (caller should always pass valid IDs)
    return { id, catalog_id: catalogId, name: '', category: 'decor', glb_path: '', position: { x, y: 0 }, rotation_y: rotationY, scale: 1, color_override: null, width: 0.5, depth: 0.5, height: 0.5 };
  }
  return {
    id,
    catalog_id: catalogId,
    name: item.name,
    category: item.category,
    glb_path: item.glb_path,
    position: { x, y: 0 },
    rotation_y: rotationY,
    scale: 1,
    color_override: null,
    width: item.width,
    depth: item.depth,
    height: item.height,
  };
}

export function placeFurnitureCoastal(w: number, d: number): FurniturePiece[] {
  // Sofa against back wall, coffee table in front, chairs flanking, rug centred, lamp in corner, plant near window
  const pieces: FurniturePiece[] = [];
  const sofaZ = -(d / 2 - 0.55);
  pieces.push(makePiece('coastal-sofa', 'coastal-sofa-01', 0, sofaZ));
  pieces.push(makePiece('coastal-coffee', 'coastal-coffee-01', 0, sofaZ + 1.1));
  pieces.push(makePiece('coastal-chair-l', 'coastal-chair-01', -(w / 4), sofaZ + 0.8, 0.5));
  pieces.push(makePiece('coastal-chair-r', 'coastal-chair-01', w / 4, sofaZ + 0.8, -0.5));
  pieces.push(makePiece('coastal-rug', 'coastal-rug-01', 0, sofaZ + 0.9));
  pieces.push(makePiece('coastal-lamp', 'coastal-lamp-01', -(w / 2 - 0.4), sofaZ - 0.1));
  pieces.push(makePiece('coastal-plant', 'coastal-plant-01', w / 2 - 0.4, -(d / 2 - 0.4)));
  return pieces;
}

export function placeFurnitureJapandi(w: number, d: number): FurniturePiece[] {
  // Low sofa against back wall, round coffee table, single accent chair, minimal rug, floor lamp, bonsai on side table
  const pieces: FurniturePiece[] = [];
  const sofaZ = -(d / 2 - 0.5);
  pieces.push(makePiece('japandi-sofa', 'japandi-sofa-01', 0, sofaZ));
  pieces.push(makePiece('japandi-coffee', 'japandi-coffee-01', 0, sofaZ + 1.1));
  pieces.push(makePiece('japandi-chair', 'japandi-chair-01', w / 2 - 0.6, sofaZ + 0.6, -Math.PI / 4));
  pieces.push(makePiece('japandi-side', 'japandi-side-01', w / 2 - 0.4, sofaZ - 0.1));
  pieces.push(makePiece('japandi-plant', 'japandi-plant-01', w / 2 - 0.4, sofaZ - 0.1 - 0.2));
  pieces.push(makePiece('japandi-rug', 'japandi-rug-01', 0, sofaZ + 0.9));
  pieces.push(makePiece('japandi-lamp', 'japandi-lamp-01', -(w / 2 - 0.35), sofaZ - 0.1));
  return pieces;
}

export function placeFurnitureBohemian(w: number, d: number): FurniturePiece[] {
  // Boho sofa + floor cushions for layered seating, large rug, trailing plant in corner, floor lamp, mirror on side wall
  const pieces: FurniturePiece[] = [];
  const sofaZ = -(d / 2 - 0.55);
  pieces.push(makePiece('boho-sofa', 'boho-sofa-01', 0, sofaZ));
  pieces.push(makePiece('boho-cushions', 'boho-cushions-01', -0.5, sofaZ + 1.2));
  pieces.push(makePiece('boho-chair', 'boho-chair-01', w / 2 - 0.6, sofaZ + 0.8, -Math.PI / 6));
  pieces.push(makePiece('boho-rug', 'boho-rug-01', 0, sofaZ + 0.9));
  pieces.push(makePiece('boho-plant', 'boho-plant-01', -(w / 2 - 0.35), sofaZ + 1.0));
  pieces.push(makePiece('boho-lamp', 'boho-floor-lamp-01', w / 2 - 0.35, sofaZ - 0.1));
  pieces.push(makePiece('plant-fiddle', 'plant-fiddle-01', -(w / 2 - 0.4), -(d / 2 - 0.4)));
  return pieces;
}

export function placeFurnitureMidCentury(w: number, d: number): FurniturePiece[] {
  // Tufted sofa against back wall, ottoman as coffee table, lounge chair with ottoman, sideboard on side wall, arc lamp behind sofa
  const pieces: FurniturePiece[] = [];
  const sofaZ = -(d / 2 - 0.55);
  pieces.push(makePiece('mid-sofa', 'mid-sofa-01', 0, sofaZ));
  pieces.push(makePiece('mid-ottoman', 'mid-ottoman-01', 0, sofaZ + 1.0));
  pieces.push(makePiece('mid-chair', 'mid-chair-01', w / 2 - 0.65, sofaZ + 0.7, -Math.PI / 4));
  pieces.push(makePiece('mid-sideboard', 'mid-sideboard-01', -(w / 2 - 0.85), 0, 0));
  pieces.push(makePiece('mid-rug', 'mid-rug-01', 0, sofaZ + 0.9));
  pieces.push(makePiece('mid-lamp', 'mid-lamp-01', w / 2 - 0.4, sofaZ - 0.1));
  pieces.push(makePiece('mid-table-lamp', 'mid-table-lamp-01', -(w / 2 - 0.85), -0.2));
  return pieces;
}

export function placeFurnitureMinimalist(w: number, d: number): FurniturePiece[] {
  // Clean line sofa, minimal coffee table, single arc lamp, solid rug, small cactus
  const pieces: FurniturePiece[] = [];
  const sofaZ = -(d / 2 - 0.55);
  pieces.push(makePiece('min-sofa', 'min-sofa-01', 0, sofaZ));
  pieces.push(makePiece('min-coffee', 'min-coffee-01', 0, sofaZ + 1.0));
  pieces.push(makePiece('min-rug', 'min-rug-01', 0, sofaZ + 0.9));
  pieces.push(makePiece('min-lamp', 'min-floor-lamp-01', -(w / 2 - 0.35), sofaZ - 0.1));
  pieces.push(makePiece('min-plant', 'min-plant-01', w / 2 - 0.35, sofaZ + 1.2));
  return pieces;
}

export function getPlacementForStyle(
  styleBlend: StyleBlend,
  roomWidth: number,
  roomDepth: number,
): FurniturePiece[] {
  // Find dominant style
  const dominant = (Object.entries(styleBlend) as [StyleName, number][])
    .sort(([, a], [, b]) => b - a)[0]?.[0] ?? 'minimalist';

  switch (dominant) {
    case 'coastal':     return placeFurnitureCoastal(roomWidth, roomDepth);
    case 'japandi':     return placeFurnitureJapandi(roomWidth, roomDepth);
    case 'bohemian':    return placeFurnitureBohemian(roomWidth, roomDepth);
    case 'mid_century': return placeFurnitureMidCentury(roomWidth, roomDepth);
    case 'minimalist':
    default:            return placeFurnitureMinimalist(roomWidth, roomDepth);
  }
}

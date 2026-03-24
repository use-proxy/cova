// ── Enums & Primitives ───────────────────────────

export type RoomType =
  | 'living_room'
  | 'bedroom'
  | 'dining_room'
  | 'home_office'
  | 'kitchen'
  | 'bathroom'
  | 'entryway';

export type StyleName =
  | 'coastal'
  | 'japandi'
  | 'bohemian'
  | 'mid_century'
  | 'minimalist';

export type StyleBlend = Record<StyleName, number>;

export type FurnitureCategory =
  | 'seating'
  | 'tables'
  | 'lighting'
  | 'storage'
  | 'decor'
  | 'plants'
  | 'beds';

export interface RoomDimensions {
  width: number;
  depth: number;
  height: number;
  unit: 'ft' | 'm';
}

// ── Core Models ──────────────────────────────────

export interface User {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  style_blend: StyleBlend | null;
  token_balance: number;
  account_type: 'consumer' | 'realtor';
  tokens_enabled: boolean;
}

export interface Room {
  id: string;
  user_id: string;
  name: string;
  room_type: RoomType;
  style_blend: StyleBlend;
  dimensions: RoomDimensions;
  budget: number;
  status: 'active' | 'archived';
  render_count: number;
  latest_render_url: string | null;
  original_image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface FurniturePiece {
  id: string;
  catalog_id: string;
  name: string;
  category: FurnitureCategory;
  glb_path: string;
  position: { x: number; y: number };
  rotation_y: number;
  scale: number;
  color_override: string | null;
  width: number;
  depth: number;
  height: number;
}

export interface FurnitureCatalogItem {
  id: string;
  name: string;
  category: FurnitureCategory;
  room_types: RoomType[];
  style_tags: StyleName[];
  glb_path: string;
  thumbnail_url: string;
  width: number;
  depth: number;
  height: number;
  price_range: 'budget' | 'mid' | 'premium' | 'luxury';
  colors: string[];
}

// ── Product & Commerce ───────────────────────────

export interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  retailer: string;
  affiliate_url: string;
  category: FurnitureCategory;
  room_types: RoomType[];
  style_tags: StyleName[];
  image_url: string;
  width_inches: number | null;
  depth_inches: number | null;
  height_inches: number | null;
}

export interface CartItem {
  id: string;
  product: Product;
  quantity: number;
  added_at: string;
}

// ── RoomPlan LiDAR Types ─────────────────────────

export interface RoomPlanDoor {
  x: number;
  z: number;
  width: number;
  wallSide: 'front' | 'back' | 'left' | 'right';
}

export interface RoomPlanWindow {
  x: number;
  z: number;
  width: number;
  height: number;
  wallSide: 'front' | 'back' | 'left' | 'right';
}

export interface RoomPlanResult {
  width: number;           // metres
  depth: number;           // metres
  height: number;          // metres
  doors: RoomPlanDoor[];
  windows: RoomPlanWindow[];
  thumbnailBase64: string; // JPEG screenshot
}

// ── Render & Chat ────────────────────────────────

export interface Render {
  id: string;
  room_id: string;
  user_id: string;
  image_url: string | null;
  prompt_used: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  tokens_charged: number;
  style_applied: string | null;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  room_id: string;
  role: 'user' | 'assistant';
  content: string;
  image_url: string | null;
  tap_x: number | null;
  tap_y: number | null;
  created_at: string;
}

// ── Onboarding ───────────────────────────────────

export interface SwipeCard {
  id: string;
  image_url: string;
  room_type: RoomType;
  style_weights: Partial<StyleBlend>;
  active: boolean;
}

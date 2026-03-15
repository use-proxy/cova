// ── Core User Types ───────────────────────────────

export interface User {
  id: string;
  email: string;
  full_name: string | null;
  account_type: 'consumer' | 'realtor';
  style_fingerprint: StyleFingerprint;
  budget_dna: BudgetDNA;
  token_balance: number;
  onboarding_completed: boolean;
  stripe_customer_id: string | null;
  created_at: string;
}

export interface StyleFingerprint {
  top_styles: string[];
  density_preference: number; // 1=minimal, 3=maximalist
  color_palette: string[]; // hex values
  material_preference: string[];
  price_tier: 'budget' | 'mid' | 'premium';
  swipe_count: number;
}

export interface BudgetDNA {
  total_room_budget: number;
  preferred_price_tier: 'budget' | 'mid' | 'premium';
  spend_history: number[];
  price_alerts_enabled: boolean;
}

// ── Room & Render Types ───────────────────────────

export interface Room {
  id: string;
  user_id: string;
  original_image_url: string;
  depth_map_url: string | null;
  depth_map_quality_score: number | null;
  detected_existing_style: string | null;
  room_type:
    | 'living_room'
    | 'bedroom'
    | 'kitchen'
    | 'bathroom'
    | 'office'
    | 'dining';
  // 3D calibration data
  calibration_data: RoomCalibration | null;
  room_dimensions: RoomDimensions | null;
  listing_id: string | null;
  created_at: string;
}

export interface RoomCalibration {
  corner_tl: { x: number; y: number };
  corner_tr: { x: number; y: number };
  corner_bl: { x: number; y: number };
  corner_br: { x: number; y: number };
  floor_line_y: number;
  image_width: number;
  image_height: number;
}

export interface RoomDimensions {
  width_ft: number;
  depth_ft: number;
  height_ft: number;
}

export interface Render {
  id: string;
  room_id: string;
  user_id: string;
  style_applied: string;
  quality_tier: 'draft' | 'hd';
  image_url: string | null;
  status: 'processing' | 'complete' | 'failed' | 'quality_rejected';
  brisque_score: number | null;
  tokens_charged: number;
  created_at: string;
}

// ── 3D Scene Types ────────────────────────────────

export interface SceneState {
  style: CavaStyle;
  furniture: PlacedFurniture[];
  room_dimensions: RoomDimensions;
}

export interface PlacedFurniture {
  id: string;
  model_key: string; // key into FURNITURE_CATALOG
  position: [number, number, number];
  rotation_y: number; // radians
  style: CavaStyle;
}

export type CavaStyle =
  | 'japandi'
  | 'midcentury'
  | 'coastal'
  | 'industrial'
  | 'bohemian';

export interface FurnitureCatalogItem {
  key: string;
  name: string;
  category:
    | 'sofa'
    | 'chair'
    | 'table'
    | 'rug'
    | 'lamp'
    | 'plant'
    | 'shelf'
    | 'bed'
    | 'decor';
  styles: CavaStyle[];
  model_path: string; // path to .glb file
  dimensions: { w: number; d: number; h: number }; // in metres
  default_position: [number, number, number];
  default_rotation_y: number;
}

// ── Product & Commerce Types ──────────────────────

export interface Product {
  id: string;
  external_id: string;
  name: string;
  retailer: 'wayfair' | 'amazon' | 'ikea' | 'cb2';
  price: number;
  category: string;
  image_url: string;
  affiliate_url_base: string;
  price_tier: 'budget' | 'mid' | 'premium';
  in_stock: boolean;
}

export const TOKEN_COSTS = {
  render_draft: 2,
  render_hd: 3,
  inpaint: 2,
  product_match: 1,
  scene_export: 0,
} as const;

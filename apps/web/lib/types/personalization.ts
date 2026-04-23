// V3 Personalization Manifest — schema v2.0
// Written by /design/step-7p. Consumed by the redesign Modal service
// and the art-compositing service.

export interface ArtPosterSlot {
  layout: "single" | "pair" | "triptych" | "gallery" | "salon";
  source: "upload" | "describe" | "suggest";
  images: Array<{
    url: string;
    approved: boolean;
    description?: string;
    generated?: boolean;
  }>;
  frame_style: "black" | "natural_wood" | "white" | "gold" | "frameless";
}

export interface SmartProductItem {
  type: string;
  size?: "compact" | "standard" | "large";
  brand_preference?: string;
  room_context: string;
}

export interface SpecificItem {
  product_name: string;
  product_image_url: string;
  product_url: string;
  retailer?: string;
  price?: number;
}

export interface LightingMoodSlot {
  mood: "warm_cozy" | "bright_natural" | "dramatic_moody";
  natural_artificial_balance?: "natural_only" | "mixed" | "artificial";
  time_of_day?: "morning" | "afternoon" | "evening" | "night";
}

export interface IdentityObject {
  type:
    | "sneakers"
    | "vinyl"
    | "books"
    | "plants"
    | "guitar"
    | "camera"
    | "candles"
    | "gaming"
    | "coffee"
    | "sports"
    | "art_supplies"
    | "fitness";
  quantity?: "few" | "many" | "extensive";
  display_style?: string;
}

export interface FreeTextSlot {
  raw_text: string;
  parsed_signals: Array<{
    type: string;
    description: string;
    priority: "high" | "medium" | "low";
  }>;
  confirmed: boolean;
}

export interface CompiledManifestBlock {
  pass1_additions: string[];
  pass2_additions: string[];
  pass3_lighting: string;
  art_compositing_required: boolean;
  compiled_at: string;
}

export interface PersonalizationManifest {
  version: "2.0";
  schema_version: 2;
  created_at: string;
  room_type: string;
  art?: ArtPosterSlot;
  smart_products?: SmartProductItem[];
  specific_items?: SpecificItem[];
  lighting?: LightingMoodSlot;
  identity_objects?: IdentityObject[];
  freetext?: FreeTextSlot;
  _compiled?: CompiledManifestBlock;
}

export function validateManifest(
  manifest: unknown,
): manifest is PersonalizationManifest {
  if (!manifest || typeof manifest !== "object") return false;
  const m = manifest as Record<string, unknown>;
  return m.version === "2.0" && m.schema_version === 2;
}

export function emptyManifest(roomType: string): PersonalizationManifest {
  return {
    version: "2.0",
    schema_version: 2,
    created_at: new Date().toISOString(),
    room_type: roomType,
  };
}

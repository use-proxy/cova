export interface RawProduct {
  name: string
  price: number
  currency: 'USD'
  image_url: string
  product_url: string
  retailer: RetailerSlug
  raw_category: string
  raw_description: string
  raw_material?: string
  raw_dimensions?: string
  raw_color?: string
  scraped_at: string
}

export type RetailerSlug =
  | 'wayfair' | 'amazon' | 'ikea' | 'west_elm' | 'crate_barrel'
  | 'cb2' | 'article' | 'target' | 'best_buy' | 'bh'
  | 'burrow' | 'floyd' | 'maiden_home'

export type ProductCategory =
  | 'sofa' | 'sectional' | 'loveseat' | 'chaise' | 'accent_chair' | 'recliner'
  | 'bed_frame' | 'headboard' | 'mattress' | 'daybed'
  | 'dining_table' | 'dining_chair' | 'bar_stool' | 'bench'
  | 'desk' | 'office_chair' | 'bookshelf' | 'filing_cabinet'
  | 'dresser' | 'wardrobe' | 'nightstand' | 'vanity'
  | 'coffee_table' | 'side_table' | 'console_table' | 'tv_stand'
  | 'floor_lamp' | 'table_lamp' | 'pendant_light' | 'chandelier'
  | 'ceiling_fan' | 'wall_sconce' | 'led_strip' | 'smart_lighting'
  | 'rug' | 'runner' | 'curtains' | 'blinds' | 'throw_pillow' | 'blanket'
  | 'wall_art' | 'mirror' | 'sculpture' | 'vase' | 'planter' | 'candle'
  | 'outdoor_sofa' | 'outdoor_chair' | 'outdoor_dining_table' | 'outdoor_dining_chair'
  | 'outdoor_lounge' | 'hammock' | 'umbrella' | 'outdoor_rug' | 'fire_pit' | 'planter_large'
  | 'tv' | 'soundbar' | 'smart_speaker' | 'smart_display' | 'smart_plug'
  | 'robot_vacuum' | 'air_purifier' | 'smart_thermostat' | 'security_camera'
  | 'other'

export type RoomType =
  | 'living_room' | 'bedroom' | 'home_office' | 'dining_room'
  | 'studio' | 'bathroom' | 'outdoor' | 'dorm' | 'first_apartment'

export type StyleTag =
  | 'modern' | 'traditional' | 'scandinavian' | 'industrial' | 'bohemian'
  | 'coastal' | 'minimalist' | 'maximalist' | 'japandi' | 'mid_century'
  | 'contemporary' | 'rustic' | 'glam' | 'transitional' | 'art_deco'
  | 'farmhouse' | 'eclectic' | 'mediterranean' | 'zen'

export interface NormalizedProduct {
  id: string
  name: string
  price: number
  retailer: RetailerSlug
  category: ProductCategory
  room_types: RoomType[]
  style_tags: StyleTag[]
  affiliate_url: string
  product_url: string
  image_url: string
  supabase_image_url: string
  clip_embedding_data: number[] | null
  in_stock: boolean
  commission_rate: number
  created_at: string
}

export interface RunState {
  started_at: string
  scraped_urls: string[]
  embedded_product_ids: string[]
  failed_product_urls: string[]
  showcase_completed: string[]
  total_scraped: number
  total_embedded: number
  total_failed: number
  apify_runs: string[]
}

export interface ScraperConfig {
  retailer: RetailerSlug
  actorId: string
  input: Record<string, unknown>
  maxItems: number
  label: string
}

export interface ApifyCreditStatus {
  remainingCredits: number
  usedCredits: number
  monthlyLimit: number
}

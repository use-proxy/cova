export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          auth_provider: string
          created_at: string
          last_active: string
        }
        Insert: {
          id?: string
          email: string
          auth_provider?: string
          created_at?: string
          last_active?: string
        }
        Update: {
          id?: string
          email?: string
          auth_provider?: string
          created_at?: string
          last_active?: string
        }
      }
      style_fingerprints: {
        Row: {
          id: string
          user_id: string
          vector_data: Json
          style_name: string | null
          room_type: string | null
          budget_tier: string | null
          quiz_responses: Json
          entry_path: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          vector_data?: Json
          style_name?: string | null
          room_type?: string | null
          budget_tier?: string | null
          quiz_responses?: Json
          entry_path?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          vector_data?: Json
          style_name?: string | null
          room_type?: string | null
          budget_tier?: string | null
          quiz_responses?: Json
          entry_path?: string | null
          created_at?: string
        }
      }
      rooms: {
        Row: {
          id: string
          user_id: string
          fingerprint_id: string | null
          original_photo_url: string | null
          depth_map_url: string | null
          render_url: string | null
          keep_mask: Json | null
          room_type: string | null
          dimensions: string | null
          constraints: string[] | null
          inclusions: string[] | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          fingerprint_id?: string | null
          original_photo_url?: string | null
          depth_map_url?: string | null
          render_url?: string | null
          keep_mask?: Json | null
          room_type?: string | null
          dimensions?: string | null
          constraints?: string[] | null
          inclusions?: string[] | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          fingerprint_id?: string | null
          original_photo_url?: string | null
          depth_map_url?: string | null
          render_url?: string | null
          keep_mask?: Json | null
          room_type?: string | null
          dimensions?: string | null
          constraints?: string[] | null
          inclusions?: string[] | null
          created_at?: string
        }
      }
      render_sessions: {
        Row: {
          id: string
          room_id: string
          render_url: string | null
          prompt: string | null
          style_strength: number | null
          iteration: number
          created_at: string
        }
        Insert: {
          id?: string
          room_id: string
          render_url?: string | null
          prompt?: string | null
          style_strength?: number | null
          iteration?: number
          created_at?: string
        }
        Update: {
          id?: string
          room_id?: string
          render_url?: string | null
          prompt?: string | null
          style_strength?: number | null
          iteration?: number
          created_at?: string
        }
      }
      products: {
        Row: {
          id: string
          external_id: string
          name: string
          retailer: string
          price: number
          currency: string
          category: string
          subcategory: string | null
          image_url: string
          affiliate_url_base: string
          affiliate_url: string | null
          clip_embedding: number[] | null
          clip_fusion_embedding: number[] | null
          style_tags: string[] | null
          room_types: string[]
          price_tier: string | null
          in_stock: boolean
          active: boolean
          width_inches: number | null
          depth_inches: number | null
          height_inches: number | null
          price_last_checked: string | null
          created_at: string
        }
        Insert: {
          id?: string
          external_id: string
          name: string
          retailer: string
          price: number
          currency?: string
          category: string
          subcategory?: string | null
          image_url: string
          affiliate_url_base: string
          affiliate_url?: string | null
          clip_embedding?: number[] | null
          clip_fusion_embedding?: number[] | null
          style_tags?: string[] | null
          room_types?: string[]
          price_tier?: string | null
          in_stock?: boolean
          active?: boolean
          width_inches?: number | null
          depth_inches?: number | null
          height_inches?: number | null
          price_last_checked?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          external_id?: string
          name?: string
          retailer?: string
          price?: number
          currency?: string
          category?: string
          subcategory?: string | null
          image_url?: string
          affiliate_url_base?: string
          affiliate_url?: string | null
          clip_embedding?: number[] | null
          clip_fusion_embedding?: number[] | null
          style_tags?: string[] | null
          room_types?: string[]
          price_tier?: string | null
          in_stock?: boolean
          active?: boolean
          width_inches?: number | null
          depth_inches?: number | null
          height_inches?: number | null
          price_last_checked?: string | null
          created_at?: string
        }
      }
      interactions: {
        Row: {
          id: string
          user_id: string | null
          room_id: string | null
          product_id: string | null
          action: string
          fingerprint_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          room_id?: string | null
          product_id?: string | null
          action: string
          fingerprint_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          room_id?: string | null
          product_id?: string | null
          action?: string
          fingerprint_id?: string | null
          created_at?: string
        }
      }
    }
    Views: Record<string, never>
    Functions: {
      search_products_by_embedding: {
        Args: {
          query_embedding: number[]
          match_threshold?: number
          match_count?: number
        }
        Returns: {
          id: string
          name: string
          retailer: string
          price: number
          category: string
          image_url: string
          affiliate_url: string
          style_tags: string[]
          room_types: string[]
          width_inches: number | null
          depth_inches: number | null
          height_inches: number | null
          similarity: number
        }[]
      }
      search_products_by_fusion_embedding: {
        Args: {
          query_embedding: number[]
          match_threshold?: number
          match_count?: number
        }
        Returns: {
          id: string
          name: string
          retailer: string
          price: number
          image_url: string
          affiliate_url: string
          category: string
          style_tags: string[]
          room_types: string[]
          similarity: number
        }[]
      }
    }
    Enums: {
      budget_tier: 'budget' | 'mid' | 'premium' | 'luxury'
      entry_path: 'pairs' | 'natural_language' | 'inspo_photo'
      interaction_action:
        | 'hotspot_tap'
        | 'product_view'
        | 'affiliate_click'
        | 'swap_initiated'
        | 'swap_completed'
        | 'purchase_confirmed'
        | 'regenerate'
        | 'refine'
        | 'add_item'
      room_dimensions: 'small' | 'medium' | 'large'
    }
  }
}

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

export type InsertTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']

export type UpdateTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']

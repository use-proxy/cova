export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      anchor_renders: {
        Row: {
          created_at: string | null
          id: string
          image_url: string
          label: string | null
          room_type: string
          style_weights: Json
        }
        Insert: {
          created_at?: string | null
          id?: string
          image_url: string
          label?: string | null
          room_type: string
          style_weights: Json
        }
        Update: {
          created_at?: string | null
          id?: string
          image_url?: string
          label?: string | null
          room_type?: string
          style_weights?: Json
        }
        Relationships: []
      }
      cart_items: {
        Row: {
          added_at: string
          id: string
          product_id: string
          quantity: number
          user_id: string
        }
        Insert: {
          added_at?: string
          id?: string
          product_id: string
          quantity?: number
          user_id: string
        }
        Update: {
          added_at?: string
          id?: string
          product_id?: string
          quantity?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          image_url: string | null
          role: string
          room_id: string
          tap_x: number | null
          tap_y: number | null
          tool_calls: Json | null
          tool_results: Json | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          image_url?: string | null
          role: string
          room_id: string
          tap_x?: number | null
          tap_y?: number | null
          tool_calls?: Json | null
          tool_results?: Json | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          image_url?: string | null
          role?: string
          room_id?: string
          tap_x?: number | null
          tap_y?: number | null
          tool_calls?: Json | null
          tool_results?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_sessions: {
        Row: {
          created_at: string
          id: string
          last_action_type: string | null
          messages: Json
          render_id: string | null
          room_id: string
          summary: string | null
          total_messages: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_action_type?: string | null
          messages?: Json
          render_id?: string | null
          room_id: string
          summary?: string | null
          total_messages?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_action_type?: string | null
          messages?: Json
          render_id?: string | null
          room_id?: string
          summary?: string | null
          total_messages?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_sessions_render_id_fkey"
            columns: ["render_id"]
            isOneToOne: false
            referencedRelation: "renders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_sessions_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      click_events: {
        Row: {
          affiliate_url: string
          created_at: string
          id: string
          product_id: string
          render_id: string | null
          retailer: string
          session_id: string | null
          user_id: string
        }
        Insert: {
          affiliate_url: string
          created_at?: string
          id?: string
          product_id: string
          render_id?: string | null
          retailer: string
          session_id?: string | null
          user_id: string
        }
        Update: {
          affiliate_url?: string
          created_at?: string
          id?: string
          product_id?: string
          render_id?: string | null
          retailer?: string
          session_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "click_events_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "click_events_render_id_fkey"
            columns: ["render_id"]
            isOneToOne: false
            referencedRelation: "renders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "click_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      furniture_placements: {
        Row: {
          color_override: string | null
          created_at: string
          furniture_catalog_id: string
          id: string
          position_x: number
          position_y: number
          room_id: string
          rotation_y: number
          scale: number
        }
        Insert: {
          color_override?: string | null
          created_at?: string
          furniture_catalog_id: string
          id?: string
          position_x?: number
          position_y?: number
          room_id: string
          rotation_y?: number
          scale?: number
        }
        Update: {
          color_override?: string | null
          created_at?: string
          furniture_catalog_id?: string
          id?: string
          position_x?: number
          position_y?: number
          room_id?: string
          rotation_y?: number
          scale?: number
        }
        Relationships: [
          {
            foreignKeyName: "furniture_placements_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      interactions: {
        Row: {
          action: string
          created_at: string
          fingerprint_id: string | null
          id: string
          product_id: string | null
          room_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          fingerprint_id?: string | null
          id?: string
          product_id?: string | null
          room_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          fingerprint_id?: string | null
          id?: string
          product_id?: string | null
          room_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interactions_fingerprint_id_fkey"
            columns: ["fingerprint_id"]
            isOneToOne: false
            referencedRelation: "style_fingerprints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          input_params: Json | null
          job_type: string
          replicate_id: string | null
          result_url: string | null
          status: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          input_params?: Json | null
          job_type: string
          replicate_id?: string | null
          result_url?: string | null
          status?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          input_params?: Json | null
          job_type?: string
          replicate_id?: string | null
          result_url?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          address: string
          created_at: string
          description: string | null
          id: string
          is_published: boolean
          qr_code_url: string | null
          realtor_id: string
          render_ids: string[] | null
          room_ids: string[] | null
          shareable_slug: string | null
          updated_at: string
          view_count: number
          vote_counts: Json | null
        }
        Insert: {
          address: string
          created_at?: string
          description?: string | null
          id?: string
          is_published?: boolean
          qr_code_url?: string | null
          realtor_id: string
          render_ids?: string[] | null
          room_ids?: string[] | null
          shareable_slug?: string | null
          updated_at?: string
          view_count?: number
          vote_counts?: Json | null
        }
        Update: {
          address?: string
          created_at?: string
          description?: string | null
          id?: string
          is_published?: boolean
          qr_code_url?: string | null
          realtor_id?: string
          render_ids?: string[] | null
          room_ids?: string[] | null
          shareable_slug?: string | null
          updated_at?: string
          view_count?: number
          vote_counts?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "listings_realtor_id_fkey"
            columns: ["realtor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      product_impressions: {
        Row: {
          clip_score: number | null
          id: string
          position_in_results: number | null
          product_id: string | null
          room_id: string | null
          room_style: string | null
          shown_at: string | null
          style_vector_at_time: Json | null
          user_id: string | null
        }
        Insert: {
          clip_score?: number | null
          id?: string
          position_in_results?: number | null
          product_id?: string | null
          room_id?: string | null
          room_style?: string | null
          shown_at?: string | null
          style_vector_at_time?: Json | null
          user_id?: string | null
        }
        Update: {
          clip_score?: number | null
          id?: string
          position_in_results?: number | null
          product_id?: string | null
          room_id?: string | null
          room_style?: string | null
          shown_at?: string | null
          style_vector_at_time?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_impressions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_impressions_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      product_interactions: {
        Row: {
          affiliate_retailer: string | null
          created_at: string | null
          id: string
          interaction_type: string | null
          price_at_time: number | null
          product_id: string | null
          room_id: string | null
          style_vector_at_time: Json | null
          token_cost: number | null
          user_id: string | null
        }
        Insert: {
          affiliate_retailer?: string | null
          created_at?: string | null
          id?: string
          interaction_type?: string | null
          price_at_time?: number | null
          product_id?: string | null
          room_id?: string | null
          style_vector_at_time?: Json | null
          token_cost?: number | null
          user_id?: string | null
        }
        Update: {
          affiliate_retailer?: string | null
          created_at?: string | null
          id?: string
          interaction_type?: string | null
          price_at_time?: number | null
          product_id?: string | null
          room_id?: string | null
          style_vector_at_time?: Json | null
          token_cost?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_interactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_interactions_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          affiliate_url: string | null
          clip_embedding_data: string | null
          commission_rate: number | null
          created_at: string | null
          dinov3_embedding: Json | null
          id: string
          image_url: string | null
          in_stock: boolean | null
          name: string
          price: number | null
          retailer: string | null
          room_types: string[] | null
          siglip2_embedding: Json | null
          style_tags: string[] | null
        }
        Insert: {
          affiliate_url?: string | null
          clip_embedding_data?: string | null
          commission_rate?: number | null
          created_at?: string | null
          dinov3_embedding?: Json | null
          id?: string
          image_url?: string | null
          in_stock?: boolean | null
          name: string
          price?: number | null
          retailer?: string | null
          room_types?: string[] | null
          siglip2_embedding?: Json | null
          style_tags?: string[] | null
        }
        Update: {
          affiliate_url?: string | null
          clip_embedding_data?: string | null
          commission_rate?: number | null
          created_at?: string | null
          dinov3_embedding?: Json | null
          id?: string
          image_url?: string | null
          in_stock?: boolean | null
          name?: string
          price?: number | null
          retailer?: string | null
          room_types?: string[] | null
          siglip2_embedding?: Json | null
          style_tags?: string[] | null
        }
        Relationships: []
      }
      products_v1: {
        Row: {
          active: boolean
          affiliate_url: string | null
          affiliate_url_base: string
          category: string
          clip_embedding: string | null
          clip_fusion_embedding: string | null
          created_at: string
          currency: string
          depth_inches: number | null
          description: string | null
          dimensions_m: Json | null
          external_id: string
          height_inches: number | null
          id: string
          image_url: string
          in_stock: boolean
          linked_product_id: string | null
          name: string
          price: number
          price_last_checked: string | null
          price_tier: string | null
          primary_style: string | null
          retailer: string
          room_types: string[]
          style_tags: string[] | null
          style_weights: Json | null
          subcategory: string | null
          width_inches: number | null
        }
        Insert: {
          active?: boolean
          affiliate_url?: string | null
          affiliate_url_base: string
          category: string
          clip_embedding?: string | null
          clip_fusion_embedding?: string | null
          created_at?: string
          currency?: string
          depth_inches?: number | null
          description?: string | null
          dimensions_m?: Json | null
          external_id: string
          height_inches?: number | null
          id?: string
          image_url: string
          in_stock?: boolean
          linked_product_id?: string | null
          name: string
          price: number
          price_last_checked?: string | null
          price_tier?: string | null
          primary_style?: string | null
          retailer: string
          room_types?: string[]
          style_tags?: string[] | null
          style_weights?: Json | null
          subcategory?: string | null
          width_inches?: number | null
        }
        Update: {
          active?: boolean
          affiliate_url?: string | null
          affiliate_url_base?: string
          category?: string
          clip_embedding?: string | null
          clip_fusion_embedding?: string | null
          created_at?: string
          currency?: string
          depth_inches?: number | null
          description?: string | null
          dimensions_m?: Json | null
          external_id?: string
          height_inches?: number | null
          id?: string
          image_url?: string
          in_stock?: boolean
          linked_product_id?: string | null
          name?: string
          price?: number
          price_last_checked?: string | null
          price_tier?: string | null
          primary_style?: string | null
          retailer?: string
          room_types?: string[]
          style_tags?: string[] | null
          style_weights?: Json | null
          subcategory?: string | null
          width_inches?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_linked_product_id_fkey"
            columns: ["linked_product_id"]
            isOneToOne: false
            referencedRelation: "products_v1"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_anchor_images: {
        Row: {
          created_at: string | null
          dominant_colors: string[]
          flux_prompt: string
          id: string
          image_url: string
          livability_score: number | null
          storage_path: string
          style_index: number
          style_name: string
          style_vector: Json
        }
        Insert: {
          created_at?: string | null
          dominant_colors: string[]
          flux_prompt: string
          id?: string
          image_url: string
          livability_score?: number | null
          storage_path: string
          style_index: number
          style_name: string
          style_vector: Json
        }
        Update: {
          created_at?: string | null
          dominant_colors?: string[]
          flux_prompt?: string
          id?: string
          image_url?: string
          livability_score?: number | null
          storage_path?: string
          style_index?: number
          style_name?: string
          style_vector?: Json
        }
        Relationships: []
      }
      quiz_comparison_pairs: {
        Row: {
          base_room_url: string | null
          created_at: string | null
          dimension: string
          dimension_index: number
          flux_prompt_a: string
          flux_prompt_b: string
          id: string
          image_a_stop: number
          image_a_storage_path: string
          image_a_url: string
          image_a_vector: Json
          image_b_stop: number
          image_b_storage_path: string
          image_b_url: string
          image_b_vector: Json
          is_validated: boolean | null
          livability_score_a: number | null
          livability_score_b: number | null
          pair_index: number
        }
        Insert: {
          base_room_url?: string | null
          created_at?: string | null
          dimension: string
          dimension_index: number
          flux_prompt_a: string
          flux_prompt_b: string
          id?: string
          image_a_stop: number
          image_a_storage_path: string
          image_a_url: string
          image_a_vector: Json
          image_b_stop: number
          image_b_storage_path: string
          image_b_url: string
          image_b_vector: Json
          is_validated?: boolean | null
          livability_score_a?: number | null
          livability_score_b?: number | null
          pair_index: number
        }
        Update: {
          base_room_url?: string | null
          created_at?: string | null
          dimension?: string
          dimension_index?: number
          flux_prompt_a?: string
          flux_prompt_b?: string
          id?: string
          image_a_stop?: number
          image_a_storage_path?: string
          image_a_url?: string
          image_a_vector?: Json
          image_b_stop?: number
          image_b_storage_path?: string
          image_b_url?: string
          image_b_vector?: Json
          is_validated?: boolean | null
          livability_score_a?: number | null
          livability_score_b?: number | null
          pair_index?: number
        }
        Relationships: []
      }
      rate_limit_events: {
        Row: {
          created_at: string
          endpoint: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          endpoint: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rate_limit_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          action: string
          id: string
          request_count: number
          user_id: string
          window_start: string
        }
        Insert: {
          action: string
          id?: string
          request_count?: number
          user_id: string
          window_start?: string
        }
        Update: {
          action?: string
          id?: string
          request_count?: number
          user_id?: string
          window_start?: string
        }
        Relationships: []
      }
      redesign_feedback: {
        Row: {
          created_at: string | null
          feedback_score: number | null
          hotspots_clicked: number | null
          id: string
          redesign_style: string | null
          room_id: string | null
          style_vector_at_time: Json | null
          time_spent_in_viewer_ms: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          feedback_score?: number | null
          hotspots_clicked?: number | null
          id?: string
          redesign_style?: string | null
          room_id?: string | null
          style_vector_at_time?: Json | null
          time_spent_in_viewer_ms?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          feedback_score?: number | null
          hotspots_clicked?: number | null
          id?: string
          redesign_style?: string | null
          room_id?: string | null
          style_vector_at_time?: Json | null
          time_spent_in_viewer_ms?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "redesign_feedback_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      render_sessions: {
        Row: {
          created_at: string
          id: string
          iteration: number
          parallax_video_url: string | null
          preview_url: string | null
          prompt: string | null
          render_url: string | null
          room_id: string
          style_strength: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          iteration?: number
          parallax_video_url?: string | null
          preview_url?: string | null
          prompt?: string | null
          render_url?: string | null
          room_id: string
          style_strength?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          iteration?: number
          parallax_video_url?: string | null
          preview_url?: string | null
          prompt?: string | null
          render_url?: string | null
          room_id?: string
          style_strength?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "render_sessions_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      renders: {
        Row: {
          brisque_score: number | null
          clip_style_score: number | null
          created_at: string
          denoising_strength: number | null
          design_rationale: string | null
          guidance_scale: number | null
          id: string
          image_url: string | null
          is_panoramic: boolean | null
          is_public: boolean | null
          marble_operation_id: string | null
          modal_job_id: string | null
          negative_prompt_used: string | null
          panoramic_prediction_id: string | null
          panoramic_url: string | null
          prompt_used: string | null
          quality_tier: string
          redesign_splat_url: string | null
          render_type: string
          replicate_prediction_id: string | null
          room_id: string
          seed: number | null
          splat_url: string | null
          status: string
          style_applied: string | null
          style_blend_ratio: number | null
          style_blend_secondary: string | null
          style_vector: number[] | null
          tokens_charged: number
          tokens_used: number
          user_id: string
        }
        Insert: {
          brisque_score?: number | null
          clip_style_score?: number | null
          created_at?: string
          denoising_strength?: number | null
          design_rationale?: string | null
          guidance_scale?: number | null
          id?: string
          image_url?: string | null
          is_panoramic?: boolean | null
          is_public?: boolean | null
          marble_operation_id?: string | null
          modal_job_id?: string | null
          negative_prompt_used?: string | null
          panoramic_prediction_id?: string | null
          panoramic_url?: string | null
          prompt_used?: string | null
          quality_tier?: string
          redesign_splat_url?: string | null
          render_type?: string
          replicate_prediction_id?: string | null
          room_id: string
          seed?: number | null
          splat_url?: string | null
          status?: string
          style_applied?: string | null
          style_blend_ratio?: number | null
          style_blend_secondary?: string | null
          style_vector?: number[] | null
          tokens_charged?: number
          tokens_used?: number
          user_id: string
        }
        Update: {
          brisque_score?: number | null
          clip_style_score?: number | null
          created_at?: string
          denoising_strength?: number | null
          design_rationale?: string | null
          guidance_scale?: number | null
          id?: string
          image_url?: string | null
          is_panoramic?: boolean | null
          is_public?: boolean | null
          marble_operation_id?: string | null
          modal_job_id?: string | null
          negative_prompt_used?: string | null
          panoramic_prediction_id?: string | null
          panoramic_url?: string | null
          prompt_used?: string | null
          quality_tier?: string
          redesign_splat_url?: string | null
          render_type?: string
          replicate_prediction_id?: string | null
          room_id?: string
          seed?: number | null
          splat_url?: string | null
          status?: string
          style_applied?: string | null
          style_blend_ratio?: number | null
          style_blend_secondary?: string | null
          style_vector?: number[] | null
          tokens_charged?: number
          tokens_used?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "renders_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      room_products: {
        Row: {
          azimuth_degrees: number | null
          created_at: string | null
          elevation_degrees: number | null
          furniture_description: string | null
          furniture_label: string
          hotspot_x: number | null
          hotspot_y: number | null
          id: string
          is_unlocked: boolean | null
          product_id: string
          rank: number
          room_id: string
          similarity_score: number | null
          visible_from_second: number | null
          visible_to_second: number | null
        }
        Insert: {
          azimuth_degrees?: number | null
          created_at?: string | null
          elevation_degrees?: number | null
          furniture_description?: string | null
          furniture_label: string
          hotspot_x?: number | null
          hotspot_y?: number | null
          id?: string
          is_unlocked?: boolean | null
          product_id: string
          rank?: number
          room_id: string
          similarity_score?: number | null
          visible_from_second?: number | null
          visible_to_second?: number | null
        }
        Update: {
          azimuth_degrees?: number | null
          created_at?: string | null
          elevation_degrees?: number | null
          furniture_description?: string | null
          furniture_label?: string
          hotspot_x?: number | null
          hotspot_y?: number | null
          id?: string
          is_unlocked?: boolean | null
          product_id?: string
          rank?: number
          room_id?: string
          similarity_score?: number | null
          visible_from_second?: number | null
          visible_to_second?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "room_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_products_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          budget: number
          calibration_data: Json | null
          capture_mode: string | null
          capture_photo_urls: Json | null
          constraints: string[] | null
          created_at: string
          depth_map_quality_score: number | null
          depth_map_url: string | null
          depth_map_url_v2: string | null
          design_step: number | null
          detected_existing_style: string | null
          detection_metadata: Json | null
          detection_status: string | null
          dimensions: string | null
          dimensions_json: Json
          engagement_seconds: number | null
          final_style_vector: Json | null
          fingerprint_id: string | null
          fixed_furniture: Json | null
          flythrough_duration_seconds: number | null
          flythrough_ready: boolean | null
          flythrough_video_url: string | null
          furniture_matches_count: number | null
          hotspot_timing: Json | null
          id: string
          inclusions: string[] | null
          inpainting_mask_url: string | null
          keep_mask: Json | null
          latest_render_url: string | null
          listing_id: string | null
          marble_mini_spz_url: string | null
          marble_mini_world_id: string | null
          marble_pano_url: string | null
          marble_plus_pano_url: string | null
          marble_plus_thumbnail_url: string | null
          marble_plus_world_id: string | null
          marble_spz_url: string | null
          marble_spz_url_100k: string | null
          marble_spz_url_500k: string | null
          marble_world_id: string | null
          modal_job_id: string | null
          name: string
          original_image_url: string | null
          original_photo_url: string | null
          parallax_video_url: string | null
          personalization: Json | null
          perspective_render_url: string | null
          pipeline_cost_log: Json | null
          pipeline_mode: string | null
          plus_completed_at: string | null
          plus_eligible: boolean | null
          plus_started_at: string | null
          plus_upgrade_ready: boolean | null
          pre_detection_result: Json | null
          preview_url: string | null
          redesign_pano_url: string | null
          redesign_splat_url: string | null
          redesign_status: string | null
          redesign_style: string | null
          render_context: Json | null
          render_count: number
          render_ready: boolean | null
          render_url: string | null
          room_analysis: Json | null
          room_constraints: Json | null
          room_context: Json | null
          room_dimensions: Json | null
          room_type: string | null
          scene_state: Json | null
          splat_path: string | null
          splat_url: string | null
          status: string
          style_blend: Json
          updated_at: string
          user_feedback_score: number | null
          user_id: string
          video_url: string | null
          wall_color_extracted: string | null
        }
        Insert: {
          budget?: number
          calibration_data?: Json | null
          capture_mode?: string | null
          capture_photo_urls?: Json | null
          constraints?: string[] | null
          created_at?: string
          depth_map_quality_score?: number | null
          depth_map_url?: string | null
          depth_map_url_v2?: string | null
          design_step?: number | null
          detected_existing_style?: string | null
          detection_metadata?: Json | null
          detection_status?: string | null
          dimensions?: string | null
          dimensions_json?: Json
          engagement_seconds?: number | null
          final_style_vector?: Json | null
          fingerprint_id?: string | null
          fixed_furniture?: Json | null
          flythrough_duration_seconds?: number | null
          flythrough_ready?: boolean | null
          flythrough_video_url?: string | null
          furniture_matches_count?: number | null
          hotspot_timing?: Json | null
          id?: string
          inclusions?: string[] | null
          inpainting_mask_url?: string | null
          keep_mask?: Json | null
          latest_render_url?: string | null
          listing_id?: string | null
          marble_mini_spz_url?: string | null
          marble_mini_world_id?: string | null
          marble_pano_url?: string | null
          marble_plus_pano_url?: string | null
          marble_plus_thumbnail_url?: string | null
          marble_plus_world_id?: string | null
          marble_spz_url?: string | null
          marble_spz_url_100k?: string | null
          marble_spz_url_500k?: string | null
          marble_world_id?: string | null
          modal_job_id?: string | null
          name?: string
          original_image_url?: string | null
          original_photo_url?: string | null
          parallax_video_url?: string | null
          personalization?: Json | null
          perspective_render_url?: string | null
          pipeline_cost_log?: Json | null
          pipeline_mode?: string | null
          plus_completed_at?: string | null
          plus_eligible?: boolean | null
          plus_started_at?: string | null
          plus_upgrade_ready?: boolean | null
          pre_detection_result?: Json | null
          preview_url?: string | null
          redesign_pano_url?: string | null
          redesign_splat_url?: string | null
          redesign_status?: string | null
          redesign_style?: string | null
          render_context?: Json | null
          render_count?: number
          render_ready?: boolean | null
          render_url?: string | null
          room_analysis?: Json | null
          room_constraints?: Json | null
          room_context?: Json | null
          room_dimensions?: Json | null
          room_type?: string | null
          scene_state?: Json | null
          splat_path?: string | null
          splat_url?: string | null
          status?: string
          style_blend?: Json
          updated_at?: string
          user_feedback_score?: number | null
          user_id: string
          video_url?: string | null
          wall_color_extracted?: string | null
        }
        Update: {
          budget?: number
          calibration_data?: Json | null
          capture_mode?: string | null
          capture_photo_urls?: Json | null
          constraints?: string[] | null
          created_at?: string
          depth_map_quality_score?: number | null
          depth_map_url?: string | null
          depth_map_url_v2?: string | null
          design_step?: number | null
          detected_existing_style?: string | null
          detection_metadata?: Json | null
          detection_status?: string | null
          dimensions?: string | null
          dimensions_json?: Json
          engagement_seconds?: number | null
          final_style_vector?: Json | null
          fingerprint_id?: string | null
          fixed_furniture?: Json | null
          flythrough_duration_seconds?: number | null
          flythrough_ready?: boolean | null
          flythrough_video_url?: string | null
          furniture_matches_count?: number | null
          hotspot_timing?: Json | null
          id?: string
          inclusions?: string[] | null
          inpainting_mask_url?: string | null
          keep_mask?: Json | null
          latest_render_url?: string | null
          listing_id?: string | null
          marble_mini_spz_url?: string | null
          marble_mini_world_id?: string | null
          marble_pano_url?: string | null
          marble_plus_pano_url?: string | null
          marble_plus_thumbnail_url?: string | null
          marble_plus_world_id?: string | null
          marble_spz_url?: string | null
          marble_spz_url_100k?: string | null
          marble_spz_url_500k?: string | null
          marble_world_id?: string | null
          modal_job_id?: string | null
          name?: string
          original_image_url?: string | null
          original_photo_url?: string | null
          parallax_video_url?: string | null
          personalization?: Json | null
          perspective_render_url?: string | null
          pipeline_cost_log?: Json | null
          pipeline_mode?: string | null
          plus_completed_at?: string | null
          plus_eligible?: boolean | null
          plus_started_at?: string | null
          plus_upgrade_ready?: boolean | null
          pre_detection_result?: Json | null
          preview_url?: string | null
          redesign_pano_url?: string | null
          redesign_splat_url?: string | null
          redesign_status?: string | null
          redesign_style?: string | null
          render_context?: Json | null
          render_count?: number
          render_ready?: boolean | null
          render_url?: string | null
          room_analysis?: Json | null
          room_constraints?: Json | null
          room_context?: Json | null
          room_dimensions?: Json | null
          room_type?: string | null
          scene_state?: Json | null
          splat_path?: string | null
          splat_url?: string | null
          status?: string
          style_blend?: Json
          updated_at?: string
          user_feedback_score?: number | null
          user_id?: string
          video_url?: string | null
          wall_color_extracted?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rooms_fingerprint_id_fkey"
            columns: ["fingerprint_id"]
            isOneToOne: false
            referencedRelation: "style_fingerprints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rooms_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      style_fingerprints: {
        Row: {
          budget_tier: string | null
          confidence: number
          covariance: Json
          created_at: string
          dimensions: Json
          entry_path: string | null
          id: string
          quiz_responses: Json
          room_type: string | null
          style_name: string | null
          user_id: string
          vector_data: Json
        }
        Insert: {
          budget_tier?: string | null
          confidence?: number
          covariance?: Json
          created_at?: string
          dimensions?: Json
          entry_path?: string | null
          id?: string
          quiz_responses?: Json
          room_type?: string | null
          style_name?: string | null
          user_id: string
          vector_data?: Json
        }
        Update: {
          budget_tier?: string | null
          confidence?: number
          covariance?: Json
          created_at?: string
          dimensions?: Json
          entry_path?: string | null
          id?: string
          quiz_responses?: Json
          room_type?: string | null
          style_name?: string | null
          user_id?: string
          vector_data?: Json
        }
        Relationships: [
          {
            foreignKeyName: "style_fingerprints_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      style_purchase_signals: {
        Row: {
          clip_score: number | null
          created_at: string | null
          id: string
          product_category: string | null
          product_id: string | null
          product_price: number | null
          product_retailer: string | null
          room_style: string | null
          signal_type: string | null
          style_vector: Json | null
          user_id: string | null
        }
        Insert: {
          clip_score?: number | null
          created_at?: string | null
          id?: string
          product_category?: string | null
          product_id?: string | null
          product_price?: number | null
          product_retailer?: string | null
          room_style?: string | null
          signal_type?: string | null
          style_vector?: Json | null
          user_id?: string | null
        }
        Update: {
          clip_score?: number | null
          created_at?: string | null
          id?: string
          product_category?: string | null
          product_id?: string | null
          product_price?: number | null
          product_retailer?: string | null
          room_style?: string | null
          signal_type?: string | null
          style_vector?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "style_purchase_signals_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_v1"
            referencedColumns: ["id"]
          },
        ]
      }
      swipe_history: {
        Row: {
          card_id: string
          card_image_url: string | null
          card_phase: string | null
          card_style: string | null
          created_at: string
          direction: string
          dwell_time_ms: number
          id: string
          score_awarded: number
          session_position: number | null
          style_vector_after: Json | null
          style_vector_before: Json | null
          user_id: string
        }
        Insert: {
          card_id: string
          card_image_url?: string | null
          card_phase?: string | null
          card_style?: string | null
          created_at?: string
          direction: string
          dwell_time_ms: number
          id?: string
          score_awarded: number
          session_position?: number | null
          style_vector_after?: Json | null
          style_vector_before?: Json | null
          user_id: string
        }
        Update: {
          card_id?: string
          card_image_url?: string | null
          card_phase?: string | null
          card_style?: string | null
          created_at?: string
          direction?: string
          dwell_time_ms?: number
          id?: string
          score_awarded?: number
          session_position?: number | null
          style_vector_after?: Json | null
          style_vector_before?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "swipe_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      token_transactions: {
        Row: {
          amount: number | null
          created_at: string
          delta: number
          description: string | null
          id: string
          reason: string
          render_id: string | null
          type: string | null
          user_id: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          delta: number
          description?: string | null
          id?: string
          reason: string
          render_id?: string | null
          type?: string | null
          user_id: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          delta?: number
          description?: string | null
          id?: string
          reason?: string
          render_id?: string | null
          type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "token_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_style_profiles: {
        Row: {
          category_affinity: Json | null
          dominant_style: string | null
          id: string
          last_updated_at: string | null
          preferred_retailers: string[] | null
          price_range_preference: Json | null
          products_purchased: number | null
          products_unlocked: number | null
          rooms_completed: number | null
          style_certainty: number | null
          style_vector: Json | null
          swipe_count: number | null
          user_id: string | null
        }
        Insert: {
          category_affinity?: Json | null
          dominant_style?: string | null
          id?: string
          last_updated_at?: string | null
          preferred_retailers?: string[] | null
          price_range_preference?: Json | null
          products_purchased?: number | null
          products_unlocked?: number | null
          rooms_completed?: number | null
          style_certainty?: number | null
          style_vector?: Json | null
          swipe_count?: number | null
          user_id?: string | null
        }
        Update: {
          category_affinity?: Json | null
          dominant_style?: string | null
          id?: string
          last_updated_at?: string | null
          preferred_retailers?: string[] | null
          price_range_preference?: Json | null
          products_purchased?: number | null
          products_unlocked?: number | null
          rooms_completed?: number | null
          style_certainty?: number | null
          style_vector?: Json | null
          swipe_count?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      users: {
        Row: {
          account_type: string
          auth_provider: string | null
          avatar_url: string | null
          budget_dna: Json
          created_at: string
          email: string
          full_name: string | null
          id: string
          last_active: string | null
          last_active_at: string | null
          onboarding_completed: boolean
          stripe_customer_id: string | null
          style_blend: Json | null
          style_fingerprint: Json
          token_balance: number
          tokens_enabled: boolean
        }
        Insert: {
          account_type?: string
          auth_provider?: string | null
          avatar_url?: string | null
          budget_dna?: Json
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          last_active?: string | null
          last_active_at?: string | null
          onboarding_completed?: boolean
          stripe_customer_id?: string | null
          style_blend?: Json | null
          style_fingerprint?: Json
          token_balance?: number
          tokens_enabled?: boolean
        }
        Update: {
          account_type?: string
          auth_provider?: string | null
          avatar_url?: string | null
          budget_dna?: Json
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          last_active?: string | null
          last_active_at?: string | null
          onboarding_completed?: boolean
          stripe_customer_id?: string | null
          style_blend?: Json | null
          style_fingerprint?: Json
          token_balance?: number
          tokens_enabled?: boolean
        }
        Relationships: []
      }
      votes: {
        Row: {
          created_at: string
          device_fingerprint: string
          id: string
          listing_id: string
          render_id: string
        }
        Insert: {
          created_at?: string
          device_fingerprint: string
          id?: string
          listing_id: string
          render_id: string
        }
        Update: {
          created_at?: string
          device_fingerprint?: string
          id?: string
          listing_id?: string
          render_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "votes_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "votes_render_id_fkey"
            columns: ["render_id"]
            isOneToOne: false
            referencedRelation: "renders"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_rate_limit: {
        Args: {
          p_action: string
          p_max_requests: number
          p_user_id: string
          p_window_minutes?: number
        }
        Returns: boolean
      }
      cleanup_rate_limits: { Args: never; Returns: undefined }
      deduct_tokens_atomic: {
        Args: {
          p_amount: number
          p_reason: string
          p_render_id?: string
          p_user_id: string
        }
        Returns: boolean
      }
      increment_rooms_render_count: {
        Args: { room_id: string }
        Returns: undefined
      }
      search_products_by_embedding: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          affiliate_url: string
          category: string
          id: string
          image_url: string
          name: string
          price: number
          retailer: string
          room_types: string[]
          similarity: number
          style_tags: string[]
        }[]
      }
      search_products_by_fusion_embedding: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          affiliate_url: string
          category: string
          id: string
          image_url: string
          name: string
          price: number
          retailer: string
          room_types: string[]
          similarity: number
          style_tags: string[]
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

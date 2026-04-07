import { describe, it, expect } from 'vitest'
import type {
  Database,
  Tables,
  InsertTables,
  UpdateTables,
} from '@/types/supabase'

describe('Supabase Type Definitions', () => {
  describe('Database type structure', () => {
    it('defines all 7 required COVA V1 tables', () => {
      type TableNames = keyof Database['public']['Tables']
      const requiredTables: TableNames[] = [
        'users',
        'style_fingerprints',
        'rooms',
        'render_sessions',
        'products',
        'interactions',
        'style_references',
      ]
      expect(requiredTables).toHaveLength(7)
    })

    it('users table has all required columns', () => {
      type UserRow = Tables<'users'>
      const mockUser: UserRow = {
        id: 'uuid-here',
        email: 'test@example.com',
        auth_provider: 'google',
        created_at: new Date().toISOString(),
        last_active: new Date().toISOString(),
      }
      expect(mockUser.id).toBeDefined()
      expect(mockUser.email).toBeDefined()
      expect(mockUser.auth_provider).toBeDefined()
      expect(mockUser.created_at).toBeDefined()
      expect(mockUser.last_active).toBeDefined()
    })

    it('style_fingerprints table has all required columns', () => {
      type FingerprintRow = Tables<'style_fingerprints'>
      const mockFingerprint: FingerprintRow = {
        id: 'uuid-here',
        user_id: 'user-uuid',
        dimensions: { luminosity: 0.4, density: -0.4, temperature: 0.6, form: 0.2, era: -0.2, texture: 0.4, scale: 0.0, nature: 0.0, saturation: 0.0, materialOrigin: 0.0 },
        covariance: Array(10).fill(Array(10).fill(0)),
        confidence: 0.8,
        style_name: 'Warm Japandi',
        room_type: 'living_room',
        budget_tier: 'mid',
        quiz_responses: [],
        entry_path: 'pairs',
        created_at: new Date().toISOString(),
      }
      expect(mockFingerprint.dimensions).toBeDefined()
      expect(mockFingerprint.style_name).toBeDefined()
    })

    it('rooms table has all required columns', () => {
      type RoomRow = Tables<'rooms'>
      const mockRoom: RoomRow = {
        id: 'uuid-here',
        user_id: 'user-uuid',
        fingerprint_id: null,
        original_photo_url: null,
        depth_map_url: null,
        render_url: null,
        keep_mask: null,
        room_analysis: null,
        room_type: 'living_room',
        dimensions: 'medium',
        constraints: null,
        inclusions: null,
        pipeline_cost_log: null,
        preview_url: null,
        parallax_video_url: null,
        created_at: new Date().toISOString(),
      }
      expect(mockRoom.keep_mask).toBeNull()
      expect(mockRoom.constraints).toBeNull()
      expect(mockRoom.inclusions).toBeNull()
    })

    it('render_sessions table has all required columns', () => {
      type RenderSessionRow = Tables<'render_sessions'>
      const mockSession: RenderSessionRow = {
        id: 'uuid-here',
        room_id: 'room-uuid',
        render_url: 'https://example.com/render.jpg',
        parallax_video_url: null,
        preview_url: null,
        prompt: 'test prompt',
        style_strength: 0.85,
        iteration: 1,
        created_at: new Date().toISOString(),
      }
      expect(mockSession.iteration).toBe(1)
      expect(mockSession.style_strength).toBe(0.85)
    })

    it('products table has all required columns', () => {
      type ProductRow = Tables<'products'>
      const mockProduct: ProductRow = {
        id: 'uuid-here',
        external_id: 'ext-123',
        name: 'Test Sofa',
        retailer: 'article',
        price: 1200,
        currency: 'USD',
        category: 'seating',
        subcategory: null,
        affiliate_url_base: 'https://article.com/sofa',
        affiliate_url: 'https://article.com/sofa?ref=cova',
        image_url: 'https://example.com/sofa.jpg',
        clip_embedding_data: null,
        dinov3_embedding: null,
        siglip2_embedding: null,
        style_tags: ['modern', 'minimal'],
        room_types: ['living_room'],
        price_tier: 'mid',
        in_stock: true,
        active: true,
        width_inches: null,
        depth_inches: null,
        height_inches: null,
        price_last_checked: null,
        created_at: new Date().toISOString(),
      }
      expect(mockProduct.in_stock).toBe(true)
      expect(mockProduct.active).toBe(true)
      expect(mockProduct.clip_embedding_data).toBeNull()
    })

    it('interactions table has all required columns', () => {
      type InteractionRow = Tables<'interactions'>
      const mockInteraction: InteractionRow = {
        id: 'uuid-here',
        user_id: 'user-uuid',
        room_id: 'room-uuid',
        product_id: 'product-uuid',
        action: 'hotspot_tap',
        fingerprint_id: null,
        created_at: new Date().toISOString(),
      }
      expect(mockInteraction.action).toBe('hotspot_tap')
    })

    it('Insert types allow optional id and created_at', () => {
      type UserInsert = InsertTables<'users'>
      const insert: UserInsert = {
        email: 'test@example.com',
        auth_provider: 'google',
      }
      expect(insert.email).toBeDefined()
    })

    it('Update types make all fields optional', () => {
      type RoomUpdate = UpdateTables<'rooms'>
      const update: RoomUpdate = {
        render_url: 'https://example.com/new-render.jpg',
      }
      expect(update.render_url).toBeDefined()
    })
  })
})

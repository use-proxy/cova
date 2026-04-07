import { createServerSupabaseClient } from '@/lib/supabase/server'

export interface DashboardRoom {
  id: string
  room_type: string
  original_photo_url: string | null
  render_url: string | null
  latest_render_url: string | null
  created_at: string
  fingerprint_id: string | null
}

export interface DashboardFingerprint {
  id: string
  dimensions: Record<string, number>
  style_name: string | null
  style_tags: string[] | null
  created_at: string
}

export interface SavedProduct {
  id: string
  name: string
  price: number
  retailer: string
  image_url: string
  affiliate_url: string
  saved_at: string
}

export interface RenderHistoryItem {
  id: string
  render_url: string | null
  created_at: string
  iteration: number | null
}

export async function getUserRooms(userId: string): Promise<DashboardRoom[]> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('rooms')
    .select(`
      id,
      room_type,
      original_photo_url,
      render_url,
      created_at,
      fingerprint_id,
      render_sessions (
        render_url,
        created_at
      )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('getUserRooms error:', error)
    return []
  }

  return (data ?? []).map((room) => {
    const sessions = (room.render_sessions as { render_url: string | null; created_at: string }[] | null) ?? []
    const latestSession = sessions.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0]

    return {
      id: room.id,
      room_type: room.room_type ?? 'room',
      original_photo_url: room.original_photo_url ?? null,
      render_url: room.render_url ?? null,
      latest_render_url: latestSession?.render_url ?? null,
      created_at: room.created_at,
      fingerprint_id: room.fingerprint_id ?? null,
    }
  })
}

export async function getUserFingerprint(userId: string): Promise<DashboardFingerprint | null> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('style_fingerprints')
    .select('id, dimensions, style_name, style_tags, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('getUserFingerprint error:', error)
    return null
  }

  if (!data) return null

  return {
    id: data.id,
    dimensions: (data.dimensions as Record<string, number>) ?? {},
    style_name: data.style_name ?? null,
    style_tags: (data.style_tags as string[] | null) ?? null,
    created_at: data.created_at,
  }
}

export async function getSavedProducts(userId: string): Promise<SavedProduct[]> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('interactions')
    .select(`
      created_at,
      product_id,
      products (
        id,
        name,
        price,
        retailer,
        image_url,
        affiliate_url
      )
    `)
    .eq('user_id', userId)
    .eq('action', 'product_view')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('getSavedProducts error:', error)
    return []
  }

  // Deduplicate by product_id (keep most recent)
  const seen = new Set<string>()
  const results: SavedProduct[] = []

  for (const row of data ?? []) {
    const product = row.products as unknown as {
      id: string
      name: string
      price: number
      retailer: string
      image_url: string
      affiliate_url: string
    } | null

    if (!product || seen.has(product.id)) continue
    seen.add(product.id)

    results.push({
      id: product.id,
      name: product.name,
      price: product.price,
      retailer: product.retailer,
      image_url: product.image_url,
      affiliate_url: product.affiliate_url,
      saved_at: row.created_at,
    })
  }

  return results
}

export async function getRoomRenderHistory(roomId: string): Promise<RenderHistoryItem[]> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('render_sessions')
    .select('id, render_url, created_at, iteration')
    .eq('room_id', roomId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('getRoomRenderHistory error:', error)
    return []
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    render_url: row.render_url ?? null,
    created_at: row.created_at,
    iteration: row.iteration ?? null,
  }))
}

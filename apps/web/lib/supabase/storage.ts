/**
 * Supabase Storage bucket configuration and helpers.
 * Bucket names match what's configured in the Supabase dashboard with RLS.
 */

export const STORAGE_BUCKETS = {
  ROOM_VIDEOS: 'room-videos',
  ROOM_PHOTOS: 'room-photos',
  RENDERS: 'renders',
  DEPTH_MAPS: 'depth-maps',
} as const

export type StorageBucket = (typeof STORAGE_BUCKETS)[keyof typeof STORAGE_BUCKETS]

/**
 * Build a public CDN URL for a Supabase storage file.
 * Only use for public buckets.
 */
export function getPublicUrl(bucket: StorageBucket, path: string): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) return ''
  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`
}

/**
 * Parse a Supabase storage URL to extract bucket and path.
 */
export function parseStorageUrl(url: string): { bucket: string; path: string } | null {
  try {
    const match = url.match(/\/storage\/v1\/object\/(?:public|authenticated)\/([^/]+)\/(.+)$/)
    if (!match) return null
    return { bucket: match[1] ?? '', path: match[2] ?? '' }
  } catch {
    return null
  }
}

/**
 * Generate a structured storage path for a room's assets.
 * Format: {userId}/{roomId}/{assetType}/{filename}
 */
export function buildStoragePath(
  userId: string,
  roomId: string,
  assetType: 'photo' | 'video' | 'render' | 'depth',
  filename: string
): string {
  return `${userId}/${roomId}/${assetType}/${filename}`
}

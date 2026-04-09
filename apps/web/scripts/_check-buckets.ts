import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
dotenv.config({ path: '.env.local' })

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  for (const id of ['room-uploads', 'room-photos', 'room-videos']) {
    const { data, error } = await sb.storage.getBucket(id)
    if (error) {
      console.log(`${id}: ERROR ${error.message}`)
    } else {
      console.log(`${id}: public=${data?.public}  fileSizeLimit=${data?.file_size_limit}`)
    }
  }

  // List a few files from each
  for (const id of ['room-uploads', 'room-photos']) {
    const { data } = await sb.storage.from(id).list('', { limit: 3 })
    console.log(`${id} files:`, data?.map((f) => f.name).slice(0, 3))
  }

  // Verify a rooms table row to find Daksh's actual room photo
  const { data: rooms } = await sb
    .from('rooms')
    .select('id, original_photo_url, created_at, user_id')
    .not('original_photo_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(5)
  console.log('Recent rooms with photos:')
  for (const r of rooms ?? []) {
    console.log(`  ${r.created_at?.slice(0, 16)} ${String(r.original_photo_url).slice(0, 100)}`)
  }
}
main().catch((e) => { console.error(e); process.exit(1) })

import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
dotenv.config({ path: '.env.local' })

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Flip room-uploads to public
  const { error: updateErr } = await sb.storage.updateBucket('room-uploads', {
    public: true,
  })
  if (updateErr) {
    console.error('updateBucket failed:', updateErr.message)
    process.exit(1)
  }
  console.log('room-uploads → public=true')

  // Verify
  const { data: verify } = await sb.storage.getBucket('room-uploads')
  console.log('verify:', verify?.public)

  // Verify IMG_2093.jpeg accessible
  const { data: urlData } = sb.storage.from('room-uploads').getPublicUrl('IMG_2093.jpeg')
  console.log('IMG_2093.jpeg public url:', urlData.publicUrl)

  const headRes = await fetch(urlData.publicUrl, { method: 'HEAD' })
  console.log('accessible:', headRes.status, headRes.headers.get('content-length'), 'bytes')
  if (headRes.status !== 200) {
    console.error('IMG_2093.jpeg not accessible')
    process.exit(1)
  }
  const size = parseInt(headRes.headers.get('content-length') ?? '0')
  if (size < 100_000) {
    console.error(`IMG_2093.jpeg too small: ${size} bytes`)
    process.exit(1)
  }
  console.log('PASS room-uploads public, IMG_2093.jpeg accessible, size OK')
}
main().catch((e) => { console.error(e); process.exit(1) })

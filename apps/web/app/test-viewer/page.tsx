export const dynamic = 'force-dynamic'

import dynamicImport from 'next/dynamic'
import { createAdminClient } from '@/lib/supabase/admin'

const SplatViewer = dynamicImport(() => import('@/components/SplatViewer'), {
  ssr: false,
  loading: () => (
    <div style={{
      width: '100vw',
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0A1628',
      color: '#F8F6F1',
      fontFamily: 'Inter, sans-serif',
    }}>
      Loading splat viewer...
    </div>
  ),
})

const PLY_PATH = 'test-user/14989918-d087-41fb-8442-d5b5f32b537d/room.ply'

export default async function TestViewerPage() {
  const supabase = createAdminClient()

  const { data, error } = await supabase.storage
    .from('room-videos')
    .createSignedUrl(PLY_PATH, 3600)

  if (error || !data?.signedUrl) {
    return (
      <div style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0A1628',
        color: '#C0504A',
        fontFamily: 'Inter, sans-serif',
      }}>
        Failed to load PLY: {error?.message ?? 'No signed URL returned'}
      </div>
    )
  }

  return (
    <main style={{ margin: 0, padding: 0, overflow: 'hidden' }}>
      <SplatViewer url={data.signedUrl} />
    </main>
  )
}

import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import dynamic from 'next/dynamic'

const SplatViewer = dynamic(() => import('@/components/SplatViewer'), {
  ssr: false,
  loading: () => (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0A1628',
        color: '#F8F6F1',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      Loading viewer...
    </div>
  ),
})

const RoomChatbot = dynamic(() => import('@/components/RoomChatbot'), {
  ssr: false,
})

const RoomOverlay = dynamic(() => import('./RoomOverlay'), {
  ssr: false,
})

interface PageProps {
  params: Promise<{ roomId: string }>
}

export default async function RoomViewerPage({ params }: PageProps) {
  const { roomId } = await params

  const supabase = createAdminClient()

  const { data: room } = await supabase
    .from('rooms')
    .select(
      'id, splat_path, marble_spz_url, marble_spz_url_500k, redesign_pano_url, redesign_status, status, marble_plus_thumbnail_url, furniture_matches_count'
    )
    .eq('id', roomId)
    .single()

  if (!room) {
    redirect(`/processing/${roomId}`)
  }

  // Use Marble SPZ if available, fall back to legacy PLY signed URL
  const spzUrl = room.marble_spz_url || ''
  const spzUrl500k = room.marble_spz_url_500k || ''

  let viewerUrl = ''
  if (spzUrl) {
    viewerUrl = spzUrl
  } else if (room.splat_path) {
    const { data: signed } = await supabase.storage
      .from('room-videos')
      .createSignedUrl(room.splat_path, 3600)
    viewerUrl = signed?.signedUrl ?? ''
  }

  const hasRedesign = !!room.marble_spz_url

  return (
    <main style={{ margin: 0, padding: 0, overflow: 'hidden', position: 'relative' }}>
      {viewerUrl && (
        <SplatViewer
          url={viewerUrl}
          spzUrl={spzUrl || undefined}
          spzUrl500k={spzUrl500k || undefined}
          roomId={roomId}
          hasRedesign={hasRedesign}
        />
      )}
      <RoomOverlay roomId={roomId} />
      <RoomChatbot roomId={roomId} />
    </main>
  )
}

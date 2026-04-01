import { redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
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

interface PageProps {
  params: Promise<{ roomId: string }>
}

export default async function RoomViewerPage({ params }: PageProps) {
  const { roomId } = await params

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: room } = await supabase
    .from('rooms')
    .select('id, splat_path, redesign_splat_url, status')
    .eq('id', roomId)
    .single()

  if (!room || !room.splat_path) {
    redirect(`/processing/${roomId}`)
  }

  // Generate signed URL for splat file (1 hour)
  const { data: signed } = await supabase.storage
    .from('room-videos')
    .createSignedUrl(room.splat_path, 3600)

  if (!signed?.signedUrl) {
    redirect(`/processing/${roomId}`)
  }

  return (
    <main style={{ margin: 0, padding: 0, overflow: 'hidden' }}>
      <SplatViewer
        url={signed.signedUrl}
        roomId={roomId}
        hasRedesign={!!room.redesign_splat_url}
      />
      <RoomChatbot roomId={roomId} />
    </main>
  )
}

/**
 * Server-side pipeline status poller.
 * Used by the orchestrator to wait for pipeline stage transitions.
 */

export async function waitForStatus(
  roomId: string,
  targetStatus: string,
  options: { timeoutMs: number; pollMs: number }
): Promise<void> {
  const { timeoutMs, pollMs } = options
  const start = Date.now()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

  while (Date.now() - start < timeoutMs) {
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/rooms?id=eq.${roomId}&select=redesign_status`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
        signal: AbortSignal.timeout(10000),
      }
    )
    const data = await resp.json()
    const status = data[0]?.redesign_status

    if (status === targetStatus) return
    if (status === 'complete') return

    if (status?.includes('error') || status === 'error') {
      throw new Error(`Pipeline failed at status: ${status}`)
    }

    await new Promise((resolve) => setTimeout(resolve, pollMs))
  }

  throw new Error(`Timeout waiting for status: ${targetStatus} (${timeoutMs}ms)`)
}

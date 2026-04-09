import { NextResponse } from 'next/server'
import Replicate from 'replicate'
import type { StyleFingerprint } from '@/types/fingerprint'
import { buildFluxPrompt } from '@/lib/ai/flux'

// ── Validation renders for quiz Phase C ───────────────────────────────────────
// Generates 3 FLUX 1.1 Pro text-to-image renders that visualize the user's
// current fingerprint plus two nudged variants. These are PREVIEWS — not
// persisted to render_sessions, not tied to a room. Used by step-3 Phase C
// for the "is this your style?" confirmation step.

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
})

const FLUX_MODEL = 'black-forest-labs/flux-1.1-pro'
const POLL_INTERVAL_MS = 3000
const POLL_TIMEOUT_MS = 120_000

interface ValidationRendersRequest {
  fingerprint: StyleFingerprint
  roomType: string
  fingerprintId?: string
}

interface RenderSlot {
  url: string | null
  label: string
  fingerprint: StyleFingerprint
  error?: string
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

function nudge(
  fp: StyleFingerprint,
  deltas: Partial<StyleFingerprint['dimensions']>,
): StyleFingerprint {
  const d = { ...fp.dimensions }
  for (const [k, v] of Object.entries(deltas)) {
    if (typeof v !== 'number') continue
    const key = k as keyof StyleFingerprint['dimensions']
    d[key] = clamp01(d[key] + v)
  }
  return { ...fp, dimensions: d }
}

function buildPromptFor(fp: StyleFingerprint, roomType: string): string {
  return buildFluxPrompt({
    fingerprint: fp,
    roomType,
    budgetTier: 'mid',
    inclusions: [],
    constraints: [],
    keptItemLabels: [],
    roomAnalysis: null,
    quizPreviewMode: true,
  })
}

async function runFluxPreview(prompt: string): Promise<string> {
  const prediction = await replicate.predictions.create({
    model: FLUX_MODEL,
    input: {
      prompt,
      width: 1024,
      height: 1024,
      num_inference_steps: 28,
      guidance_scale: 3.0,
      output_format: 'png',
      safety_tolerance: 2,
    },
  })

  const startedAt = Date.now()
  let p = prediction
  while (p.status !== 'succeeded' && p.status !== 'failed' && p.status !== 'canceled') {
    if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
      throw new Error('FLUX render timeout after 120s')
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
    p = await replicate.predictions.get(p.id)
  }

  if (p.status !== 'succeeded') {
    throw new Error(`FLUX render ${p.status}: ${p.error ?? 'unknown error'}`)
  }

  const out = p.output
  if (typeof out === 'string') return out
  if (Array.isArray(out) && out.length > 0) return String(out[0])
  throw new Error('Unexpected FLUX output format')
}

async function runSlot(
  fp: StyleFingerprint,
  roomType: string,
  label: string,
): Promise<RenderSlot> {
  try {
    const prompt = buildPromptFor(fp, roomType)
    const url = await runFluxPreview(prompt)
    return { url, label, fingerprint: fp }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'render failed'
    return { url: null, label, fingerprint: fp, error: message }
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<ValidationRendersRequest>

    if (!body.fingerprint || typeof body.fingerprint !== 'object' || !body.fingerprint.dimensions) {
      return NextResponse.json({ error: 'fingerprint required' }, { status: 400 })
    }
    if (!body.roomType || typeof body.roomType !== 'string') {
      return NextResponse.json({ error: 'roomType required' }, { status: 400 })
    }

    const fp: StyleFingerprint = body.fingerprint
    const roomType: string = body.roomType

    const warmer = nudge(fp, {
      density: 0.15,
      colorTemperature: 0.15,
    })
    const cooler = nudge(fp, {
      density: -0.15,
      colorTemperature: -0.15,
    })

    const [slot1, slot2, slot3] = await Promise.all([
      runSlot(fp, roomType, 'Your style'),
      runSlot(warmer, roomType, 'A little warmer and layered'),
      runSlot(cooler, roomType, 'A little cooler and minimal'),
    ])

    return NextResponse.json({ renders: [slot1, slot2, slot3] })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

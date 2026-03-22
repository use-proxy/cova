const REPLICATE_API = 'https://api.replicate.com/v1/predictions'
// andreasjansson/clip-features — CLIP ViT-L/14, returns 768-dim image embeddings
const CLIP_VERSION = '75b33f253f7714a281ad3e9b28f63e3232d583716ef6718f2e46641077ea040a'

const POLL_INTERVAL_MS = 2_000
const POLL_TIMEOUT_MS = 120_000

interface ReplicatePrediction {
  id: string
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled'
  output?: Array<{ embedding: number[] }>
  error?: string
  urls: { get: string }
}

function token(): string {
  const t = process.env.REPLICATE_API_TOKEN
  if (!t) throw new Error('REPLICATE_API_TOKEN is not set')
  return t
}

async function createPrediction(imageUrls: string[]): Promise<ReplicatePrediction> {
  for (let attempt = 0; attempt <= 10; attempt++) {
    const res = await fetch(REPLICATE_API, {
      method: 'POST',
      headers: {
        Authorization: `Token ${token()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        version: CLIP_VERSION,
        input: { inputs: imageUrls.join('\n') },
      }),
    })

    if (res.status === 429) {
      const body = await res.text()
      let retryAfter = 10
      try {
        const parsed = JSON.parse(body) as { retry_after?: number }
        retryAfter = Math.ceil(parsed.retry_after ?? 10) + 2
      } catch { /* ignore */ }
      if (attempt === 10) throw new Error(`Replicate rate limited after 10 retries: ${body}`)
      console.log(`  Rate limited — waiting ${retryAfter}s (attempt ${attempt + 1}/10)...`)
      await new Promise((r) => setTimeout(r, retryAfter * 1000))
      continue
    }

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Replicate create prediction failed (${res.status}): ${body}`)
    }

    return res.json() as Promise<ReplicatePrediction>
  }
  throw new Error('createPrediction: exhausted retries')
}

async function pollPrediction(getUrl: string): Promise<ReplicatePrediction> {
  const deadline = Date.now() + POLL_TIMEOUT_MS

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))

    const res = await fetch(getUrl, {
      headers: { Authorization: `Token ${token()}` },
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Replicate poll failed (${res.status}): ${body}`)
    }

    const prediction = (await res.json()) as ReplicatePrediction

    if (prediction.status === 'succeeded') return prediction
    if (prediction.status === 'failed' || prediction.status === 'canceled') {
      throw new Error(`Replicate prediction ${prediction.status}: ${prediction.error ?? 'no error detail'}`)
    }
    // still starting/processing — keep polling
  }

  throw new Error(`Replicate prediction timed out after ${POLL_TIMEOUT_MS / 1000}s`)
}

/** Embed a batch of image URLs in a single Replicate prediction.
 *  Returns one 768-dim embedding per URL, in input order. */
export async function embedBatch(imageUrls: string[]): Promise<number[][]> {
  if (imageUrls.length === 0) return []

  const prediction = await createPrediction(imageUrls)
  const done = await pollPrediction(prediction.urls.get)

  if (!done.output || done.output.length !== imageUrls.length) {
    throw new Error(
      `Replicate returned ${done.output?.length ?? 0} embeddings for ${imageUrls.length} inputs`,
    )
  }

  return done.output.map((item, i) => {
    if (!Array.isArray(item.embedding) || item.embedding.length !== 768) {
      throw new Error(
        `Embedding ${i} has unexpected shape: length=${item.embedding?.length} (expected 768)`,
      )
    }
    return item.embedding
  })
}

/** Single-URL convenience wrapper. */
export async function embed(imageUrl: string): Promise<number[]> {
  const [embedding] = await embedBatch([imageUrl])
  return embedding
}

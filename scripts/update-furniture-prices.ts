/**
 * update-furniture-prices.ts
 *
 * Second-pass price enrichment for generated furniture catalog entries.
 * Reads furnitureCatalog.ts, finds entries with price_range === 'mid' and
 * glb_path starting with 'assets/models/' (generated, not manually curated),
 * queries Amazon Product Advertising API (PA API 5.0) for a price match,
 * and writes the updated catalog back.
 *
 * Required env vars:
 *   AWS_ACCESS_KEY_ID        — PA API credentials
 *   AWS_SECRET_ACCESS_KEY
 *   AMAZON_PARTNER_TAG       — your Associates tag (e.g. 'cova-20')
 *
 * Run:  npx ts-node scripts/update-furniture-prices.ts
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import crypto from 'crypto'
import fetch from 'node-fetch'

const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CATALOG_PATH = path.resolve(__dirname, '../apps/mobile/src/data/furnitureCatalog.ts')

const AWS_REGION   = 'us-east-1'
const PA_API_HOST  = `webservices.amazon.com`
const PA_API_PATH  = `/paapi5/searchitems`
const PARTNER_TAG  = process.env.AMAZON_PARTNER_TAG ?? ''
const ACCESS_KEY   = process.env.AWS_ACCESS_KEY_ID ?? ''
const SECRET_KEY   = process.env.AWS_SECRET_ACCESS_KEY ?? ''

const PRICE_RANGE_THRESHOLDS = {
  budget:  100,   // < $100
  mid:     500,   // $100–$500
  premium: Infinity,
}

// ---------------------------------------------------------------------------
// AWS Signature V4 for PA API
// ---------------------------------------------------------------------------

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest()
}

function sha256hex(data: string): string {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex')
}

function getSigningKey(secretKey: string, dateStamp: string, region: string, service: string): Buffer {
  const kDate    = hmacSha256(`AWS4${secretKey}`, dateStamp)
  const kRegion  = hmacSha256(kDate, region)
  const kService = hmacSha256(kRegion, service)
  const kSigning = hmacSha256(kService, 'aws4_request')
  return kSigning
}

function buildAuthHeader(
  method: string,
  host: string,
  uriPath: string,
  payload: string,
  amzDate: string,
  dateStamp: string,
): string {
  const canonicalHeaders = `content-encoding:amz-1.0\ncontent-type:application/json; charset=utf-8\nhost:${host}\nx-amz-date:${amzDate}\nx-amz-target:com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems\n`
  const signedHeaders    = 'content-encoding;content-type;host;x-amz-date;x-amz-target'
  const payloadHash      = sha256hex(payload)
  const canonicalRequest = [method, uriPath, '', canonicalHeaders, signedHeaders, payloadHash].join('\n')
  const credentialScope  = `${dateStamp}/${AWS_REGION}/ProductAdvertisingAPI/aws4_request`
  const stringToSign     = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${sha256hex(canonicalRequest)}`
  const signingKey       = getSigningKey(SECRET_KEY, dateStamp, AWS_REGION, 'ProductAdvertisingAPI')
  const signature        = hmacSha256(signingKey, stringToSign).toString('hex')
  return `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
}

// ---------------------------------------------------------------------------
// PA API search
// ---------------------------------------------------------------------------

interface PaApiItem {
  ASIN: string
  DetailPageURL: string
  ItemInfo?: { Title?: { DisplayValue?: string } }
  Offers?: {
    Listings?: Array<{
      Price?: { Amount?: number; Currency?: string }
    }>
  }
}

interface PaApiResponse {
  SearchResult?: { Items?: PaApiItem[] }
  Errors?: Array<{ Code: string; Message: string }>
}

async function searchAmazon(
  keywords: string,
  roomType: string,
): Promise<{ price: number; affiliateUrl: string; priceRange: string } | null> {
  if (!ACCESS_KEY || !SECRET_KEY || !PARTNER_TAG) {
    console.warn('  ⚠ Amazon PA API credentials not set — skipping price lookup')
    return null
  }

  const now       = new Date()
  const amzDate   = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z'
  const dateStamp = amzDate.slice(0, 8)

  const payload = JSON.stringify({
    Keywords:      `${keywords} ${roomType.replace(/_/g, ' ')}`,
    PartnerTag:    PARTNER_TAG,
    PartnerType:   'Associates',
    Marketplace:   'www.amazon.com',
    Resources:     ['ItemInfo.Title', 'Offers.Listings.Price'],
    SearchIndex:   'HomeAndKitchen',
    ItemCount:     3,
    SortBy:        'Relevance',
  })

  const authHeader = buildAuthHeader('POST', PA_API_HOST, PA_API_PATH, payload, amzDate, dateStamp)

  const res = await fetch(`https://${PA_API_HOST}${PA_API_PATH}`, {
    method: 'POST',
    headers: {
      'content-encoding':  'amz-1.0',
      'content-type':      'application/json; charset=utf-8',
      'host':              PA_API_HOST,
      'x-amz-date':        amzDate,
      'x-amz-target':      'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems',
      'authorization':     authHeader,
    },
    body: payload,
  })

  if (!res.ok) {
    console.warn(`  Amazon API ${res.status} for "${keywords}"`)
    return null
  }

  const json = await res.json() as PaApiResponse
  if (json.Errors?.length) {
    console.warn(`  Amazon API error: ${json.Errors[0].Message}`)
    return null
  }

  const items = json.SearchResult?.Items ?? []
  for (const item of items) {
    const amount = item.Offers?.Listings?.[0]?.Price?.Amount
    if (amount && amount > 0) {
      const priceRange =
        amount < PRICE_RANGE_THRESHOLDS.budget  ? 'budget' :
        amount < PRICE_RANGE_THRESHOLDS.mid     ? 'mid'    :
                                                  'premium'
      return {
        price:        amount,
        affiliateUrl: item.DetailPageURL,
        priceRange,
      }
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Patch catalog file in-place
// ---------------------------------------------------------------------------

function patchCatalogFile(
  source: string,
  updates: Map<string, { price_range: string }>,
): string {
  // Replace price_range for each entry id using string replacement
  let out = source
  for (const [id, patch] of updates) {
    // Match the entry block for this id and replace its price_range value
    const idPattern = new RegExp(
      `(id:\\s*['"\`]${id}['"\`][\\s\\S]*?price_range:\\s*['"\`])[^'"\`]*(["'\`])`,
      'g',
    )
    out = out.replace(idPattern, `$1${patch.price_range}$2`)
  }
  return out
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function run() {
  console.log('=== Cova Furniture Price Updater ===\n')

  if (!fs.existsSync(CATALOG_PATH)) {
    console.error(`Catalog not found at ${CATALOG_PATH}. Run generate-furniture-catalog.ts first.`)
    process.exit(1)
  }

  const source = fs.readFileSync(CATALOG_PATH, 'utf8')

  // Extract generated entries: id, name, room_types, price_range
  // We only update entries whose glb_path starts with 'assets/models/'
  const entryRe = /id:\s*['"`]([^'"`]+)['"`][\s\S]*?name:\s*['"`]([^'"`]+)['"`][\s\S]*?room_types:\s*\[([^\]]*)\][\s\S]*?glb_path:\s*['"`]([^'"`]*)['"`][\s\S]*?price_range:\s*['"`]([^'"`]*)['"`]/g

  const toUpdate: Array<{ id: string; name: string; roomType: string; priceRange: string }> = []
  let match: RegExpExecArray | null
  while ((match = entryRe.exec(source)) !== null) {
    const [, id, name, roomTypesRaw, glbPath, priceRange] = match
    if (!glbPath.startsWith('assets/models/')) continue
    const roomType = roomTypesRaw.split(',')[0].replace(/['"\s]/g, '') || 'living_room'
    toUpdate.push({ id, name, roomType, priceRange })
  }

  console.log(`Found ${toUpdate.length} generated entries to enrich with prices\n`)

  const updates = new Map<string, { price_range: string }>()
  let updated = 0
  let skipped = 0

  for (const entry of toUpdate) {
    process.stdout.write(`  ${entry.name.slice(0, 50).padEnd(50)} → `)
    const result = await searchAmazon(entry.name, entry.roomType)
    if (result) {
      updates.set(entry.id, { price_range: result.priceRange })
      console.log(`${result.priceRange} ($${result.price.toFixed(2)})`)
      updated++
    } else {
      console.log('skipped')
      skipped++
    }
    // Respect PA API rate limit (1 req/s recommended)
    await new Promise((r) => setTimeout(r, 1100))
  }

  if (updates.size > 0) {
    const patched = patchCatalogFile(source, updates)
    fs.writeFileSync(CATALOG_PATH, patched, 'utf8')
    console.log(`\n✓ Updated ${updated} price_range values in furnitureCatalog.ts`)
  } else {
    console.log('\nNo price updates applied.')
  }

  console.log(`Skipped: ${skipped}`)
}

run().catch((err) => {
  console.error('Price update failed:', err)
  process.exit(1)
})

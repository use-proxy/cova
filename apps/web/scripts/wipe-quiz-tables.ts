/**
 * wipe-quiz-tables.ts
 *
 * One-time wipe of the legacy 10-dim quiz tables. Run as part of the
 * 12-dim migration (Session A). Safe to re-run — DELETE is idempotent.
 *
 * Tables wiped (rows only — schema is left in place):
 *   - style_fingerprints  (every user fingerprint, 10-dim)
 *   - swipe_cards         (every quiz card with 10-dim dimension_labels)
 *   - style_references    (every reference image with 10-dim dimension_labels)
 *
 * Session B will repopulate these tables with 12-dim data sourced from the
 * new quiz_anchor_images / quiz_comparison_pairs library.
 *
 * Usage:
 *   cd apps/web
 *   npx tsx scripts/wipe-quiz-tables.ts
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load env from apps/web/.env.local then root .env.local
config({ path: path.join(__dirname, '..', '.env.local') })
config({ path: path.join(__dirname, '..', '..', '..', '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL) throw new Error('NEXT_PUBLIC_SUPABASE_URL not set')
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set')

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function wipeTable(table: 'style_fingerprints' | 'swipe_cards' | 'style_references') {
  console.log(`[wipe] Counting rows in ${table}...`)
  const { count: beforeCount, error: countErr } = await admin
    .from(table)
    .select('*', { count: 'exact', head: true })
  if (countErr) {
    console.error(`[wipe] count(${table}) failed:`, countErr.message)
    return
  }
  console.log(`[wipe] ${table}: ${beforeCount ?? 0} rows before`)

  if ((beforeCount ?? 0) === 0) {
    console.log(`[wipe] ${table}: already empty, skipping`)
    return
  }

  // Supabase requires a filter on every delete. Match a column that is
  // guaranteed to exist on every row — `id` (uuid) is non-null.
  const { error: delErr } = await admin
    .from(table)
    .delete()
    .not('id', 'is', null)
  if (delErr) {
    console.error(`[wipe] delete(${table}) failed:`, delErr.message)
    return
  }

  const { count: afterCount } = await admin
    .from(table)
    .select('*', { count: 'exact', head: true })
  console.log(`[wipe] ${table}: ${afterCount ?? 0} rows after`)
}

async function main() {
  console.log('[wipe] starting 12-dim migration wipe at', new Date().toISOString())
  await wipeTable('style_fingerprints')
  await wipeTable('swipe_cards')
  await wipeTable('style_references')
  console.log('[wipe] done')
}

main().catch((err) => {
  console.error('[wipe] fatal:', err)
  process.exit(1)
})

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import * as path from 'path'
import { fileURLToPath } from 'url'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
config({ path: path.join(__dirname, '..', '.env.local') })
config({ path: path.join(__dirname, '..', '..', '..', '.env.local') })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

async function main() {
  let exit = 0
  for (const t of ['swipe_cards', 'style_references'] as const) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin as any).from(t).select('id').limit(1)
    if (!error && data !== null) {
      console.log(`✗ ${t} STILL EXISTS — drop failed`)
      exit = 1
    } else if (error && /does not exist|Could not find the table|PGRST20[0-9]/i.test(error.message + ' ' + error.code)) {
      console.log(`✓ ${t} dropped (${error.code ?? '—'}: ${error.message.slice(0, 60)})`)
    } else {
      console.log(`? ${t} unexpected: ${error?.code ?? ''} ${error?.message ?? ''}`)
      exit = 1
    }
  }
  for (const t of ['quiz_anchor_images', 'quiz_comparison_pairs'] as const) {
    const { count, error } = await admin.from(t).select('*', { count: 'exact', head: true })
    if (error) { console.log(`✗ ${t}: ${error.message}`); exit = 1 }
    else console.log(`✓ ${t}: ${count} rows`)
  }
  process.exit(exit)
}
main().catch((e) => { console.error(e); process.exit(1) })

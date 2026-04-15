import { createClient } from './apps/web/node_modules/@supabase/supabase-js/dist/index.mjs';
import { readFileSync } from 'fs';
const raw = readFileSync('./apps/web/.env.local','utf8');
const env = {};
for (const line of raw.split('\n')) {
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0,i)] = line.slice(i+1);
}
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await s.from('style_fingerprints').select('style_name,created_at,dimensions').order('created_at',{ascending:false}).limit(3);
for (const r of data) {
  console.log('\n---', r.style_name, new Date(r.created_at).toLocaleTimeString());
  console.log(JSON.stringify(r.dimensions, null, 2));
}

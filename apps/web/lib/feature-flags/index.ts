import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const reader = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });

export type FlagKey = string;

export interface FlagRow {
  key: string;
  enabled: boolean;
  percent_rollout: number;
  environment: "development" | "preview" | "production" | "all";
  description: string | null;
}

const cache = new Map<string, { row: FlagRow | null; expiresAt: number }>();
const TTL_MS = 30_000;

export async function readFlag(key: FlagKey): Promise<FlagRow | null> {
  const env = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development";
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) return hit.row;
  const { data, error } = await reader.from("feature_flags").select("*").eq("key", key).maybeSingle();
  if (error) {
    cache.set(key, { row: null, expiresAt: now + TTL_MS });
    return null;
  }
  const row = (data as FlagRow | null) ?? null;
  if (row && row.environment !== "all" && row.environment !== env) {
    cache.set(key, { row: null, expiresAt: now + TTL_MS });
    return null;
  }
  cache.set(key, { row, expiresAt: now + TTL_MS });
  return row;
}

export async function isFlagEnabledForUser(key: FlagKey, userId: string | null): Promise<boolean> {
  const row = await readFlag(key);
  if (!row || !row.enabled) return false;
  if (row.percent_rollout >= 100) return true;
  if (row.percent_rollout <= 0) return false;
  if (!userId) return false;
  const hash = simpleStableHash(`${row.key}:${userId}`);
  return hash % 100 < row.percent_rollout;
}

function simpleStableHash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

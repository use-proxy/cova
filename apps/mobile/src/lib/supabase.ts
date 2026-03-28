// IMPORTANT: In Supabase dashboard → Authentication → Providers → Email → disable "Confirm email" for development.
// IMPORTANT: In Supabase dashboard → Authentication → Providers → Email → ensure Email provider is ENABLED.

import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[Cova] Supabase env vars missing. Check .env');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

/** Race a promise against a timeout. Default 10s. */
export function withTimeout<T>(promise: Promise<T>, ms = 10000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Request timed out after ${Math.round(ms / 1000)}s`)), ms),
    ),
  ]);
}

export async function callEdgeFunction<T>(
  functionName: string,
  body: object,
  timeoutMs = 60000,
): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Not authenticated — please sign in again');
  }

  const url = `${supabaseUrl}/functions/v1/${functionName}`;
  console.log(`[callEdgeFunction] POST ${functionName} (timeout: ${timeoutMs}ms)`);

  let response: Response;
  try {
    const fetchPromise = fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': supabaseAnonKey,
      },
      body: JSON.stringify(body),
    });
    response = await withTimeout(fetchPromise, timeoutMs);
  } catch (networkErr) {
    const msg = networkErr instanceof Error ? networkErr.message : String(networkErr);
    console.error(`[callEdgeFunction] ${functionName} network error:`, msg);
    throw new Error(`${functionName}: ${msg}`);
  }

  if (!response.ok) {
    let errorMsg = `Edge function error: ${response.status}`;
    try {
      const errorBody = await response.json();
      errorMsg = errorBody.error ?? errorMsg;
    } catch { /* response not JSON */ }
    console.error(`[callEdgeFunction] ${functionName} HTTP ${response.status}:`, errorMsg);
    throw new Error(errorMsg);
  }

  return response.json() as Promise<T>;
}

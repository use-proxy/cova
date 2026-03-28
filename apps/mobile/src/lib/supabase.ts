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
      setTimeout(() => reject(new Error('Having trouble connecting — please try again')), ms),
    ),
  ]);
}

export async function callEdgeFunction<T>(
  functionName: string,
  body: object,
  timeoutMs = 30000,
): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }

  const fetchPromise = fetch(
    `${supabaseUrl}/functions/v1/${functionName}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': supabaseAnonKey,
      },
      body: JSON.stringify(body),
    },
  );

  const response = await withTimeout(fetchPromise, timeoutMs);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error ?? `Edge function error: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

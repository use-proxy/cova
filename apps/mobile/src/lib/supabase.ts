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

export async function callEdgeFunction<T>(
  functionName: string,
  body: object,
): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();

  const response = await fetch(
    `${supabaseUrl}/functions/v1/${functionName}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`,
        'apikey': supabaseAnonKey,
      },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error ?? `Edge function error: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

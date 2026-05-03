// P01b — delete-user-cascade Edge Function (NEW; permitted under Rule 12).
// Idempotent. Hashes user_id before audit-row write so account_deletions
// stores no PII. Relies on auth.users → public.* CASCADE chain (verified
// by P01b planner) to clean app tables.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({
          ok: false,
          failure_category: 'auth.session.expired',
          user_message: 'Your session expired. Please sign in again.',
          detail: 'missing-authorization-header',
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({
          ok: false,
          failure_category: 'auth.session.expired',
          user_message: 'Your session expired. Please sign in again.',
          detail: authError?.message ?? 'no-user',
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const userId = user.id;
    const hashedUserId = await sha256Hex(userId);

    // Insert audit row BEFORE auth.users delete so we keep the record even if
    // the cascade fails partway through.
    const { error: auditError } = await adminClient
      .from('account_deletions')
      .insert({
        hashed_user_id: hashedUserId,
        deletion_reason: 'user_initiated',
        audit_retention_days: 30,
      });

    if (auditError) {
      return new Response(
        JSON.stringify({
          ok: false,
          failure_category: 'auth.delete.cascade_fail',
          user_message: "We couldn't delete your account. Please try again.",
          detail: auditError.message,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteError) {
      const notFound =
        /not\s*found/i.test(deleteError.message) ||
        // @ts-expect-error code may be present at runtime
        deleteError.status === 404;

      if (notFound) {
        return new Response(
          JSON.stringify({ ok: true, idempotent: true }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      return new Response(
        JSON.stringify({
          ok: false,
          failure_category: 'auth.delete.cascade_fail',
          user_message: "We couldn't delete your account. Please try again.",
          detail: deleteError.message,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'unknown-error';
    return new Response(
      JSON.stringify({
        ok: false,
        failure_category: 'auth.delete.cascade_fail',
        user_message: "We couldn't delete your account. Please try again.",
        detail,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

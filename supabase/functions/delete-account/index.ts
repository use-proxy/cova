import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const userId = user.id;

    // Get room IDs for FK-dependent deletions
    const { data: userRooms } = await adminClient
      .from('rooms')
      .select('id')
      .eq('user_id', userId);
    const roomIds = (userRooms ?? []).map((r: { id: string }) => r.id);

    // Delete in FK-safe order
    await adminClient.from('chat_messages').delete().eq('user_id', userId);

    // Drop furniture_placements deletion: handled by FK cascade on rooms drop
    // (Pre-V1 cleanup; table dropped 2026-05-02 per P01a M1)
    // if (roomIds.length > 0) {
    //   await adminClient.from('furniture_placements').delete().in('room_id', roomIds);
    // }
    void roomIds;

    await adminClient.from('renders').delete().eq('user_id', userId);
    await adminClient.from('rooms').delete().eq('user_id', userId);
    // Drop token_transactions deletion: token system disabled per D-019
    // (Pre-V1 cleanup; table dropped 2026-05-02 per P01a M1)
    // await adminClient.from('token_transactions').delete().eq('user_id', userId);

    // Clean up storage buckets
    for (const bucket of ['room-photos', 'renders']) {
      try {
        const { data: files } = await adminClient.storage.from(bucket).list(userId);
        if (files && files.length > 0) {
          await adminClient.storage.from(bucket).remove(files.map((f: { name: string }) => `${userId}/${f.name}`));
        }
      } catch {
        // Storage cleanup is best-effort — continue even if bucket is empty or missing
      }
    }

    await adminClient.from('users').delete().eq('id', userId);

    const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteUserError) {
      console.error('Failed to delete auth user:', deleteUserError.message);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

type CavaStyle = 'japandi' | 'midcentury' | 'coastal' | 'industrial' | 'bohemian';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 1. Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
    } = await supabase.auth.getUser(token);

    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Parse body
    const { render_id, style, limit = 10 } = await req.json();

    if (!render_id || !style) {
      return new Response(
        JSON.stringify({ error: 'render_id and style are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 3. Fetch render to get style_applied and room_id
    const { data: render, error: renderError } = await supabase
      .from('renders')
      .select('id, room_id, clip_embedding, style_applied')
      .eq('id', render_id)
      .single();

    if (renderError || !render) {
      return new Response(JSON.stringify({ error: 'Render not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4. Check token balance (costs 1 token)
    const { data: userData } = await supabase
      .from('users')
      .select('token_balance')
      .eq('id', user.id)
      .single();

    if (!userData || userData.token_balance < 1) {
      return new Response(
        JSON.stringify({ error: 'insufficient_tokens', required: 1, available: userData?.token_balance ?? 0 }),
        { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    let products = null;

    // 5. Try CLIP embedding match first
    if (render.clip_embedding) {
      const { data: embeddingResults } = await supabase.rpc('search_products_by_embedding', {
        query_embedding: render.clip_embedding,
        match_count: limit,
        style_filter: style,
      });
      products = embeddingResults;
    }

    // 6. Fall back to style_tags match if no CLIP embedding
    if (!products || products.length === 0) {
      const { data: tagResults } = await supabase
        .from('products')
        .select('*')
        .contains('style_tags', [style])
        .order('price', { ascending: true })
        .limit(limit);
      products = tagResults ?? [];
    }

    // 7. Insert into room_products junction table
    if (products.length > 0 && render.room_id) {
      const junctionRows = products.map((p: { id: string }) => ({
        room_id: render.room_id,
        render_id: render.id,
        product_id: p.id,
      }));

      await supabase.from('room_products').upsert(junctionRows, {
        onConflict: 'room_id,render_id,product_id',
        ignoreDuplicates: true,
      });
    }

    // 8. Deduct 1 token atomically
    const { error: deductError } = await supabase.rpc('deduct_tokens_atomic', {
      p_user_id: user.id,
      p_amount: 1,
      p_reason: `product_match_${render_id}`,
    });

    if (deductError) {
      console.error('Token deduction error:', deductError);
    }

    // 9. Return matched products
    return new Response(
      JSON.stringify({ products, tokens_charged: 1 }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('match-products error:', err);
    return new Response(
      JSON.stringify({ error: 'internal_error', message: 'An unexpected error occurred.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

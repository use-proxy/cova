import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authToken = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(authToken);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { render_embedding, room_type, style_blend, budget, limit } = await req.json();

    if (!render_embedding || !Array.isArray(render_embedding) || render_embedding.length === 0) {
      return new Response(
        JSON.stringify({ products: [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const matchCount = limit ?? 15;

    // Try RPC-based vector search first
    const { data: rpcResults, error: rpcError } = await supabase.rpc('search_products_by_embedding', {
      query_embedding: render_embedding,
      match_threshold: 0.3,
      match_count: matchCount,
    });

    if (!rpcError && rpcResults && rpcResults.length > 0) {
      return new Response(
        JSON.stringify({ products: rpcResults }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Fallback: style tag matching using top style from blend
    let topStyle = 'coastal';
    if (style_blend && typeof style_blend === 'object') {
      const entries = Object.entries(style_blend) as [string, number][];
      if (entries.length > 0) {
        entries.sort(([, a], [, b]) => b - a);
        topStyle = entries[0][0];
      }
    }

    let query = supabase
      .from('products')
      .select('id, name, description, price, retailer, affiliate_url, category, room_types, style_tags, image_url, width_inches, depth_inches, height_inches')
      .contains('style_tags', [topStyle]);

    if (room_type) {
      query = query.contains('room_types', [room_type]);
    }

    if (budget && budget > 0) {
      query = query.lte('price', budget);
    }

    const { data: fallbackResults } = await query
      .order('price', { ascending: true })
      .limit(matchCount);

    return new Response(
      JSON.stringify({ products: fallbackResults ?? [] }),
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

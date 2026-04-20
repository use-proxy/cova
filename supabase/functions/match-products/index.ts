// DORMANT — Curated product catalog infrastructure
// Not used by active v9 product matching (Serper + Google Lens + client-side CLIP).
// Preserved for possible future use (preferred-supplier feature, fallback path, or v2 catalog matching).
// Last reviewed: 2026-04-19
// Active v9 path lives in apps/web/app/api/match/route.ts

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
      // Re-rank by combining CLIP similarity with style match score
      const blendKeys = ['coastal', 'japandi', 'bohemian', 'mid_century', 'minimalist'];
      const reranked = rpcResults.map((p: Record<string, unknown>) => {
        const clipScore = typeof p.similarity === 'number' ? p.similarity : 0.5;
        let styleScore = 0;
        const pw = p.style_weights as Record<string, number> | null;
        if (pw && style_blend && typeof style_blend === 'object') {
          for (const k of blendKeys) {
            styleScore += (pw[k] ?? 0) * ((style_blend as Record<string, number>)[k] ?? 0);
          }
        }
        return { ...p, final_score: 0.7 * clipScore + 0.3 * styleScore };
      });
      reranked.sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
        (b.final_score as number) - (a.final_score as number));
      const top8 = reranked.slice(0, 8);
      return new Response(
        JSON.stringify({ products: top8 }),
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

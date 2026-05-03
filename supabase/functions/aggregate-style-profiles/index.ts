// DEPRECATED 2026-05-02 — V1 demolition; tables dropped (swipe_history schema
// changed; product_interactions, user_style_profiles, style_purchase_signals
// removed). The aggregate-style-profiles cron job was also removed in P01a M1.
// This file is retained per CLAUDE.md Rule 12 (frozen Edge Functions). It will
// no longer be invoked by any production caller. Do not extend.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const STYLE_KEYS = ['coastal', 'japandi', 'bohemian', 'minimalist', 'mid_century'];

/**
 * Shannon entropy of a 5-value probability distribution, normalized to [0,1].
 * 0 = perfectly peaked (one style dominates), 1 = uniform (all equal).
 */
function shannonEntropy(vec: Record<string, number>): number {
  const values = STYLE_KEYS.map((k) => vec[k] ?? 0);
  const total = values.reduce((s, v) => s + v, 0);
  if (total === 0) return 1;

  const log5 = Math.log(5);
  let entropy = 0;
  for (const v of values) {
    const p = v / total;
    if (p > 0) entropy -= p * Math.log(p);
  }
  return entropy / log5;
}

function dominantStyle(vec: Record<string, number>): string {
  let best = STYLE_KEYS[0];
  let bestVal = -Infinity;
  for (const k of STYLE_KEYS) {
    if ((vec[k] ?? 0) > bestVal) {
      bestVal = vec[k] ?? 0;
      best = k;
    }
  }
  return best;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Verify authorization — accept service role key or valid user token
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let processed = 0;
  let errors = 0;
  const errorDetails: Array<{ user_id: string; error: string }> = [];

  try {
    // Find all user IDs that have at least 1 swipe_history row
    const { data: userRows, error: userErr } = await supabase
      .from('swipe_history')
      .select('user_id')
      .not('user_id', 'is', null);

    if (userErr) throw new Error(`Failed to fetch users: ${userErr.message}`);
    if (!userRows || userRows.length === 0) {
      return new Response(
        JSON.stringify({ processed: 0, errors: 0, timestamp: new Date().toISOString() }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Deduplicate user IDs
    const userIds = [...new Set(userRows.map((r: { user_id: string }) => r.user_id))];

    for (const userId of userIds) {
      try {
        // --- a) style_vector ---
        let styleVector: Record<string, number> | null = null;

        // Try rooms.style_blend first (most recent room)
        const { data: roomRow } = await supabase
          .from('rooms')
          .select('style_blend')
          .eq('user_id', userId)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (roomRow?.style_blend && typeof roomRow.style_blend === 'object') {
          styleVector = roomRow.style_blend as Record<string, number>;
        } else {
          // Fallback: final style_vector_after from most recent swipe
          const { data: swipeRow } = await supabase
            .from('swipe_history')
            .select('style_vector_after')
            .eq('user_id', userId)
            .not('style_vector_after', 'is', null)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (swipeRow?.style_vector_after) {
            styleVector = swipeRow.style_vector_after as Record<string, number>;
          }
        }

        // --- b) swipe_count ---
        const { count: swipeCount } = await supabase
          .from('swipe_history')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId);

        // --- c) rooms_completed ---
        const { count: roomsCompleted } = await supabase
          .from('rooms')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('status', 'complete');

        // --- d) products_unlocked ---
        const { count: productsUnlocked } = await supabase
          .from('product_interactions')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('interaction_type', 'unlocked');

        // --- e) products_purchased ---
        const { count: productsPurchased } = await supabase
          .from('product_interactions')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('interaction_type', 'purchased');

        // --- f) dominant_style ---
        const domStyle = styleVector ? dominantStyle(styleVector) : null;

        // --- g) style_certainty ---
        const certainty = styleVector ? 1 - shannonEntropy(styleVector) : null;

        // --- h) price_range_preference ---
        let priceRange: { min: number; max: number; avg: number } | null = null;
        const { data: priceRows } = await supabase
          .from('product_interactions')
          .select('price_at_time')
          .eq('user_id', userId)
          .in('interaction_type', ['unlocked', 'purchased'])
          .not('price_at_time', 'is', null);

        if (priceRows && priceRows.length > 0) {
          const prices = priceRows.map((r: { price_at_time: number }) => r.price_at_time);
          priceRange = {
            min: Math.min(...prices),
            max: Math.max(...prices),
            avg: prices.reduce((s: number, p: number) => s + p, 0) / prices.length,
          };
        }

        // --- i) preferred_retailers ---
        let preferredRetailers: string[] = [];
        const { data: retailerRows } = await supabase
          .from('product_interactions')
          .select('affiliate_retailer')
          .eq('user_id', userId)
          .eq('interaction_type', 'purchased')
          .not('affiliate_retailer', 'is', null);

        if (retailerRows && retailerRows.length > 0) {
          // Count per retailer and sort descending
          const counts: Record<string, number> = {};
          for (const r of retailerRows) {
            const name = (r as { affiliate_retailer: string }).affiliate_retailer;
            counts[name] = (counts[name] || 0) + 1;
          }
          preferredRetailers = Object.entries(counts)
            .sort(([, a], [, b]) => b - a)
            .map(([name]) => name);
        }

        // --- j) category_affinity ---
        let categoryAffinity: Record<string, number> | null = null;
        const { data: catRows } = await supabase
          .from('product_interactions')
          .select('product_id, products(category)')
          .eq('user_id', userId)
          .in('interaction_type', ['unlocked', 'purchased']);

        if (catRows && catRows.length > 0) {
          const catCounts: Record<string, number> = {};
          for (const r of catRows) {
            const product = (r as { products: { category: string } | null }).products;
            const cat = product?.category;
            if (cat) catCounts[cat] = (catCounts[cat] || 0) + 1;
          }
          const totalCat = Object.values(catCounts).reduce((s, v) => s + v, 0);
          if (totalCat > 0) {
            categoryAffinity = {};
            for (const [cat, count] of Object.entries(catCounts)) {
              categoryAffinity[cat] = Math.round((count / totalCat) * 1000) / 1000;
            }
          }
        }

        // --- UPSERT into user_style_profiles ---
        const { error: upsertErr } = await supabase
          .from('user_style_profiles')
          .upsert(
            {
              user_id: userId,
              style_vector: styleVector,
              swipe_count: swipeCount ?? 0,
              rooms_completed: roomsCompleted ?? 0,
              products_unlocked: productsUnlocked ?? 0,
              products_purchased: productsPurchased ?? 0,
              dominant_style: domStyle,
              style_certainty: certainty,
              price_range_preference: priceRange,
              preferred_retailers: preferredRetailers,
              category_affinity: categoryAffinity,
              last_updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id' },
          );

        if (upsertErr) throw new Error(`Upsert failed: ${upsertErr.message}`);

        // --- STEP 4: Write style_purchase_signals for new interactions ---
        const { data: interactions } = await supabase
          .from('product_interactions')
          .select('id, user_id, product_id, interaction_type, affiliate_retailer, price_at_time, style_vector_at_time, created_at, products(category, retailer)')
          .eq('user_id', userId)
          .in('interaction_type', ['unlocked', 'purchased']);

        if (interactions && interactions.length > 0) {
          for (const ix of interactions) {
            const ixTyped = ix as {
              id: string;
              user_id: string;
              product_id: string;
              interaction_type: string;
              affiliate_retailer: string | null;
              price_at_time: number | null;
              style_vector_at_time: Record<string, number> | null;
              created_at: string;
              products: { category: string; retailer: string } | null;
            };

            // Check if a signal already exists within 1 minute of this interaction
            const createdAt = new Date(ixTyped.created_at);
            const windowStart = new Date(createdAt.getTime() - 60_000).toISOString();
            const windowEnd = new Date(createdAt.getTime() + 60_000).toISOString();

            const { data: existing } = await supabase
              .from('style_purchase_signals')
              .select('id')
              .eq('user_id', ixTyped.user_id)
              .eq('product_id', ixTyped.product_id)
              .gte('created_at', windowStart)
              .lte('created_at', windowEnd)
              .limit(1);

            if (existing && existing.length > 0) continue;

            await supabase.from('style_purchase_signals').insert({
              user_id: ixTyped.user_id,
              style_vector: ixTyped.style_vector_at_time ?? styleVector,
              product_id: ixTyped.product_id,
              product_category: ixTyped.products?.category ?? null,
              product_retailer: ixTyped.affiliate_retailer ?? ixTyped.products?.retailer ?? null,
              product_price: ixTyped.price_at_time,
              clip_score: null,
              signal_type: ixTyped.interaction_type,
              room_style: domStyle,
              created_at: ixTyped.created_at,
            });
          }
        }

        processed++;
      } catch (userError) {
        errors++;
        const msg = userError instanceof Error ? userError.message : String(userError);
        errorDetails.push({ user_id: userId, error: msg });
        console.error(`[aggregate] Error for user ${userId}: ${msg}`);
      }
    }
  } catch (topError) {
    const msg = topError instanceof Error ? topError.message : String(topError);
    console.error(`[aggregate] Fatal error: ${msg}`);
    return new Response(
      JSON.stringify({ error: msg, processed, errors, timestamp: new Date().toISOString() }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const result = {
    processed,
    errors,
    timestamp: new Date().toISOString(),
    ...(errorDetails.length > 0 ? { error_details: errorDetails } : {}),
  };

  console.log(`[aggregate] Complete: ${processed} processed, ${errors} errors`);

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});

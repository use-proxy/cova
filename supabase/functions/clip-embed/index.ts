// DORMANT — Curated product catalog infrastructure
// Not used by active v9 product matching (Serper + Google Lens + client-side CLIP).
// Preserved for possible future use (preferred-supplier feature, fallback path, or v2 catalog matching).
// Last reviewed: 2026-04-19
// Active v9 path lives in apps/web/app/api/match/route.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const HF_ENDPOINT =
  'https://router.huggingface.co/hf-inference/models/openai/clip-vit-large-patch14/pipeline/feature-extraction';

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
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const hfToken = Deno.env.get('HUGGINGFACE_API_TOKEN');
    if (!hfToken) {
      return new Response(
        JSON.stringify({ error: 'HUGGINGFACE_API_TOKEN is not set' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { image_url } = await req.json();

    if (!image_url) {
      return new Response(
        JSON.stringify({ error: 'Provide image_url' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const hfRes = await fetch(HF_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${hfToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ inputs: [image_url] }),
    });

    if (!hfRes.ok) {
      const err = await hfRes.text();
      return new Response(
        JSON.stringify({ error: `Hugging Face API error: ${err}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const result: number[][] = await hfRes.json();
    const embedding = result[0];

    return new Response(
      JSON.stringify({ embedding }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

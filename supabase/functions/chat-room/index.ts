import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// ─── Style helpers ────────────────────────────────────────────────────────────

const STYLE_DISPLAY: Record<string, string> = {
  coastal: 'Coastal',
  japandi: 'Japandi',
  bohemian: 'Bohemian',
  mid_century: 'Mid-Century Modern',
  minimalist: 'Minimalist',
};

function buildStyleBlendString(blend: Record<string, number>): string {
  const entries = Object.entries(blend)
    .filter(([, v]) => v > 0.04)
    .sort(([, a], [, b]) => b - a);
  if (entries.length === 0) return 'modern';
  return entries
    .map(([k, v]) => `${Math.round(v * 100)}% ${STYLE_DISPLAY[k] ?? k}`)
    .join(', ');
}

function parseDimsToFeet(dims: Record<string, number>): string {
  const unit = (dims.unit as string) ?? 'm';
  const factor = unit === 'm' ? 3.281 : 1;
  const w = Math.round((dims.width ?? 16) * factor);
  const d = Math.round((dims.depth ?? 14) * factor);
  const h = Math.round((dims.height ?? 9) * factor);
  return `${w} ft wide × ${d} ft deep × ${h} ft tall`;
}

// ─── Action trigger parsing ────────────────────────────────────────────────────

interface ActionTrigger {
  type: string;
  data: Record<string, unknown> | null;
}

function parseActionTrigger(text: string): { cleanedText: string; actionTrigger: ActionTrigger | null } {
  // Match "ACTION: KEYWORD" or "ACTION: KEYWORD {json}" on its own line
  const regex = /^ACTION:\s*([A-Z_]+)(?:\s+(\{[\s\S]*?\}))?\s*$/m;
  const match = text.match(regex);
  if (!match) return { cleanedText: text, actionTrigger: null };

  const type = match[1];
  let data: Record<string, unknown> | null = null;
  if (match[2]) {
    try { data = JSON.parse(match[2]); } catch { /* keep null */ }
  }

  const cleanedText = text.replace(regex, '').replace(/\n{3,}/g, '\n\n').trim();
  return { cleanedText, actionTrigger: { type, data } };
}

// ─── Product keyword extraction ────────────────────────────────────────────────

function extractProductKeyword(text: string): string | null {
  const patterns = [
    /\badd(?:ing)?\s+(?:a\s+|an\s+)?([a-z][a-z\s]{3,28}?)(?:\s+to|\s+in|\s+for|\s+would|\.)/i,
    /\bconsider(?:ing)?\s+(?:a\s+|an\s+)?([a-z][a-z\s]{3,28}?)(?:\s+for|\s+would|\s+to|\.)/i,
    /\brecommend\s+(?:a\s+|an\s+)?([a-z][a-z\s]{3,28}?)(?:\s+for|\s+would|\s+to|\.)/i,
    /\btry\s+(?:a\s+|an\s+)?([a-z][a-z\s]{3,28}?)(?:\s+for|\s+would|\s+to|\.)/i,
    /\bplace\s+(?:a\s+|an\s+)?([a-z][a-z\s]{3,28}?)(?:\s+in|\s+for|\s+would|\.)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1] && m[1].trim().length >= 4) {
      return m[1].trim().replace(/\s+/g, ' ');
    }
  }
  return null;
}

// ─── Deno entry point ────────────────────────────────────────────────────────

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

    const body = await req.json();
    const {
      room_id,
      render_image_url,
      tap_x,
      tap_y,
      chat_history,
      furniture_list,
      pinned_products,
      last_render_prompt,
    } = body;

    // ── Rate limiting: 60 messages per user per hour ──
    const { data: rateLimitOk } = await supabase.rpc('check_rate_limit', {
      p_user_id: user.id,
      p_action: 'chat',
      p_max_requests: 60,
    });
    if (rateLimitOk === false) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded, try again later' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Sanitize user message ──
    let message: string = typeof body.message === 'string' ? body.message : '';
    // Server-side 500 char truncation
    if (message.length > 500) message = message.slice(0, 500);
    // Strip prompt injection attempts
    const INJECTION_PATTERNS = [
      /ignore\s+(?:all\s+)?previous\s+instructions/gi,
      /system\s+prompt/gi,
      /you\s+are\s+now/gi,
      /disregard\s+(?:all\s+)?(?:previous|above|prior)/gi,
      /forget\s+(?:all\s+)?(?:previous|your|the)/gi,
      /new\s+instructions?\s*:/gi,
    ];
    for (const pattern of INJECTION_PATTERNS) {
      if (pattern.test(message)) {
        console.warn(`[SECURITY] Prompt injection attempt from user ${user.id}: ${message.slice(0, 100)}`);
        message = message.replace(pattern, '[filtered]');
      }
    }

    // ── Fetch room with full context ──
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('id, room_type, dimensions_json, style_blend, budget, render_count')
      .eq('id', room_id)
      .single();

    if (roomError || !room) {
      return new Response(JSON.stringify({ error: 'Room not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Build system prompt per spec §19 ──
    const roomTypeName = (room.room_type ?? 'room').replace(/_/g, ' ');
    const blendStr = buildStyleBlendString(room.style_blend ?? {});
    const budgetStr = `$${(room.budget ?? 5000).toLocaleString()}`;
    const dims = room.dimensions_json ?? { width: 4.9, depth: 4.3, height: 2.7, unit: 'm' };
    const dimsStr = parseDimsToFeet(dims as Record<string, number>);
    const renderCount: number = room.render_count ?? 0;

    const furnitureStr = Array.isArray(furniture_list) && furniture_list.length > 0
      ? (furniture_list as string[]).join(', ')
      : 'No furniture placed yet';

    interface PinnedItem { name: string; retailer?: string }
    const pinnedStr = Array.isArray(pinned_products) && pinned_products.length > 0
      ? (pinned_products as PinnedItem[])
          .map((p) => `${p.name}${p.retailer ? ` (${p.retailer})` : ''}`)
          .join(', ')
      : 'None pinned';

    const lastPromptStr = last_render_prompt ?? 'Not recorded';

    const tapContext = tap_x != null
      ? `\n\nThe user has indicated a specific area: approximately ${tap_x}% from the left and ${tap_y}% from the top of the room image. Focus your response on that area.`
      : '';

    const systemPrompt = `You are Cova's interior design advisor helping a user redesign their ${roomTypeName}.

Style blend: ${blendStr}
Budget: ${budgetStr}
Room dimensions: ${dimsStr}
Current furniture in 3D viewer: ${furnitureStr}
Pinned products: ${pinnedStr}
Renders generated for this room: ${renderCount}
Last render prompt used: ${lastPromptStr}

Give specific, actionable interior design advice personalized to THIS exact room. Never give generic advice. Always reference their specific style blend, furniture, and room in every response. Be warm, concise, and encouraging. Never mention AI, FLUX, ControlNet, or any technical rendering terms.

When appropriate, you may include ONE action trigger at the very end of your response on its own line. Use ONLY these exact formats:
ACTION: REGENERATE
ACTION: ADJUST_BLEND {"coastal":0.6,"japandi":0.4,"bohemian":0,"mid_century":0,"minimalist":0}
ACTION: OPEN_SHOP {"category":"seating"}
ACTION: PIN_PRODUCT {"product_id":"PRODUCT_UUID","product_name":"Product Name"}

Rules for actions:
- REGENERATE: only suggest when advice requires seeing a new visual
- ADJUST_BLEND: only when user explicitly wants to change their style; weights must sum to 1.0
- OPEN_SHOP: when user needs to browse products; include most relevant category
- PIN_PRODUCT: only if a specific pinned product_id was provided in context
- NEVER include more than one action per response
- REGENERATE and ADJUST_BLEND will require user confirmation before executing${tapContext}`;

    // ── Build messages array ──
    const messages: Array<{ role: string; content: unknown }> = [];
    if (Array.isArray(chat_history)) {
      for (const entry of chat_history as Array<{ role: string; content: string }>) {
        messages.push({ role: entry.role, content: entry.content });
      }
    }

    if (render_image_url) {
      messages.push({
        role: 'user',
        content: [
          { type: 'image', source: { type: 'url', url: render_image_url } },
          { type: 'text', text: message },
        ],
      });
    } else {
      messages.push({ role: 'user', content: message });
    }

    // ── Call Claude API ──
    const anthropicResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        messages,
      }),
    });

    if (!anthropicResp.ok) {
      const errText = await anthropicResp.text();
      console.error('Anthropic API error:', errText);
      return new Response(
        JSON.stringify({ error: 'chat_service_unavailable', message: 'AI assistant is temporarily unavailable.' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const anthropicData = await anthropicResp.json();
    const rawResponse: string = anthropicData.content?.[0]?.text ?? "I couldn't generate a response. Please try again.";

    // ── Parse action trigger ──
    const { cleanedText, actionTrigger } = parseActionTrigger(rawResponse);

    // ── Search for inline product card ──
    let suggestedProduct: Record<string, unknown> | null = null;
    const productKeyword = extractProductKeyword(cleanedText);
    if (productKeyword) {
      const { data: productRows } = await supabase
        .from('products')
        .select('id, name, price, image_url, retailer, style_tags, affiliate_url, category')
        .ilike('name', `%${productKeyword.split(' ').slice(0, 2).join('%')}%`)
        .limit(1);
      if (productRows && productRows.length > 0) {
        suggestedProduct = productRows[0] as Record<string, unknown>;
      }
    }

    // ── Persist messages ──
    await supabase.from('chat_messages').insert({
      room_id,
      user_id: user.id,
      role: 'user',
      content: message,
      tap_x: tap_x ?? null,
      tap_y: tap_y ?? null,
    });

    await supabase.from('chat_messages').insert({
      room_id,
      user_id: user.id,
      role: 'assistant',
      content: cleanedText,
      action_trigger: actionTrigger,
    });

    return new Response(
      JSON.stringify({
        message: cleanedText,
        action_trigger: actionTrigger,
        suggested_product: suggestedProduct,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('chat-room error:', err);
    return new Response(
      JSON.stringify({ error: 'internal_error', message: 'An unexpected error occurred.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

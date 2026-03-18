import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const STYLE_DISPLAY: Record<string, string> = {
  coastal: 'coastal',
  japandi: 'japandi',
  bohemian: 'bohemian',
  mid_century: 'mid-century modern',
  minimalist: 'minimalist',
};

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

    const { room_id, message, render_image_base64, tap_x, tap_y, chat_history } = await req.json();

    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('id, room_type, dimensions_json, style_blend, budget')
      .eq('id', room_id)
      .single();

    if (roomError || !room) {
      return new Response(JSON.stringify({ error: 'Room not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Determine top style from blend
    let topStyleLabel = 'modern';
    if (room.style_blend && typeof room.style_blend === 'object') {
      const entries = Object.entries(room.style_blend) as [string, number][];
      if (entries.length > 0) {
        entries.sort(([, a], [, b]) => b - a);
        topStyleLabel = STYLE_DISPLAY[entries[0][0]] ?? entries[0][0];
        if (entries.length > 1 && entries[1][1] > 0.15) {
          topStyleLabel += ` with ${STYLE_DISPLAY[entries[1][0]] ?? entries[1][0]} accents`;
        }
      }
    }

    const dims = room.dimensions_json ?? { width: 16, depth: 14, height: 9 };
    const roomTypeName = (room.room_type ?? 'room').replace(/_/g, ' ');
    const budgetStr = (room.budget ?? 5000).toLocaleString();

    let systemPrompt = `You are Cova, an expert and enthusiastic AI interior designer. You are looking at a photorealistic AI render of the user's ${roomTypeName}. The room is approximately ${dims.width} ft wide, ${dims.depth} ft deep, and ${dims.height} ft tall. The user's design style leans toward ${topStyleLabel}. Their total room budget is $${budgetStr}. Help them make specific, achievable design improvements. Be warm, encouraging, and concise. Focus on what will make the biggest visual impact. Never mention AI, FLUX, ControlNet, or any technical rendering terms.`;

    if (tap_x != null && tap_y != null) {
      systemPrompt += ` The user has indicated a specific area of the room — approximately ${tap_x}% from the left and ${tap_y}% from the top of the image. Focus your response on that particular area or element.`;
    }

    // Build messages array from chat history
    const messages: Array<{ role: string; content: unknown }> = [];
    if (Array.isArray(chat_history)) {
      for (const entry of chat_history) {
        messages.push({ role: entry.role, content: entry.content });
      }
    }

    // Add new user message — vision message if render image provided
    if (render_image_base64) {
      messages.push({
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: render_image_base64 } },
          { type: 'text', text: message },
        ],
      });
    } else {
      messages.push({ role: 'user', content: message });
    }

    const anthropicResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
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
    const responseText = anthropicData.content?.[0]?.text ?? 'I couldn\'t generate a response. Please try again.';

    // Persist user message
    await supabase.from('chat_messages').insert({
      room_id,
      user_id: user.id,
      role: 'user',
      content: message,
      tap_x: tap_x ?? null,
      tap_y: tap_y ?? null,
    });

    // Persist assistant message
    await supabase.from('chat_messages').insert({
      room_id,
      user_id: user.id,
      role: 'assistant',
      content: responseText,
    });

    return new Response(
      JSON.stringify({ message: responseText }),
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

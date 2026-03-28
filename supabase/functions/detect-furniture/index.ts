// detect-furniture — Sprint 5, Item 5
// Option C hybrid: Claude vision API primary → smart layout fallback.
// Returns suggested furniture placements based on the render image + room type.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface FurnitureSuggestion {
  catalog_id: string;
  category: string;
  position_x: number;
  position_y: number;
  rotation_y: number;
}

interface RoomDims {
  width: number;
  depth: number;
  height: number;
}

// Smart layout algorithm: positions furniture by category within room bounds
// Uses the spec's intent: sofa back wall, chairs facing sofa, table centered
function smartLayout(
  roomType: string,
  dims: RoomDims,
): FurnitureSuggestion[] {
  const w = dims.width;
  const d = dims.depth;
  const margin = 0.4; // distance from wall center-line

  const layouts: Record<string, FurnitureSuggestion[]> = {
    living_room: [
      // Sofa: back wall, facing forward (rotation 0 = facing +z / doorway)
      { catalog_id: 'sofa_01', category: 'seating', position_x: 0, position_y: -(d / 2 - margin - 0.5), rotation_y: 0 },
      // Coffee table: in front of sofa
      { catalog_id: 'coffee_table_01', category: 'tables', position_x: 0, position_y: -(d / 2 - margin - 1.5), rotation_y: 0 },
      // Accent chair: left side, angled toward sofa
      { catalog_id: 'accent_chair_01', category: 'seating', position_x: -(w / 2 - margin - 0.5), position_y: -(d / 2 - margin - 0.5), rotation_y: Math.PI / 4 },
      // Floor lamp: back left corner
      { catalog_id: 'floor_lamp_01', category: 'lighting', position_x: -(w / 2 - margin - 0.3), position_y: -(d / 2 - margin - 0.3), rotation_y: 0 },
      // Plant: back right corner
      { catalog_id: 'plant_01', category: 'plants', position_x: w / 2 - margin - 0.3, position_y: -(d / 2 - margin - 0.3), rotation_y: 0 },
    ],
    dining_room: [
      // Dining table: center
      { catalog_id: 'dining_table_01', category: 'tables', position_x: 0, position_y: 0, rotation_y: 0 },
      // Chairs around table
      { catalog_id: 'dining_chair_01', category: 'seating', position_x: -0.5, position_y: -0.8, rotation_y: 0 },
      { catalog_id: 'dining_chair_02', category: 'seating', position_x: 0.5, position_y: -0.8, rotation_y: 0 },
      { catalog_id: 'dining_chair_03', category: 'seating', position_x: -0.5, position_y: 0.8, rotation_y: Math.PI },
      { catalog_id: 'dining_chair_04', category: 'seating', position_x: 0.5, position_y: 0.8, rotation_y: Math.PI },
    ],
    bedroom: [
      // Bed: back wall, centered
      { catalog_id: 'bed_01', category: 'beds', position_x: 0, position_y: -(d / 2 - margin - 1.0), rotation_y: 0 },
      // Nightstand: left of bed
      { catalog_id: 'nightstand_01', category: 'tables', position_x: -1.0, position_y: -(d / 2 - margin - 0.5), rotation_y: 0 },
      // Nightstand: right of bed
      { catalog_id: 'nightstand_02', category: 'tables', position_x: 1.0, position_y: -(d / 2 - margin - 0.5), rotation_y: 0 },
      // Dresser: side wall
      { catalog_id: 'dresser_01', category: 'storage', position_x: -(w / 2 - margin - 0.4), position_y: 0, rotation_y: Math.PI / 2 },
    ],
    home_office: [
      // Desk: back wall or side wall
      { catalog_id: 'desk_01', category: 'tables', position_x: -(w / 2 - margin - 0.6), position_y: -(d / 2 - margin - 0.5), rotation_y: Math.PI / 2 },
      // Office chair: in front of desk
      { catalog_id: 'office_chair_01', category: 'seating', position_x: -(w / 2 - margin - 0.6), position_y: -(d / 2 - margin - 1.2), rotation_y: -Math.PI / 2 },
      // Bookcase: side wall
      { catalog_id: 'bookcase_01', category: 'storage', position_x: w / 2 - margin - 0.3, position_y: 0, rotation_y: -Math.PI / 2 },
    ],
  };

  return layouts[roomType] ?? layouts.living_room;
}

// Claude vision API: analyze render image to detect furniture placement
async function claudeVisionLayout(
  renderUrl: string,
  roomType: string,
  dims: RoomDims,
  anthropicKey: string,
): Promise<FurnitureSuggestion[] | null> {
  try {
    const prompt = `You are analyzing a rendered room image to suggest furniture placement positions.
Room type: ${roomType}
Room dimensions: ${dims.width}m wide × ${dims.depth}m deep × ${dims.height}m high

The coordinate system:
- Origin (0,0) is center of the room floor
- X axis: left (negative) to right (positive), range: ${-dims.width / 2} to ${dims.width / 2}
- Y axis (floor depth): back wall (negative) to front/doorway (positive), range: ${-dims.depth / 2} to ${dims.depth / 2}
- Rotation Y: 0 = facing doorway, Math.PI = facing back wall, Math.PI/2 = facing right wall

Based on the furniture you can see in the render image, suggest placement positions for a 3D viewer arrangement.
Return a JSON array of furniture items with this structure:
[{"catalog_id": "sofa_01", "category": "seating", "position_x": 0, "position_y": -1.5, "rotation_y": 0}]

Include 3-6 items max. Use realistic positions that respect room boundaries. Respond with ONLY the JSON array, no other text.`;

    const imageRes = await fetch(renderUrl);
    if (!imageRes.ok) return null;
    const imageData = await imageRes.arrayBuffer();
    const base64Image = btoa(String.fromCharCode(...new Uint8Array(imageData)));
    const mimeType = renderUrl.includes('.png') ? 'image/png' : 'image/jpeg';

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64Image } },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });

    if (!res.ok) return null;
    const json = await res.json() as { content: Array<{ text: string }> };
    const text = json.content?.[0]?.text ?? '';
    const parsed = JSON.parse(text) as FurnitureSuggestion[];
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed;
  } catch (e) {
    console.warn('Claude vision layout failed, using smart fallback:', e);
    return null;
  }
}

// @ts-expect-error Deno.serve global
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verify JWT
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabaseClient = createClient(
      // @ts-expect-error Deno env
      Deno.env.get('SUPABASE_URL') ?? '',
      // @ts-expect-error Deno env
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );
    const { error: authError } = await supabaseClient.auth.getUser();
    if (authError) return respond({ error: 'Unauthorized' }, 401);

    const { render_url, room_type, room_dimensions } = await req.json() as {
      render_url?: string;
      room_type?: string;
      room_dimensions?: RoomDims;
    };

    const dims: RoomDims = room_dimensions ?? { width: 4.9, depth: 4.3, height: 2.7 };
    const type = room_type ?? 'living_room';

    // @ts-expect-error Deno env
    const anthropicKey: string = Deno.env.get('ANTHROPIC_API_KEY') ?? '';

    let suggestions: FurnitureSuggestion[] | null = null;

    // Primary: Claude vision analysis (requires render URL + API key)
    if (render_url && anthropicKey) {
      suggestions = await claudeVisionLayout(render_url, type, dims, anthropicKey);
    }

    // Fallback: smart layout algorithm
    if (!suggestions || suggestions.length === 0) {
      suggestions = smartLayout(type, dims);
    }

    return respond({ suggestions, source: suggestions === smartLayout(type, dims) ? 'smart_layout' : 'claude_vision' });
  } catch (e) {
    console.error('detect-furniture error:', e);
    return respond({ error: 'Internal server error' }, 500);
  }
});

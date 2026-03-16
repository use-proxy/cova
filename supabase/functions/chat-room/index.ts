import { corsHeaders } from '../_shared/cors.ts';

// chat-room Edge Function — stub for Phase 5
// Will be fully implemented with Claude API integration in Phase 5.

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({ message: 'chat-room function is not yet implemented. Coming in Phase 5.' }),
    { status: 501, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});

import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redactLogPayload } from "@/lib/log/redact";

interface RoomContext {
  styleFingerprint?: Record<string, string | null>;
  budgetTier?: number;
  budgetRange?: string;
  roomType?: string;
  furniture?: string[];
  totalCost?: number;
}

export async function POST(request: Request) {
  try {
    const { messages, context, roomId, styleBlend, budget } =
      (await request.json()) as {
        messages: { role: "user" | "assistant"; content: string }[];
        context?: RoomContext;
        roomId?: string;
        styleBlend?: string;
        budget?: string;
      };

    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options),
              );
            } catch {
              /* ignore in read contexts */
            }
          },
        },
      },
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Fetch real room context from Supabase if roomId provided
    let roomStyleBlend = styleBlend ?? null;
    let roomBudgetTier = budget ?? null;
    let roomProductLabels: string[] = [];
    let roomTotalCost = 0;

    if (roomId) {
      try {
        const { data: room } = await supabase
          .from("rooms")
          .select("style_blend, budget_tier")
          .eq("id", roomId)
          .eq("user_id", user.id)
          .single();

        const { data: roomProducts } = room
          ? await supabase
              .from("room_products")
              .select("furniture_label, matches")
              .eq("room_id", roomId)
          : { data: null };

        if (room) {
          if (room.style_blend) roomStyleBlend = room.style_blend;
          if (room.budget_tier) roomBudgetTier = String(room.budget_tier);
        }

        if (roomProducts) {
          roomProductLabels = roomProducts.map(
            (p: { furniture_label: string }) => p.furniture_label,
          );
          roomTotalCost = roomProducts.reduce(
            (sum: number, p: { matches: { price: number }[] }) => {
              const topMatch = p.matches?.[0];
              return sum + (topMatch?.price ?? 0);
            },
            0,
          );
        }
      } catch (err) {
        console.error("Failed to fetch room context from Supabase:", redactLogPayload(err));
      }
    }

    // Fall back to context object values if Supabase fetch didn't populate
    const styleDesc =
      roomStyleBlend ??
      (context?.styleFingerprint
        ? Object.values(context.styleFingerprint).filter(Boolean).join(", ")
        : null) ??
      "contemporary";

    const budgetDesc = roomBudgetTier ?? context?.budgetRange ?? "mid-range";

    const furniture =
      roomProductLabels.length > 0
        ? roomProductLabels
        : (context?.furniture ?? []);

    const totalCost =
      roomTotalCost > 0 ? roomTotalCost : (context?.totalCost ?? 0);

    const systemPrompt = `You are Cova AI, an expert interior design assistant. The user's room has been redesigned in ${styleDesc} style with a ${budgetDesc} budget.${furniture.length > 0 ? ` Detected furniture: ${furniture.join(", ")}.` : ""}${totalCost > 0 ? ` Total estimated cost: $${totalCost.toLocaleString()}.` : ""} You help users refine their design, find furniture, and make style decisions. Be concise, warm, and specific.

When recommending products, include structured data in this format within your message:
<products>
[{"name": "Product Name", "price": 599, "retailer": "Retailer", "image": "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=300", "url": "#"}]
</products>

Never mention that you are Claude or made by Anthropic. You are Cova AI.`;

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const stream = client.messages.stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }
        } catch (err) {
          console.error("Stream iteration error:", redactLogPayload(err));
          // Send error text so frontend can display it
          controller.enqueue(encoder.encode(`[Error: ${String(err)}]`));
        }
        controller.close();
      },
    });

    return new Response(readable, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (error) {
    console.error("Chat API error:", redactLogPayload(error));
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

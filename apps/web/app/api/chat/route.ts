import Anthropic from "@anthropic-ai/sdk"

interface RoomContext {
  styleFingerprint?: Record<string, string | null>
  budgetTier?: number
  budgetRange?: string
  roomType?: string
  furniture?: string[]
  totalCost?: number
}

export async function POST(request: Request) {
  console.log("Chat API called")
  console.log("API key exists:", !!process.env.ANTHROPIC_API_KEY)
  console.log("API key prefix:", process.env.ANTHROPIC_API_KEY?.slice(0, 12))

  try {
    const { messages, context } = (await request.json()) as {
      messages: { role: "user" | "assistant"; content: string }[]
      context?: RoomContext
    }

    console.log("Messages count:", messages.length)

    const systemPrompt = `You are Cova's AI interior design assistant. You are sophisticated, warm, and deeply knowledgeable about interior design, furniture, and home decor. You help users refine their AI-generated room redesign.

Current room context:
- Style fingerprint: ${context?.styleFingerprint ? JSON.stringify(context.styleFingerprint) : "not set"}
- Budget tier: ${context?.budgetTier ?? "not set"} (${context?.budgetRange ?? "not set"})
- Room type: ${context?.roomType ?? "living room"}
- Detected furniture: ${context?.furniture?.join(", ") ?? "none detected"}
- Total estimated cost: $${context?.totalCost ?? 0}

You can help with:
1. Style adjustments ("make it more minimalist" → suggest specific changes)
2. Product search ("find sofas under $1000" → return structured product data)
3. Color palette changes ("warmer tones" → suggest specific hex colors)
4. Cost breakdowns ("what's my total?" → calculate from furniture list)
5. Design advice ("how do I style this sofa?" → expert tips)

When recommending products, include structured data in this format within your message:
<products>
[{"name": "Product Name", "price": 599, "retailer": "Retailer", "image": "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=300", "url": "#"}]
</products>

Keep responses concise and conversational. Max 3 sentences unless explaining something complex. Be warm but not sycophantic. Never mention that you are Claude or made by Anthropic. You are Cova AI.`

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    console.log("Creating stream with model claude-sonnet-4-20250514")

    const stream = client.messages.stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    })

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              controller.enqueue(encoder.encode(event.delta.text))
            }
          }
          console.log("Stream completed successfully")
        } catch (err) {
          console.error("Stream iteration error:", err)
          // Send error text so frontend can display it
          controller.enqueue(encoder.encode(`[Error: ${String(err)}]`))
        }
        controller.close()
      },
    })

    return new Response(readable, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
  } catch (error) {
    console.error("Chat API error:", error)
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
}

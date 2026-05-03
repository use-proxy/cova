import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rateLimit";
import { redactLogPayload } from "@/lib/log/redact";
import type { StyleFingerprint } from "@/types/fingerprint";
import type { MatchedProduct } from "@/lib/types/match";

const anthropic = new Anthropic();

interface HotspotRef {
  label: string;
  bbox: [number, number, number, number];
}

interface CompleteRoomRequestBody {
  room_id: string;
  render_url: string;
  tapped_item_label: string;
  tapped_item_bbox: [number, number, number, number];
  all_hotspots: HotspotRef[];
  fingerprint: StyleFingerprint;
  budget_range: [number, number] | null;
  room_type: string;
}

interface ComplementaryItem {
  label: string;
  bbox: [number, number, number, number];
  products: MatchedProduct[];
  style_reason: string;
}

interface CompleteRoomResponse {
  tapped_item: string;
  complementary_items: ComplementaryItem[];
}

const MAX_ITEMS = 3;

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimit = checkRateLimit(user.id, "complete-room");
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded",
          retry_after: rateLimit.retryAfterSeconds,
        },
        { status: 429 },
      );
    }

    const body = (await request.json()) as CompleteRoomRequestBody;
    const {
      room_id,
      render_url,
      tapped_item_label,
      all_hotspots,
      fingerprint,
      budget_range,
      room_type,
    } = body;

    if (
      !room_id ||
      !render_url ||
      !tapped_item_label ||
      !Array.isArray(all_hotspots)
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    // Candidate labels = all other hotspots (exclude the tapped item itself).
    const candidateLabels = Array.from(
      new Set(
        all_hotspots
          .map((h) => h.label)
          .filter((l) => l && l !== tapped_item_label),
      ),
    );

    if (candidateLabels.length === 0) {
      const empty: CompleteRoomResponse = {
        tapped_item: tapped_item_label,
        complementary_items: [],
      };
      return NextResponse.json(empty);
    }

    // Step 1: Ask Claude to pick up to 3 items + a short style_reason for each,
    // in a single structured tool_use call.
    let picked: Array<{ label: string; reason: string }> = [];
    try {
      const vision = await anthropic.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 512,
        system:
          "You are an expert interior designer. The user is shopping for one item in a " +
          "specific room render. Identify which OTHER items currently in the room would " +
          "most benefit from being replaced to complement the shopped item stylistically.",
        tools: [
          {
            name: "pick_complementary_items",
            description:
              "Return up to 3 items from the provided list that would most complement " +
              "the tapped item stylistically, each with a one-sentence reason.",
            input_schema: {
              type: "object",
              properties: {
                items: {
                  type: "array",
                  maxItems: MAX_ITEMS,
                  items: {
                    type: "object",
                    properties: {
                      label: {
                        type: "string",
                        description:
                          "Must be one of the labels from the provided list, verbatim.",
                      },
                      reason: {
                        type: "string",
                        description:
                          "One sentence on why this item complements the tapped item.",
                      },
                    },
                    required: ["label", "reason"],
                  },
                },
              },
              required: ["items"],
            },
          },
        ],
        tool_choice: { type: "tool", name: "pick_complementary_items" },
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "url", url: render_url } },
              {
                type: "text",
                text:
                  `The user is shopping for a ${tapped_item_label} in this room.\n` +
                  `Here are all detected items in the room: ${candidateLabels.join(", ")}.\n` +
                  `Identify the 3 items from this list that would most benefit from being ` +
                  `replaced to complement the ${tapped_item_label} stylistically. ` +
                  `Return up to 3 items ordered by styling importance.`,
              },
            ],
          },
        ],
      });

      const toolBlock = vision.content.find((c) => c.type === "tool_use");
      if (toolBlock && toolBlock.type === "tool_use") {
        const raw = toolBlock.input as {
          items?: Array<{ label?: string; reason?: string }>;
        };
        picked = (raw.items ?? [])
          .map((it) => ({
            label: typeof it.label === "string" ? it.label : "",
            reason: typeof it.reason === "string" ? it.reason : "",
          }))
          .filter((it) => it.label);
      }
    } catch (err) {
      console.warn("[complete-room] Claude structured pick failed:", redactLogPayload(err));
    }

    // Filter to labels that actually exist in all_hotspots, preserve order,
    // dedup, cap at MAX_ITEMS.
    const labelToHotspot = new Map<string, HotspotRef>();
    for (const h of all_hotspots) {
      if (!labelToHotspot.has(h.label)) labelToHotspot.set(h.label, h);
    }
    const seen = new Set<string>();
    const resolved = picked
      .filter(
        (it) =>
          labelToHotspot.has(it.label) &&
          !seen.has(it.label) &&
          it.label !== tapped_item_label,
      )
      .map((it) => {
        seen.add(it.label);
        return { hotspot: labelToHotspot.get(it.label)!, reason: it.reason };
      })
      .slice(0, MAX_ITEMS);

    if (resolved.length === 0) {
      const empty: CompleteRoomResponse = {
        tapped_item: tapped_item_label,
        complementary_items: [],
      };
      return NextResponse.json(empty);
    }

    // Step 2: parallel /api/match calls for each complementary item.
    const host = request.headers.get("host") ?? "localhost:3000";
    const proto =
      request.headers.get("x-forwarded-proto") ??
      (host.startsWith("localhost") ? "http" : "https");
    const baseUrl = `${proto}://${host}`;
    const cookieHeader = request.headers.get("cookie") ?? "";

    const matchResults = await Promise.allSettled(
      resolved.map(async ({ hotspot }) => {
        const res = await fetch(`${baseUrl}/api/match`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            cookie: cookieHeader,
          },
          body: JSON.stringify({
            render_url,
            item_id: `${hotspot.label}-complete-${Date.now()}`,
            item_label: hotspot.label,
            item_bbox: hotspot.bbox,
            item_keep: false,
            fingerprint_vector: fingerprint,
            budget_range: budget_range ?? [500, 2000],
            room_type,
            room_id,
          }),
        });
        if (!res.ok) return [] as MatchedProduct[];
        const data = (await res.json()) as { products?: MatchedProduct[] };
        return (data.products ?? []).slice(0, 3);
      }),
    );

    const complementary_items: ComplementaryItem[] = resolved.map(
      ({ hotspot, reason }, i) => {
        const result = matchResults[i];
        const products =
          result && result.status === "fulfilled" ? result.value : [];
        return {
          label: hotspot.label,
          bbox: hotspot.bbox,
          products,
          style_reason: reason,
        };
      },
    );

    const response: CompleteRoomResponse = {
      tapped_item: tapped_item_label,
      complementary_items,
    };
    return NextResponse.json(response);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { paidCall } from "@/lib/paid/call";

export const maxDuration = 120;

type IntentTier =
  | "fingerprint_delta"
  | "kontext_global"
  | "region_inpaint"
  | "escape";

interface ApplyBody {
  room_id?: string;
  render_url?: string;
  instruction?: string;
  mask_url?: string;
  object_label?: string;
  room_type?: string;
  style_lora_key?: string;
  version_number?: number;
}

interface ClaudeClassifyResponse {
  tier: IntentTier;
  refined_instruction: string;
  target_object?: string | null;
}

const SOFT_CAP = 10;
const HARD_CAP = 20;

async function classifyIntent(
  instruction: string,
): Promise<ClaudeClassifyResponse | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  try {
    const data = await paidCall<{
      content?: Array<{ text?: string }>;
    }>({
      provider: "anthropic",
      url: "https://api.anthropic.com/v1/messages",
      init: {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 250,
          system:
            "Classify interior design refinement instructions. Return ONLY JSON.",
          messages: [
            {
              role: "user",
              content: `Classify: "${instruction.slice(0, 400)}"

Tiers:
- fingerprint_delta: mood/feel words (cozier, more grounded, softer)
- kontext_global: lighting/atmosphere changes (brighter, warmer, moodier)
- region_inpaint: specific object changes (replace the rug, swap the lamp)
- escape: frustration / start over

Return JSON:
{"tier": "...", "refined_instruction": "...", "target_object": "... or null"}`,
            },
          ],
        }),
        signal: AbortSignal.timeout(12_000),
      },
      costEstimate: {
        category: "refine",
        stage: "intent_classify",
        costUsd: 0.003,
        model: "claude-haiku-4-5-20251001",
      },
    });
    const text = data.content?.map((c) => c.text ?? "").join("") ?? "";
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end < 0) return null;
    const parsed = JSON.parse(text.slice(start, end + 1));
    if (!parsed?.tier) return null;
    return {
      tier: parsed.tier as IntentTier,
      refined_instruction: String(parsed.refined_instruction ?? instruction),
      target_object: parsed.target_object ?? null,
    };
  } catch {
    return null;
  }
}

async function callKontextPro(
  imageUrl: string,
  prompt: string,
  strength: number,
): Promise<string | null> {
  const apiKey = process.env.FAL_KEY;
  if (!apiKey) return null;
  try {
    const data = await paidCall<{
      images?: Array<{ url?: string } | string>;
    }>({
      provider: "fal",
      url: "https://fal.run/fal-ai/flux-kontext-pro",
      init: {
        method: "POST",
        headers: {
          Authorization: `Key ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image_url: imageUrl,
          prompt,
          strength,
          num_inference_steps: 28,
          guidance_scale: 3.5,
          output_format: "jpeg",
        }),
        signal: AbortSignal.timeout(90_000),
      },
      costEstimate: {
        category: "refine",
        stage: "kontext_global",
        costUsd: 0.045,
        model: "fal-ai/flux-kontext-pro",
      },
    });
    const first = data.images?.[0];
    if (!first) return null;
    return typeof first === "string" ? first : first.url ?? null;
  } catch {
    return null;
  }
}

async function callFillPro(
  imageUrl: string,
  maskUrl: string,
  prompt: string,
): Promise<string | null> {
  const apiKey = process.env.FAL_KEY;
  if (!apiKey) return null;
  try {
    const data = await paidCall<{
      images?: Array<{ url?: string } | string>;
    }>({
      provider: "fal",
      url: "https://fal.run/fal-ai/flux-pro/v1/fill",
      init: {
        method: "POST",
        headers: {
          Authorization: `Key ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image_url: imageUrl,
          mask_url: maskUrl,
          prompt,
          num_inference_steps: 30,
          guidance_scale: 3.8,
          output_format: "jpeg",
          safety_tolerance: "6",
        }),
        signal: AbortSignal.timeout(90_000),
      },
      costEstimate: {
        category: "refine",
        stage: "region_inpaint",
        costUsd: 0.045,
        model: "fal-ai/flux-pro/v1/fill",
      },
    });
    const first = data.images?.[0];
    if (!first) return null;
    return typeof first === "string" ? first : first.url ?? null;
  } catch {
    return null;
  }
}

async function visionChips(imageUrl: string): Promise<string[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return [];
  try {
    const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(15_000) });
    if (!imgRes.ok) return [];
    const b64 = Buffer.from(await imgRes.arrayBuffer()).toString("base64");
    const data = await paidCall<{
      content?: Array<{ text?: string }>;
    }>({
      provider: "anthropic",
      url: "https://api.anthropic.com/v1/messages",
      init: {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 200,
          system: "Return 3 short refinement suggestions. ONLY JSON array of strings.",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: "image/jpeg",
                    data: b64,
                  },
                },
                {
                  type: "text",
                  text: "Suggest 3 specific refinements a user might want, based on what you see. Return JSON array of 3 short strings (under 8 words each).",
                },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(15_000),
      },
      costEstimate: {
        category: "refine",
        stage: "vision_chips",
        costUsd: 0.005,
        model: "claude-haiku-4-5-20251001",
      },
    });
    const text = data.content?.map((c) => c.text ?? "").join("") ?? "";
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start < 0 || end < 0) return [];
    const arr = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(arr) ? arr.map((x) => String(x)).slice(0, 3) : [];
  } catch {
    return [];
  }
}

async function getIterationCount(
  roomId: string,
  userId: string,
): Promise<number> {
  const admin = createAdminSupabaseClient();
  const { count } = await admin
    .from("render_sessions")
    .select("id", { count: "exact", head: true })
    .eq("room_id", roomId)
    .eq("user_id", userId);
  return count ?? 0;
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as ApplyBody;
  if (!body.room_id || !body.render_url || !body.instruction) {
    return NextResponse.json(
      { error: "room_id, render_url, instruction required" },
      { status: 400 },
    );
  }

  const iterations = await getIterationCount(body.room_id, user.id);
  if (iterations >= HARD_CAP) {
    return NextResponse.json(
      { error: "Hard iteration cap reached (20)" },
      { status: 429 },
    );
  }

  const classified = await classifyIntent(body.instruction);
  const tier = classified?.tier ?? "kontext_global";
  const refined = classified?.refined_instruction ?? body.instruction;

  if (tier === "escape") {
    return NextResponse.json({
      tier: "escape",
      message: "Consider a style reset or fresh start",
      version: iterations + 1,
    });
  }

  let newRenderUrl: string | null = null;
  if (tier === "fingerprint_delta") {
    newRenderUrl = await callKontextPro(body.render_url, refined, 0.25);
  } else if (tier === "kontext_global") {
    newRenderUrl = await callKontextPro(body.render_url, refined, 0.45);
  } else if (tier === "region_inpaint") {
    if (!body.mask_url) {
      return NextResponse.json(
        { error: "mask_url required for region_inpaint tier" },
        { status: 400 },
      );
    }
    newRenderUrl = await callFillPro(body.render_url, body.mask_url, refined);
  }

  if (!newRenderUrl) {
    return NextResponse.json(
      { error: `Refinement failed for tier ${tier}` },
      { status: 502 },
    );
  }

  const suggestedChips = await visionChips(newRenderUrl);

  try {
    const admin = createAdminSupabaseClient();
    await admin.from("render_sessions").insert({
      room_id: body.room_id,
      user_id: user.id,
      render_url: newRenderUrl,
      iteration: iterations + 1,
      tier_used: tier,
      instruction: body.instruction,
      refined_instruction: refined,
    });
  } catch (err) {
    console.warn("[refinement/apply] render_sessions insert failed:", err);
  }

  return NextResponse.json({
    render_url: newRenderUrl,
    tier_used: tier,
    refined_instruction: refined,
    suggested_chips: suggestedChips,
    version: iterations + 1,
    soft_cap_reached: iterations + 1 >= SOFT_CAP,
  });
}

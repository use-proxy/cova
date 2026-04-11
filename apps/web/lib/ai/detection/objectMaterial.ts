/**
 * Per-object material + color extraction.
 *
 * Called after the user marks an object as KEEP on Screen C. Crops the
 * original image to the object's bbox (normalized coords) and asks
 * Claude Vision for a short, specific description of material and
 * dominant color. Output feeds the FLUX prompt so the generator knows
 * the exact constraint ("keep the distressed leather sofa in navy").
 *
 * Notes:
 * - bbox is [x, y, w, h] in normalized [0..1] coordinates (left, top,
 *   width, height), the same shape written by lib/ai/detection/grounding.ts.
 * - We do NOT decode the image in Node (sharp is forbidden in the web
 *   app per CLAUDE.md). We pass the URL to Claude Vision along with the
 *   normalized bbox so the model focuses its read on the correct region.
 * - Falls back to neutral values on any failure — never throws.
 */

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface ObjectMaterial {
  material: string;
  dominantColor: string;
  dominantColorHex: string;
}

const FALLBACK: ObjectMaterial = {
  material: "unknown material",
  dominantColor: "neutral",
  dominantColorHex: "#888888",
};

const SYSTEM = `You are a materials and color analyst. Given a room photo and a normalized bounding box (x,y,w,h in [0..1] — left, top, width, height) identifying a single piece of furniture or decor, describe ONLY that object's primary material and dominant color.

Rules:
- Be SPECIFIC. "distressed leather" not "leather". "bouclé fabric" not "fabric". "lacquered walnut" not "wood".
- Return a perceptually-accurate hex code for the dominant color.
- If you cannot see the object clearly, still return your best guess — do not refuse.
- Return ONLY valid JSON, no markdown fences, no preamble.

Schema: {"material": string, "dominantColor": string, "dominantColorHex": "#RRGGBB"}`;

export async function extractObjectMaterial(
  imageUrl: string,
  bbox: [number, number, number, number],
  label: string,
): Promise<ObjectMaterial> {
  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 200,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "url", url: imageUrl },
            },
            {
              type: "text",
              text: `Object label: "${label}". Normalized bbox: [${bbox
                .map((v) => v.toFixed(3))
                .join(", ")}]. Describe ONLY the object inside this bbox.`,
            },
          ],
        },
      ],
    });

    const text =
      response.content[0]?.type === "text" ? response.content[0].text : "";
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean) as Partial<ObjectMaterial>;
    return {
      material: parsed.material ?? FALLBACK.material,
      dominantColor: parsed.dominantColor ?? FALLBACK.dominantColor,
      dominantColorHex: parsed.dominantColorHex ?? FALLBACK.dominantColorHex,
    };
  } catch {
    return FALLBACK;
  }
}

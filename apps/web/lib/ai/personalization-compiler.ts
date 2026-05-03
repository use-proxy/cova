// V3 Personalization Manifest compiler.
// Every manifest slot has a handler here. compileManifest sets
// manifest._compiled = {pass1_additions, pass2_additions, pass3_lighting,
// art_compositing_required, compiled_at}.

import type {
  PersonalizationManifest,
  ArtPosterSlot,
  SmartProductItem,
  SpecificItem,
  LightingMoodSlot,
  IdentityObject,
  FreeTextSlot,
} from "@/lib/types/personalization";
import { paidCall } from "@/lib/paid/call";

const LAYOUT_DEFINING_IDENTITY = new Set<IdentityObject["type"]>([
  "plants",
  "guitar",
  "books",
  "fitness",
  "vinyl",
]);

interface SlotContribution {
  pass1: string[];
  pass2: string[];
  pass3?: string;
  art_compositing?: boolean;
}

type SlotHandler<T> = (
  value: T,
  roomType: string,
) => SlotContribution | Promise<SlotContribution>;

const ART_HANDLER: SlotHandler<ArtPosterSlot> = (slot) => {
  const layout = slot.layout ?? "single";
  const approvedCount = (slot.images ?? []).filter((i) => i.approved).length;
  const compositingRequired = approvedCount > 0;
  return {
    pass1: [`wall space reserved for ${layout} art arrangement`],
    pass2: [],
    art_compositing: compositingRequired,
  };
};

const SMART_PRODUCTS_HANDLER: SlotHandler<SmartProductItem[]> = (items) => {
  const pass1: string[] = [];
  for (const item of items) {
    const label = item.type.replace(/_/g, " ").trim();
    if (!label) continue;
    pass1.push(`integrated ${label}, ${label} naturally in the space`);
  }
  return { pass1, pass2: [] };
};

const SPECIFIC_ITEMS_HANDLER: SlotHandler<SpecificItem[]> = (items) => {
  return {
    pass1: items
      .slice(0, 2)
      .map((i) => `featuring a ${i.product_name} as a key design element`),
    pass2: [],
  };
};

const LIGHTING_PROMPT_FRAGMENTS: Record<LightingMoodSlot["mood"], string> = {
  warm_cozy:
    "warm tungsten 2700K lamp pools, amber glow, evening interior lighting",
  bright_natural:
    "bright 5500K daylight through windows, soft diffused morning light",
  dramatic_moody:
    "Rembrandt single-source lighting, deep shadows, teal-amber contrast",
};

const LIGHTING_HANDLER: SlotHandler<LightingMoodSlot> = (slot) => {
  const frag = LIGHTING_PROMPT_FRAGMENTS[slot.mood] ?? LIGHTING_PROMPT_FRAGMENTS.warm_cozy;
  return {
    pass1: [frag],
    pass2: [],
    pass3: slot.mood,
  };
};

const IDENTITY_HANDLER: SlotHandler<IdentityObject[]> = (items) => {
  const pass1: string[] = [];
  const pass2: string[] = [];
  for (const obj of items) {
    const t = obj.type;
    const q = obj.quantity ?? "few";
    if (LAYOUT_DEFINING_IDENTITY.has(t)) {
      pass1.push(`with ${q} ${t}`);
    } else {
      const label = t.replace(/_/g, " ");
      pass2.push(
        `${label} artfully displayed, shelf or display unit, editorial`,
      );
    }
  }
  return { pass1, pass2 };
};

async function parseFreetext(
  raw: string,
): Promise<FreeTextSlot["parsed_signals"]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !raw?.trim()) return [];
  try {
    const data = await paidCall<{
      content?: Array<{ type: string; text?: string }>;
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
          max_tokens: 400,
          system:
            "Parse user-written interior preferences into structured signals. Return ONLY JSON array.",
          messages: [
            {
              role: "user",
              content: `Input: ${raw.slice(0, 600)}

Return JSON array: [{"type": "short-tag", "description": "prompt fragment", "priority": "high|medium|low"}]. Max 6 signals.`,
            },
          ],
        }),
        signal: AbortSignal.timeout(15_000),
      },
      costEstimate: {
        category: "render",
        stage: "personalization_freetext_parse",
        costUsd: 0.005,
        model: "claude-haiku-4-5-20251001",
      },
    });
    const text =
      data.content?.map((c) => c.text ?? "").join("").trim() ?? "";
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start < 0 || end < 0) return [];
    const parsed = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s) => s && typeof s === "object")
      .map((s) => ({
        type: String(s.type ?? ""),
        description: String(s.description ?? ""),
        priority: (s.priority === "high" || s.priority === "low"
          ? s.priority
          : "medium") as "high" | "medium" | "low",
      }));
  } catch {
    return [];
  }
}

const FREETEXT_HANDLER: SlotHandler<FreeTextSlot> = async (slot) => {
  if (!slot.raw_text?.trim()) return { pass1: [], pass2: [] };
  let signals = slot.parsed_signals;
  if (!signals || signals.length === 0) {
    signals = await parseFreetext(slot.raw_text);
  }
  const high = signals
    .filter((s) => s.priority === "high")
    .slice(0, 3)
    .map((s) => s.description)
    .filter(Boolean);
  return { pass1: high, pass2: [] };
};

const SLOT_HANDLERS: Record<string, SlotHandler<unknown>> = {
  art: ART_HANDLER as SlotHandler<unknown>,
  smart_products: SMART_PRODUCTS_HANDLER as SlotHandler<unknown>,
  specific_items: SPECIFIC_ITEMS_HANDLER as SlotHandler<unknown>,
  lighting: LIGHTING_HANDLER as SlotHandler<unknown>,
  identity_objects: IDENTITY_HANDLER as SlotHandler<unknown>,
  freetext: FREETEXT_HANDLER as SlotHandler<unknown>,
};

const RESERVED_KEYS = new Set([
  "version",
  "schema_version",
  "created_at",
  "room_type",
  "_compiled",
]);

export async function compileManifest(
  manifest: PersonalizationManifest,
  roomType: string,
): Promise<PersonalizationManifest> {
  const pass1: string[] = [];
  const pass2: string[] = [];
  let pass3 = "warm_cozy";
  let artCompositing = false;

  for (const [key, value] of Object.entries(manifest)) {
    if (RESERVED_KEYS.has(key)) continue;
    const handler = SLOT_HANDLERS[key];
    if (!handler) {
      console.error(
        `[personalization-compiler] unknown slot key: ${key} (missing handler)`,
      );
      continue;
    }
    if (value === undefined || value === null) continue;
    try {
      const contribution = await handler(value, roomType);
      pass1.push(...contribution.pass1);
      pass2.push(...contribution.pass2);
      if (contribution.pass3) pass3 = contribution.pass3;
      if (contribution.art_compositing) artCompositing = true;
    } catch (err) {
      console.error(`[personalization-compiler] handler '${key}' failed:`, err);
    }
  }

  return {
    ...manifest,
    _compiled: {
      pass1_additions: pass1,
      pass2_additions: pass2,
      pass3_lighting: pass3,
      art_compositing_required: artCompositing,
      compiled_at: new Date().toISOString(),
    },
  };
}

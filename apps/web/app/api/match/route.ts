import { createServerSupabaseClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rateLimit";
import type { StyleFingerprint } from "@/types/fingerprint";
import {
  cropAndUploadRenderRegion,
  type BoundingBox,
} from "@/lib/ai/renderCrop";
import { searchProducts, type SerperProduct } from "@/lib/ai/serper";
import { getItemBudgetTarget } from "@/lib/ai/budget";
import {
  extractDimensionsFromText,
  getDimensionsForCategory,
  scoreFit,
  type FitScore,
} from "@/lib/ai/fit";
import {
  cosineSimilarity,
  computeBudgetScore,
  getMatchLabel,
  isFurnitureProduct,
  pickCategoryWeights,
  rrfMerge,
} from "@/lib/ai/matchUtils";
import Anthropic from "@anthropic-ai/sdk";
import Replicate from "replicate";
import { NextResponse } from "next/server";

const anthropic = new Anthropic();
const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

// ── Types ─────────────────────────────────────────────────────────────────────

interface MatchRequestBody {
  render_url: string;
  item_id: string;
  item_label: string;
  item_bbox: [number, number, number, number]; // [x,y,w,h] fractions
  item_keep: boolean | null;
  fingerprint_vector: StyleFingerprint;
  budget_range: [number, number] | null;
  room_type: string;
  room_id: string;
  primary_wall_usable_inches?: number;
}

interface ExtractedAttrs {
  category: string;
  material: string;
  color: string;
  style: string;
  era: string;
  size_descriptor: string;
  distinctive_features: string;
  search_queries: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Google Lens visual search via SearchApi. Returns SerperProduct-shaped objects
 * so downstream code can treat Lens + Serper candidates uniformly.
 */
async function searchGoogleLens(imageUrl: string): Promise<SerperProduct[]> {
  const key = process.env.SEARCHAPI_KEY;
  if (!key) return [];
  const url =
    "https://www.searchapi.io/api/v1/search?" +
    new URLSearchParams({
      engine: "google_lens",
      search_type: "products",
      hl: "en",
      gl: "us",
      url: imageUrl,
      api_key: key,
    });
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    visual_matches?: Array<{
      title?: string;
      link?: string;
      source?: string;
      price?: { value?: string } | string;
      thumbnail?: string;
      image?: string;
      rating?: number;
      reviews?: number;
    }>;
  };
  const matches = data.visual_matches ?? [];
  const out: SerperProduct[] = [];
  for (const m of matches) {
    const link = m.link ?? "";
    if (!link.startsWith("http")) continue;
    const img = m.thumbnail ?? m.image ?? "";
    if (!img) continue;
    const priceStr =
      typeof m.price === "string" ? m.price : (m.price?.value ?? "");
    const price = parseFloat(priceStr.replace(/[^0-9.]/g, "")) || 0;
    if (price <= 0) continue;
    let retailer = m.source ?? "";
    if (!retailer) {
      try {
        retailer = new URL(link).hostname.replace(/^www\./, "");
      } catch {
        retailer = "unknown";
      }
    }
    out.push({
      title: m.title ?? "",
      price,
      currency: "USD",
      productUrl: link,
      imageUrl: img,
      retailer,
      isSale: false,
      rating: m.rating ?? null,
      ratingCount: m.reviews ?? null,
      delivery: null,
    });
  }
  return out.slice(0, 20);
}

// Pure scoring/filtering helpers live in @/lib/ai/matchUtils (imported above)
// so they can be tested independently of this route handler.

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimit = checkRateLimit(user.id, "match");
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded",
          retry_after: rateLimit.retryAfterSeconds,
        },
        { status: 429 },
      );
    }

    const body = (await request.json()) as MatchRequestBody;
    const {
      render_url,
      item_id,
      item_label,
      item_bbox,
      item_keep,
      budget_range,
      room_type,
      room_id,
      primary_wall_usable_inches,
    } = body;

    console.warn("[match] called with:", {
      item_label,
      render_url: render_url?.slice(0, 60),
    });
    console.warn("[match] env keys present:", {
      searchapi: !!process.env.SEARCHAPI_KEY,
      serper: !!process.env.SERPER_API_KEY,
    });

    // Per-item budget target (designer allocation ratios by room type)
    const itemBudgetRange: [number, number] | null = budget_range
      ? getItemBudgetTarget(item_label, room_type, budget_range)
      : null;

    if (
      !render_url ||
      !item_id ||
      !item_label ||
      !item_bbox ||
      !room_id ||
      !room_type
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    // Hard reject kept items — no replacement needed
    if (item_keep === true) {
      return NextResponse.json(
        { error: "Item is marked as kept — no replacement needed" },
        { status: 400 },
      );
    }

    // Step 1: Crop two versions in parallel — a tight crop for primary CLIP/Lens,
    // and a 15%-wider contextual crop for the second Lens query.
    const tightBbox: BoundingBox = {
      x: item_bbox[0],
      y: item_bbox[1],
      w: item_bbox[2],
      h: item_bbox[3],
    };
    const widerX = Math.max(0, item_bbox[0] - 0.15 * item_bbox[2]);
    const widerY = Math.max(0, item_bbox[1] - 0.15 * item_bbox[3]);
    const widerBbox: BoundingBox = {
      x: widerX,
      y: widerY,
      w: Math.min(1 - widerX, item_bbox[2] * 1.3),
      h: Math.min(1 - widerY, item_bbox[3] * 1.3),
    };

    const [cropUrl, widerCropUrl] = await Promise.all([
      cropAndUploadRenderRegion(render_url, tightBbox, room_id, item_id),
      cropAndUploadRenderRegion(
        render_url,
        widerBbox,
        room_id,
        `${item_id}-wide`,
      ),
    ]);

    // Step 2: Claude Vision — structured extraction via tool_use
    let attrs: ExtractedAttrs | null = null;
    try {
      const visionResponse = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system:
          "You are a product identification expert for an interior design shopping app. " +
          "Analyze the cropped furniture/decor item and extract precise attributes for " +
          "product matching. Focus only on the item itself, not the room context. " +
          "Your search_queries must be optimized for Google Shopping — include material, " +
          "color, style, and category. Do not include brand names unless clearly visible.",
        tools: [
          {
            name: "extract_product_attributes",
            description:
              "Return structured attributes describing the cropped furniture or decor item " +
              "for downstream product matching.",
            input_schema: {
              type: "object",
              properties: {
                category: {
                  type: "string",
                  description: 'e.g. "sofa", "floor lamp", "area rug"',
                },
                material: {
                  type: "string",
                  description: 'e.g. "bouclé fabric", "solid walnut", "brass"',
                },
                color: {
                  type: "string",
                  description: 'e.g. "dusty rose", "warm white", "natural oak"',
                },
                style: {
                  type: "string",
                  description:
                    'e.g. "mid-century modern", "japandi", "maximalist"',
                },
                era: {
                  type: "string",
                  description:
                    'e.g. "contemporary", "1970s-inspired", "timeless"',
                },
                size_descriptor: {
                  type: "string",
                  description: 'e.g. "large 3-seater", "accent", "8x10 ft"',
                },
                distinctive_features: {
                  type: "string",
                  description: 'e.g. "tapered brass legs, button tufting"',
                },
                search_queries: {
                  type: "array",
                  items: { type: "string" },
                  description:
                    "Exactly 3 Google Shopping queries, most specific to least specific.",
                },
              },
              required: [
                "category",
                "material",
                "color",
                "style",
                "era",
                "size_descriptor",
                "distinctive_features",
                "search_queries",
              ],
            },
          },
        ],
        tool_choice: { type: "tool", name: "extract_product_attributes" },
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "url", url: cropUrl } },
              {
                type: "text",
                text: `Extract precise product attributes for this ${item_label} so we can find matching real products online.`,
              },
            ],
          },
        ],
      });
      const toolBlock = visionResponse.content.find(
        (c) => c.type === "tool_use",
      );
      if (toolBlock && toolBlock.type === "tool_use") {
        const raw = toolBlock.input as Partial<ExtractedAttrs>;
        attrs = {
          category: raw.category ?? item_label,
          material: raw.material ?? "",
          color: raw.color ?? "",
          style: raw.style ?? "",
          era: raw.era ?? "",
          size_descriptor: raw.size_descriptor ?? "",
          distinctive_features: raw.distinctive_features ?? "",
          search_queries: Array.isArray(raw.search_queries)
            ? raw.search_queries.filter((q) => typeof q === "string")
            : [],
        };
      }
    } catch (err) {
      console.warn("[match] Claude Vision structured extraction failed:", err);
    }

    // Build item description from structured attributes, capped at 20 words.
    let itemDescription = item_label;
    if (attrs) {
      const joined =
        `${attrs.style} ${attrs.material} ${attrs.color} ${attrs.category} ${attrs.distinctive_features}`
          .replace(/\s+/g, " ")
          .trim();
      if (joined) {
        itemDescription = joined.split(/\s+/).slice(0, 20).join(" ");
      }
    }

    // Three Serper Shopping queries: prefer LLM-produced queries when present,
    // otherwise fall back to a deterministic template.
    const llmQueries = (attrs?.search_queries ?? [])
      .filter((q) => q && q.trim().length > 0)
      .slice(0, 3);
    const fallbackCategory = attrs?.category ?? item_label;
    const fallbackQueries = [
      `${itemDescription} ${fallbackCategory}`.trim(),
      `${fallbackCategory} ${itemDescription}`.trim(),
      `${item_label} ${itemDescription} buy online`.trim(),
    ];
    const serperQueries: string[] = [];
    for (let i = 0; i < 3; i++) {
      serperQueries.push(llmQueries[i] ?? fallbackQueries[i] ?? item_label);
    }

    // Step 3: Fire all five searches (2 Lens + 3 Serper) in parallel.
    const [lensTightResult, lensWideResult, serper1, serper2, serper3] =
      await Promise.allSettled([
        searchGoogleLens(cropUrl).catch((e) => {
          console.warn("[match] Lens (tight) failed:", (e as Error).message);
          return [] as SerperProduct[];
        }),
        searchGoogleLens(widerCropUrl).catch((e) => {
          console.warn("[match] Lens (wide) failed:", (e as Error).message);
          return [] as SerperProduct[];
        }),
        searchProducts(serperQueries[0]!, 20),
        searchProducts(serperQueries[1]!, 20),
        searchProducts(serperQueries[2]!, 20),
      ]);

    const lensTight: SerperProduct[] =
      lensTightResult.status === "fulfilled" ? lensTightResult.value : [];
    const lensWide: SerperProduct[] =
      lensWideResult.status === "fulfilled" ? lensWideResult.value : [];
    const serper1Products: SerperProduct[] =
      serper1.status === "fulfilled" ? serper1.value.products : [];
    const serper2Products: SerperProduct[] =
      serper2.status === "fulfilled" ? serper2.value.products : [];
    const serper3Products: SerperProduct[] =
      serper3.status === "fulfilled" ? serper3.value.products : [];

    // Track URLs appearing in BOTH Lens sets — they earn a final-score boost.
    const lensTightUrls = new Set(lensTight.map((p) => p.productUrl));
    const lensWideUrls = new Set(lensWide.map((p) => p.productUrl));
    const bothLensUrls = new Set<string>();
    Array.from(lensTightUrls).forEach((u) => {
      if (lensWideUrls.has(u)) bothLensUrls.add(u);
    });

    // Step 4: RRF merge all 5 lists, then furniture-filter, then take top 25.
    const merged = rrfMerge([
      lensTight,
      lensWide,
      serper1Products,
      serper2Products,
      serper3Products,
    ]);
    const preFilterCount = merged.length;
    const filtered = merged.filter(isFurnitureProduct);
    console.warn(
      `[match] candidates: ${preFilterCount} RRF-merged → ${filtered.length} after furniture filter`,
    );

    const topForClip = filtered.slice(0, 25);

    if (topForClip.length === 0) {
      return NextResponse.json({
        products: [],
        item_description: itemDescription,
        queries_used: serperQueries,
      });
    }

    // Step 5: Batched CLIP embedding — crop at index 0, candidates at 1..N.
    const allUrls = [cropUrl, ...topForClip.map((p) => p.imageUrl)].join("\n");

    let allEmbeddings: Array<{ input: string; embedding: number[] }> = [];
    try {
      const batchOutput = (await replicate.run(
        "andreasjansson/clip-features:75b33f253f7714a281ad3e9b28f63e3232d583716ef6718f2e46641077ea040a",
        { input: { inputs: allUrls } },
      )) as Array<{ input: string; embedding: number[] }>;
      allEmbeddings = batchOutput;
    } catch (err) {
      console.error("[match] CLIP batch embedding failed:", err);
      const fallbackProducts = topForClip.slice(0, 8).map((p) => ({
        id: crypto.randomUUID(),
        name: p.title,
        retailer: p.retailer,
        price: p.price,
        affiliate_url: p.productUrl,
        image_url: p.imageUrl,
        match_score: 0.7,
        match_label: "Inspired By" as const,
        fit_label: "Dimensions Unconfirmed" as const,
        fit_reason: "Room dimensions not provided",
        is_sale: p.isSale,
        rating: p.rating,
        rating_count: p.ratingCount,
      }));
      return NextResponse.json({
        products: fallbackProducts,
        item_description: itemDescription,
        queries_used: serperQueries,
      });
    }

    const cropEmbedding = allEmbeddings[0]?.embedding;
    if (!cropEmbedding) {
      return NextResponse.json({
        products: [],
        item_description: itemDescription,
        queries_used: serperQueries,
      });
    }

    const CLIP_THRESHOLD = 0.6;
    const weights = pickCategoryWeights(attrs?.category ?? item_label);

    const candidatesWithScores: Array<
      SerperProduct & {
        visualScore: number;
        budgetScore: number;
        fitResult: FitScore;
        finalScore: number;
      }
    > = [];

    topForClip.forEach((product, idx) => {
      const embeddingResult = allEmbeddings[idx + 1]; // offset by 1 (crop is index 0)
      if (!embeddingResult?.embedding) return;

      const visualScore = cosineSimilarity(
        cropEmbedding,
        embeddingResult.embedding,
      );
      if (visualScore < CLIP_THRESHOLD) return;

      const budgetScore = itemBudgetRange
        ? computeBudgetScore(product.price, itemBudgetRange)
        : 0.75;

      let fitResult: FitScore;
      if (primary_wall_usable_inches) {
        const dims =
          extractDimensionsFromText(product.title) ??
          getDimensionsForCategory(item_label);
        fitResult = scoreFit(item_label, dims, primary_wall_usable_inches);
      } else {
        fitResult = {
          label: "Dimensions Unconfirmed",
          score: 0.6,
          passes: true,
          reason: "Room dimensions not provided",
        };
      }

      if (!fitResult.passes) return;

      const qualityScore = product.rating ? product.rating / 5 : 0.7;
      const lensBoost = bothLensUrls.has(product.productUrl) ? 0.12 : 0;
      const finalScore =
        weights.visual * visualScore +
        weights.budget * budgetScore +
        weights.fit * fitResult.score +
        weights.quality * qualityScore +
        lensBoost;

      candidatesWithScores.push({
        ...product,
        visualScore,
        budgetScore,
        fitResult,
        finalScore,
      });
    });

    const topProducts = candidatesWithScores
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, 8);

    const unconfirmedFit: FitScore = {
      label: "Dimensions Unconfirmed",
      score: 0.6,
      passes: true,
      reason: "Room dimensions not provided",
    };

    // If CLIP filtering eliminated everything, fall back to top RRF candidates
    const finalProducts =
      topProducts.length > 0
        ? topProducts
        : topForClip.slice(0, 8).map((p) => ({
            ...p,
            visualScore: 0.7,
            budgetScore: itemBudgetRange
              ? computeBudgetScore(p.price, itemBudgetRange)
              : 0.75,
            fitResult: unconfirmedFit,
            finalScore: 0.7,
          }));

    return NextResponse.json({
      products: finalProducts.map((p) => ({
        id: crypto.randomUUID(),
        name: p.title,
        retailer: p.retailer,
        price: p.price,
        affiliate_url: p.productUrl,
        image_url: p.imageUrl,
        match_score: p.finalScore,
        match_label: getMatchLabel(p.visualScore),
        fit_label: p.fitResult.label,
        fit_reason: p.fitResult.reason,
        is_sale: p.isSale,
        rating: p.rating,
        rating_count: p.ratingCount,
      })),
      item_description: itemDescription,
      queries_used: serperQueries,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

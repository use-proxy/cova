/**
 * Pipeline 3 — Furniture Detection + SERP Matching
 *
 * 1. Calls Modal webhook to detect furniture via Claude Vision (detection only)
 * 2. For each detected item, fires Serper Shopping API search
 * 3. Filters results by budget range
 * 4. Writes results to room_products table + rooms.matched_products JSONB
 *
 * Input:  { room_id: string, fixed_furniture?: array, budget_range?: [number, number] }
 * Output: { status, room_id, furniture_count, products_matched, items }
 */

export const maxDuration = 300;

import { NextResponse } from "next/server";
import { redactLogPayload } from "@/lib/log/redact";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { searchProducts, type SerperProduct } from "@/lib/ai/serper";
import { isFurnitureProduct } from "@/lib/ai/matchUtils";
import { buildAffiliateUrl } from "@/lib/affiliates";

interface FurnitureMatchBody {
  room_id?: string;
  fixed_furniture?: unknown[];
  budget_range?: [number, number];
  style_descriptor?: string;
}

interface DetectedItem {
  label: string;
  description: string;
  category: string;
  azimuth_degrees: number;
  elevation_degrees: number;
  search_query: string;
  hotspot_x?: number;
  hotspot_y?: number;
}

interface SerpMatchedProduct {
  title: string;
  price: number | null;
  retailer: string;
  productUrl: string;
  thumbnailUrl: string;
  itemLabel: string;
  isSale: boolean;
  rating: number | null;
  ratingCount: number | null;
  matchScore: number;
}

/** Fix known Serper query failure patterns before sending to Google Shopping. */
function normalizeSearchQuery(label: string, query: string): string {
  const lowerLabel = label.toLowerCase();
  let q = query;

  // TV/television: "wall-mounted tv" returns mounting hardware, not TVs.
  // Rewrite to a direct TV product query.
  if (lowerLabel.includes("tv") || lowerLabel.includes("television")) {
    // Extract size hint if present (e.g. "55 inch", "65 inch")
    const sizeMatch = q.match(/(\d{2,3})\s*(?:inch|")/i);
    const size = sizeMatch ? `${sizeMatch[1]} inch` : "55 inch";
    // Extract color if present
    const colorMatch = q.match(/\b(black|white|silver|gray|grey)\b/i);
    const color = colorMatch ? colorMatch[1] : "black";
    return `${size} 4K smart TV ${color} slim bezel flat screen LED`;
  }

  // Wall art: overly generic queries like "wall art" return bad results.
  // Ensure content descriptor + medium are present.
  if (
    (lowerLabel.includes("wall art") ||
      lowerLabel.includes("framed art") ||
      lowerLabel.includes("painting") ||
      lowerLabel.includes("print")) &&
    q.split(" ").length < 5
  ) {
    return `${q} large framed canvas print neutral tones modern`;
  }

  // Paint-chip color names severely limit Google Shopping results.
  // Replace them with their base searchable color so we get more products
  // while still filtering for the right color family.
  q = q
    .replace(/\bsage green\b/gi, "green")
    .replace(/\bdusty rose\b/gi, "pink")
    .replace(/\bdusty blue\b/gi, "blue")
    .replace(/\bolive green\b/gi, "green")
    .replace(/\bforest green\b/gi, "green")
    .replace(/\bslate blue\b/gi, "blue")
    .replace(/\bburnt orange\b/gi, "orange")
    .replace(/\bterracotta\b/gi, "terracotta") // terracotta is actually searchable
    .replace(/\bwarm putty\b/gi, "beige")
    .replace(/\bwarm white\b/gi, "white");

  // For beds, nightstands, dressers: if no recognizable color remains after substitution,
  // the form/construction should be the primary search driver.
  const colorTerms = /\b(white|black|gray|grey|brown|beige|cream|natural|oak|walnut|green|blue|pink|orange|terracotta)\b/i;
  if (
    (lowerLabel.includes("bed") || lowerLabel.includes("nightstand") || lowerLabel.includes("dresser")) &&
    !colorTerms.test(q)
  ) {
    // No recognizable color — leave query as-is (form-only is fine)
  }

  // Strip style words that slip through despite prompt rules
  q = q
    .replace(/\b(japandi|scandinavian|mid-century|coastal|bohemian|boho|minimalist)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return q;
}

export async function POST(request: Request) {
  const serviceKey = request.headers.get("x-service-key");
  const isServiceCall =
    !!serviceKey && serviceKey === process.env.SUPABASE_SERVICE_ROLE_KEY;

  const supabase = isServiceCall
    ? createAdminSupabaseClient()
    : await createServerSupabaseClient();

  let user: { id: string } | null = null;
  if (!isServiceCall) {
    const {
      data: { user: authedUser },
    } = await supabase.auth.getUser();
    if (!authedUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    user = authedUser;
  }

  const body = (await request.json()) as FurnitureMatchBody;
  const { room_id, fixed_furniture, budget_range, style_descriptor } = body;

  if (!room_id) {
    return NextResponse.json({ error: "room_id is required" }, { status: 400 });
  }

  const webhookUrl = process.env.FURNITURE_MATCHING_WEBHOOK_URL;
  if (!webhookUrl) {
    return NextResponse.json(
      { error: "FURNITURE_MATCHING_WEBHOOK_URL not configured" },
      { status: 503 },
    );
  }

  try {
    // Resolve user_id + fetch room context (render URL, style, room type) in one query
    const selectQ = supabase
      .from("rooms")
      .select(
        "user_id, redesign_pano_url, render_url, style_blend, room_type, redesign_status",
      )
      .eq("id", room_id);
    const { data: roomRow } = await (user
      ? selectQ.eq("user_id", user.id).single()
      : selectQ.single());

    if (!roomRow) {
      return NextResponse.json(
        { error: "Room not found or access denied" },
        { status: 404 },
      );
    }

    // ── Atomic idempotency guard ──────────────────────────────────────
    // Conditionally lock: only update rows whose status is NOT already
    // matching_products. If zero rows are returned, another concurrent
    // caller already claimed this room — bail out.
    // Exclude both in-flight and already-completed states so reruns cannot
    // wipe existing products out from under a user who is viewing step-9.
    const lockQ = supabase
      .from("rooms")
      .update({ redesign_status: "matching_products" })
      .eq("id", room_id)
      .not("redesign_status", "in", '("matching_products","complete")');
    const { data: lockRows } = await (user
      ? lockQ.eq("user_id", user.id).select("id")
      : lockQ.select("id"));
    if (!lockRows || lockRows.length === 0) {
      const currentStatus =
        (roomRow as { redesign_status?: string } | null)?.redesign_status ??
        "unknown";
      console.warn(
        "[furniture-match] Room skipped:",
        redactLogPayload({ room_id, currentStatus }),
      );
      // Distinguish between in-flight and already-done so step-9 can act correctly:
      //   "matching_products" → still running, client should poll
      //   "complete"          → already done, client should refetch room_products
      const disambiguatedStatus =
        currentStatus === "complete" ? "complete" : "matching_products";
      return NextResponse.json({
        status: disambiguatedStatus,
        room_id,
        message:
          disambiguatedStatus === "complete"
            ? "Product matching already complete — refetch room_products"
            : "Product matching already in progress — poll for completion",
        current_status: currentStatus,
      });
    }

    const userId: string | null =
      user?.id ?? (roomRow as { user_id?: string } | null)?.user_id ?? null;
    const renderUrl: string | null =
      (roomRow as { redesign_pano_url?: string; render_url?: string } | null)
        ?.redesign_pano_url ??
      (roomRow as { redesign_pano_url?: string; render_url?: string } | null)
        ?.render_url ??
      null;
    const styleBlend: Record<string, number> | null =
      (roomRow as { style_blend?: Record<string, number> } | null)
        ?.style_blend ?? null;
    const roomType: string =
      (roomRow as { room_type?: string } | null)?.room_type ?? "living_room";

    // ── Step 1: Call Modal for furniture detection ──────────────────────
    type DetectionResult = {
      status: string;
      furniture_items?: DetectedItem[];
      furniture_count?: number;
      detection_source?: string;
      error?: string;
    };

    const callModal = async (): Promise<
      DetectionResult | { __httpError: true; status: number; body: string }
    > => {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room_id,
          user_id: userId,
          fixed_furniture: fixed_furniture ?? [],
        }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        return { __httpError: true, status: res.status, body: text };
      }
      return (await res.json()) as DetectionResult;
    };

    let detectionResult: DetectionResult;
    const first = await callModal();
    if ("__httpError" in first) {
      console.error(
        "[furniture-match] Detection webhook error:",
        first.status,
        redactLogPayload(first.body),
      );
      return NextResponse.json(
        { error: "Furniture detection failed", detail: first.body },
        { status: 502 },
      );
    }
    detectionResult = first;

    if (detectionResult.status === "error") {
      console.error(
        "[furniture-match] Detection error:",
        redactLogPayload(detectionResult.error),
      );
      return NextResponse.json(
        { error: detectionResult.error ?? "Furniture detection failed" },
        { status: 500 },
      );
    }

    let furnitureItems = detectionResult.furniture_items ?? [];

    // ── furniture_count: 0 handling ────────────────────────────────────
    // Modal occasionally returns 0 items on first call (transient Vision
    // failure). Retry once after a 10s delay; if still 0, fall back to the
    // detection-only zones in rooms.render_detection_result so step-9 can
    // still render hotspots. Silent empty → "Nothing here" is the worst UX.
    if (furnitureItems.length === 0) {
      console.warn("[furniture-match] furniture_count 0 — retrying in 10s");
      await new Promise((r) => setTimeout(r, 10_000));
      const second = await callModal();
      if (!("__httpError" in second) && second.status !== "error") {
        detectionResult = second;
        furnitureItems = second.furniture_items ?? [];
      }
    }

    if (furnitureItems.length === 0) {
      // Fallback: use render_detection_result zones as detection-only rows.
      const { data: detRow } = await supabase
        .from("rooms")
        .select("render_detection_result")
        .eq("id", room_id)
        .single();
      const detItems = Array.isArray(
        (
          detRow as {
            render_detection_result?: { items?: Array<{ label: string }> };
          } | null
        )?.render_detection_result?.items,
      )
        ? (
            detRow as {
              render_detection_result: { items: Array<{ label: string }> };
            }
          ).render_detection_result.items
        : [];

      if (detItems.length > 0) {
        const fallbackRows = detItems
          .filter(
            (z) => typeof z.label === "string" && z.label.trim().length > 0,
          )
          .map((z) => ({
            room_id,
            product_id: null,
            furniture_label: z.label,
            furniture_description: null,
            similarity_score: 0,
            rank: 1,
            azimuth_degrees: 0,
            elevation_degrees: -25,
            hotspot_x: null,
            hotspot_y: null,
            is_unlocked: false,
            serp_title: null,
            serp_price: null,
            serp_retailer: null,
            serp_product_url: null,
            serp_image_url: null,
            match_score: 0,
            match_label: "Inspired By",
            is_sale: false,
          }));

        await supabase.from("room_products").delete().eq("room_id", room_id);
        if (fallbackRows.length > 0) {
          const { error: fbErr } = await supabase
            .from("room_products")
            .insert(fallbackRows);
          if (fbErr)
            console.error("[furniture-match] Fallback insert error:", redactLogPayload(fbErr));
        }
        await supabase
          .from("rooms")
          .update({
            matched_products: [],
            furniture_matches_count: fallbackRows.length,
            redesign_status: "complete",
          })
          .eq("id", room_id);

        console.warn(
          "[furniture-match] furniture_count 0 after retry — inserted detection-only rows:",
          redactLogPayload({ count: fallbackRows.length }),
        );
        return NextResponse.json({
          status: "complete",
          room_id,
          furniture_count: 0,
          products_matched: fallbackRows.length,
          detection_source: "render_detection_fallback",
          items: [],
        });
      }

      // No detection zones either — release the lock and return empty.
      await supabase
        .from("rooms")
        .update({ redesign_status: "complete", furniture_matches_count: 0 })
        .eq("id", room_id);
      return NextResponse.json({
        status: "complete",
        room_id,
        furniture_count: 0,
        products_matched: 0,
        items: [],
      });
    }

    // ── Step 2: SERP search per item ───────────────────────────────────
    // (Lock already acquired atomically above.)

    // Derive dominant style descriptor from style_blend for enriched queries
    const dominantStyleTag: string = (() => {
      if (style_descriptor) return style_descriptor;
      if (!styleBlend) return "";
      const top = Object.entries(styleBlend).sort((a, b) => b[1] - a[1])[0];
      return top ? top[0].replace(/_/g, " ") : "";
    })();

    const allMatchedProducts: SerpMatchedProduct[] = [];
    const roomProductRecords: Record<string, unknown>[] = [];

    void renderUrl; // referenced to avoid unused-var lint; used in future CLIP pass
    void roomType; // available for budget allocation in future pass

    for (const item of furnitureItems) {
      // Always enrich query with style tag — Modal's search_query often omits it.
      const baseQuery = item.search_query || `${item.label} buy`;
      let searchQuery =
        dominantStyleTag &&
        !baseQuery.toLowerCase().includes(dominantStyleTag.toLowerCase())
          ? `${baseQuery} ${dominantStyleTag}`.trim()
          : baseQuery.trim();

      // Post-process known failure patterns before sending to Serper
      searchQuery = normalizeSearchQuery(item.label, searchQuery);

      let products: SerperProduct[] = [];
      let rawResults: SerperProduct[] = [];
      try {
        const result = await searchProducts(searchQuery, 10);
        rawResults = result.products;
        products = rawResults.filter(isFurnitureProduct);

        // Color-specific furniture fallback: if the label has a color but the query returns
        // < 3 products, retry with the color stripped so construction drives results.
        // This handles specialty painted furniture (sage green beds, etc.) where the exact
        // color narrows results too aggressively.
        if (products.length < 3) {
          const colorStripped = searchQuery
            .replace(/\b(green|blue|pink|orange|red|yellow|purple|teal|navy|sage|olive|mint|terracotta|gold|ivory|cream)\b/gi, "")
            .replace(/\s{2,}/g, " ")
            .trim();
          if (colorStripped !== searchQuery && colorStripped.split(" ").length >= 3) {
            console.warn("[furniture-match] color-fallback:", redactLogPayload({ label: item.label, colorStripped }));
            const fallbackResult = await searchProducts(colorStripped, 10);
            const fallbackFiltered = fallbackResult.products.filter(isFurnitureProduct);
            if (fallbackFiltered.length > products.length) {
              products = fallbackFiltered;
              rawResults = fallbackResult.products;
            }
          }
        }

        // Size-qualifier fallback: queries like "cream shag area rug 8×10" return 0 results,
        // but "cream shag area rug" returns 5+. Strip dimension patterns and retry if < 3 products.
        if (products.length < 3) {
          const sizeStripped = searchQuery
            .replace(/\b\d+\s*[x×]\s*\d+\b/gi, "")          // "8x10", "8×10"
            .replace(/\b\d+\s*(?:inch|inches|in|ft|feet)\b/gi, "") // "52 inch", "8 ft"
            .replace(/\b\d+-inch\b/gi, "")                    // "52-inch"
            .replace(/\s{2,}/g, " ")
            .trim();
          if (sizeStripped !== searchQuery && sizeStripped.split(" ").length >= 3) {
            const sizeResult = await searchProducts(sizeStripped, 10);
            const sizeFiltered = sizeResult.products.filter(isFurnitureProduct);
            console.warn(
              "[furniture-match] zero-result fallback:",
              redactLogPayload({ original: products.length, retry: sizeFiltered.length, sizeStripped }),
            );
            if (sizeFiltered.length > products.length) {
              products = sizeFiltered;
              rawResults = sizeResult.products;
            }
          }
        }
      } catch (err) {
        console.warn(
          "[furniture-match] Serper search failed:",
          redactLogPayload({ label: item.label, err }),
        );
        continue;
      }

      // Second-pass fallback: if strict allowlist removed everything but
      // raw results existed, relax the retailer allowlist and keep only the
      // price floor. Prevents "Nothing here" when the SERP returned valid
      // products from retailers we don't yet affiliate with.
      if (products.length === 0 && rawResults.length > 0) {
        const relaxed = rawResults.filter((p) => p.price >= 30);
        console.warn(
          "[furniture-match] relaxed fallback:",
          redactLogPayload({ label: item.label, preFilter: rawResults.length, relaxed: relaxed.length }),
        );
        products = relaxed;
      } else {
        console.warn(
          "[furniture-match] filter results:",
          redactLogPayload({ label: item.label, preFilter: rawResults.length, postFilter: products.length }),
        );
      }

      // Filter by budget range if provided
      if (budget_range && budget_range.length === 2) {
        const [minBudget, maxBudget] = budget_range;
        // Per-item budget: approximate by dividing total by furniture count
        const perItemMax = (maxBudget / Math.max(furnitureItems.length, 1)) * 2; // allow 2x per-item average
        const perItemMin =
          (minBudget / Math.max(furnitureItems.length, 1)) * 0.3;
        products = products.filter(
          (p) => p.price >= perItemMin && p.price <= perItemMax,
        );
      }

      // Take top 5 per item
      const topProducts = products.slice(0, 5);

      for (let rank = 0; rank < topProducts.length; rank++) {
        const p = topProducts[rank]!;
        const matchScore = 1.0 - rank * 0.1; // rank-based score (0 → 1.0, 1 → 0.9, …)
        const affiliateUrl = buildAffiliateUrl(p.productUrl, p.retailer);
        // Rank-tier labels (since scores are rank-derived, threshold by rank).
        const matchLabel =
          rank === 0 ? "Top Match" : rank <= 2 ? "Close Match" : "Inspired By";

        allMatchedProducts.push({
          title: p.title,
          price: p.price,
          retailer: p.retailer,
          productUrl: affiliateUrl,
          thumbnailUrl: p.imageUrl,
          itemLabel: item.label,
          isSale: p.isSale,
          rating: p.rating,
          ratingCount: p.ratingCount,
          matchScore,
        });

        roomProductRecords.push({
          room_id,
          product_id: null, // SERP results — not in products table
          furniture_label: item.label,
          furniture_description: item.description,
          similarity_score: matchScore,
          rank: rank + 1,
          azimuth_degrees: item.azimuth_degrees,
          elevation_degrees: item.elevation_degrees ?? -25,
          hotspot_x: item.hotspot_x ?? null,
          hotspot_y: item.hotspot_y ?? null,
          is_unlocked: false,
          serp_title: p.title,
          serp_price: p.price,
          serp_retailer: p.retailer,
          serp_product_url: affiliateUrl,
          serp_image_url: p.imageUrl,
          match_score: matchScore,
          match_label: matchLabel,
          is_sale: p.isSale,
        });
      }
    }

    // ── Step 3: Stage-then-swap write to Supabase ─────────────────────
    //
    // NEVER delete existing room_products before confirming new data is ready.
    // If newProducts.length === 0, return a specific error so step-9 keeps
    // showing existing hotspots rather than blanking the panel.

    if (roomProductRecords.length === 0) {
      // Release the lock without deleting existing data
      await supabase
        .from("rooms")
        .update({ redesign_status: "complete" })
        .eq("id", room_id);
      console.warn(
        "[furniture-match] No products found after SERP search — existing room_products preserved",
      );
      return NextResponse.json({
        status: "no_products_found",
        room_id,
        furniture_count: furnitureItems.length,
        products_matched: 0,
        message:
          "No matching products found. Existing panel data is preserved.",
      });
    }

    // New records are ready — delete existing rows then insert new ones.
    // bbox (hotspot_x/y/width/height) is intentionally not stored here.
    // step-9 reads zones directly from rooms.render_detection_result JSONB
    // and matches to products by label via findZoneIdForLabel(). No schema change needed.
    const { error: deleteError } = await supabase
      .from("room_products")
      .delete()
      .eq("room_id", room_id);

    if (deleteError) {
      console.error("[furniture-match] Delete error (before insert):", redactLogPayload(deleteError));
      // Do not proceed with insert if delete failed — existing data is still intact
      await supabase
        .from("rooms")
        .update({ redesign_status: "complete" })
        .eq("id", room_id);
      return NextResponse.json(
        { error: "Failed to clear previous matches: " + deleteError.message },
        { status: 500 },
      );
    }

    const { error: insertError } = await supabase
      .from("room_products")
      .insert(roomProductRecords);

    if (insertError) {
      // Existing rows were deleted but insert failed — data loss occurred.
      // Log clearly so the team can investigate.
      console.error(
        "[furniture-match] DATA LOSS: delete succeeded but insert failed.",
        redactLogPayload({ room_id, recordCount: roomProductRecords.length, insertError }),
      );
    }

    // Write matched_products JSONB to rooms table
    await supabase
      .from("rooms")
      .update({
        matched_products: allMatchedProducts,
        furniture_matches_count: roomProductRecords.length,
        redesign_status: "complete",
      })
      .eq("id", room_id);

    return NextResponse.json({
      status: "complete",
      room_id,
      furniture_count: furnitureItems.length,
      products_matched: roomProductRecords.length,
      detection_source: detectionResult.detection_source ?? "unknown",
      items: furnitureItems.map((item) => ({
        label: item.label,
        category: item.category,
        products: allMatchedProducts
          .filter((p) => p.itemLabel === item.label)
          .slice(0, 5),
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[furniture-match] Unexpected error:", redactLogPayload(message));

    // Matching failure must NOT block the user from seeing their render.
    // Set status back to 'complete' (the render itself succeeded), not 'error'.
    await supabase
      .from("rooms")
      .update({ redesign_status: "complete" })
      .eq("id", room_id);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

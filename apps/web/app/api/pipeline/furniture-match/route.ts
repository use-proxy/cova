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
        `[furniture-match] Room ${room_id} skipped — current status: ${currentStatus}`,
      );
      return NextResponse.json({
        status: "in_progress",
        room_id,
        message: "Product matching already in progress or complete",
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
        first.body,
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
        detectionResult.error,
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
            console.error("[furniture-match] Fallback insert error:", fbErr);
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
          `[furniture-match] furniture_count 0 after retry — inserted ${fallbackRows.length} detection-only rows`,
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
      const searchQuery =
        dominantStyleTag &&
        !baseQuery.toLowerCase().includes(dominantStyleTag.toLowerCase())
          ? `${baseQuery} ${dominantStyleTag}`.trim()
          : baseQuery.trim();

      let products: SerperProduct[] = [];
      let rawResults: SerperProduct[] = [];
      try {
        const result = await searchProducts(searchQuery, 10);
        rawResults = result.products;
        products = rawResults.filter(isFurnitureProduct);
      } catch (err) {
        console.warn(
          `[furniture-match] Serper search failed for "${item.label}":`,
          err,
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
          `[furniture-match] "${item.label}" pre-filter=${rawResults.length} post-filter=0 → relaxed fallback=${relaxed.length}`,
        );
        products = relaxed;
      } else {
        console.warn(
          `[furniture-match] "${item.label}" pre-filter=${rawResults.length} post-filter=${products.length}`,
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

    // ── Step 3: Write to Supabase ──────────────────────────────────────

    // Clear existing room_products for this room
    await supabase.from("room_products").delete().eq("room_id", room_id);

    // bbox (hotspot_x/y/width/height) is intentionally not stored here.
    // step-9 reads zones directly from rooms.render_detection_result JSONB
    // and matches to products by label via findZoneIdForLabel(). No schema
    // change needed.
    // Insert new SERP-matched products
    if (roomProductRecords.length > 0) {
      const { error: insertError } = await supabase
        .from("room_products")
        .insert(roomProductRecords);

      if (insertError) {
        console.error("[furniture-match] Insert error:", insertError);
      }
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
    console.error("[furniture-match] Unexpected error:", message);

    // Write error status
    await supabase
      .from("rooms")
      .update({ redesign_status: "error" })
      .eq("id", room_id);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

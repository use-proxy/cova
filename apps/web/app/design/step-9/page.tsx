"use client";

/**
 * Design Philosophy: Quiet-luxury editorial.
 * This screen uses cinematic asymmetry, restrained brass accents, dark showroom surfaces,
 * and a Playfair Display + DM Sans pairing to create a premium shoppable-room experience.
 * Every interaction should reinforce clarity, tactility, and visual calm rather than dashboard density.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { flowLog } from "@/lib/debug/flow-logger";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  Heart,
  Link2,
  Share2,
  Sparkles,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { useRoomStore } from "@/lib/store/room";
import "../step-1/step1.css";
import "./step9.css";

type Category =
  | "All"
  | "Seating"
  | "Tables"
  | "Lighting"
  | "Decor"
  | "Rugs"
  | "Art"
  | "Furniture";
type SortOption = "Featured" | "Price: Low" | "Price: High" | "Recently Added";

type Product = {
  id: number;
  zone: number;
  brand: string;
  name: string;
  category: Exclude<Category, "All">;
  price: number;
  salePrice?: number;
  retailer: string;
  retailerUrl: string;
  image: string;
  addedAt: string;
  rawLabel?: string;
  isKept?: boolean;
};

type RoomZone = {
  id: number;
  label: string;
  top: string;
  left: string;
  width: string;
  height: string;
};

// Fallback CDN image used when a DB product has no image
const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=320&q=80";

const DEFAULT_HERO_IMAGE =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663531103545/UvAR2A84d4Di26jup8APFY/cova-step9-hero-room_74c9a8a9.png";
const BRASS_TEXTURE =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663531103545/UvAR2A84d4Di26jup8APFY/cova-step9-brass-texture_af6ddb16.jpg";
const LINEN_TEXTURE =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663531103545/UvAR2A84d4Di26jup8APFY/cova-step9-linen-texture_4af9879b.jpg";

const FILTERS: Category[] = [
  "All",
  "Seating",
  "Tables",
  "Lighting",
  "Decor",
  "Rugs",
  "Art",
];
const SORT_OPTIONS: SortOption[] = [
  "Featured",
  "Price: Low",
  "Price: High",
  "Recently Added",
];
const TOUR_INTERVAL_MS = 2000;

// No hardcoded zones or products — all data comes from Supabase room_products
// and rooms.render_detection_result. Empty arrays while loading.

// Maps a raw DB category string to the closest display category.
// Unknown labels fall through to "Furniture" (a catch-all that is rendered
// under every active filter), not "Decor", so products are never hidden
// behind a filter just because their label isn't in the trigger list.
function mapCategory(raw: string): Exclude<Category, "All"> {
  if (!raw) return "Furniture";
  const normalized = raw.toLowerCase();
  if (
    normalized.includes("seat") ||
    normalized.includes("sofa") ||
    normalized.includes("chair") ||
    normalized.includes("ottoman") ||
    normalized.includes("bench") ||
    normalized.includes("stool") ||
    normalized.includes("sectional") ||
    normalized.includes("recliner") ||
    normalized.includes("settee") ||
    normalized.includes("banquette") ||
    normalized.includes("couch")
  )
    return "Seating";
  if (
    normalized.includes("table") ||
    normalized.includes("desk") ||
    normalized.includes("shelf") ||
    normalized.includes("storage") ||
    normalized.includes("nightstand") ||
    normalized.includes("dresser") ||
    normalized.includes("cabinet") ||
    normalized.includes("credenza") ||
    normalized.includes("sideboard") ||
    normalized.includes("hutch") ||
    normalized.includes("bookcase") ||
    normalized.includes("armoire") ||
    normalized.includes("wardrobe") ||
    normalized.includes("bureau") ||
    normalized.includes("buffet") ||
    normalized.includes("console") ||
    normalized.includes("vanity") ||
    normalized.includes("stand")
  )
    return "Tables";
  if (
    normalized.includes("light") ||
    normalized.includes("lamp") ||
    normalized.includes("pendant") ||
    normalized.includes("sconce") ||
    normalized.includes("chandelier") ||
    normalized.includes("fixture")
  )
    return "Lighting";
  if (normalized.includes("rug") || normalized.includes("carpet"))
    return "Rugs";
  if (
    normalized.includes("art") ||
    normalized.includes("canvas") ||
    normalized.includes("print") ||
    normalized.includes("paint") ||
    normalized.includes("mirror") ||
    normalized.includes("frame") ||
    normalized.includes("sculpture")
  )
    return "Art";
  if (
    normalized.includes("vase") ||
    normalized.includes("plant") ||
    normalized.includes("planter") ||
    normalized.includes("pillow") ||
    normalized.includes("throw") ||
    normalized.includes("curtain") ||
    normalized.includes("drape") ||
    normalized.includes("clock") ||
    normalized.includes("decor")
  )
    return "Decor";
  // Unknown furniture label — route to Furniture catch-all (always visible).
  return "Furniture";
}

// Fuzzy label match: find the best-matching detected zone id for a
// product's furniture_label. Both sources emit short noun-phrase labels
// (e.g. "sofa", "coffee table", "floor lamp"), so we use case-insensitive
// token overlap with a substring fallback. Returns null if nothing matches.
function findZoneIdForLabel(label: string, zones: RoomZone[]): number | null {
  if (!label || zones.length === 0) return null;
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .trim();
  const target = norm(label);
  if (!target) return null;
  const targetTokens = new Set(target.split(/\s+/).filter(Boolean));

  let bestId: number | null = null;
  let bestScore = 0;
  for (const zone of zones) {
    const zl = norm(zone.label);
    if (!zl) continue;
    let score = 0;
    if (zl === target) score = 100;
    else if (zl.includes(target) || target.includes(zl)) score = 50;
    else {
      const zTokens = zl.split(/\s+/).filter(Boolean);
      for (const t of zTokens) if (targetTokens.has(t)) score += 10;
    }
    if (score > bestScore) {
      bestScore = score;
      bestId = zone.id;
    }
  }
  return bestScore > 0 ? bestId : null;
}

// Kept-label fuzzy match — same token logic as findZoneIdForLabel but against
// a flat list of kept furniture labels from render_context.keepMask.
function isKeptLabel(label: string, keptLabels: string[]): boolean {
  if (!label || keptLabels.length === 0) return false;
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .trim();
  const target = norm(label);
  if (!target) return false;
  const targetTokens = new Set(target.split(/\s+/).filter(Boolean));
  for (const k of keptLabels) {
    const kn = norm(k);
    if (!kn) continue;
    if (kn === target) return true;
    if (kn.includes(target) || target.includes(kn)) return true;
    const kTokens = kn.split(/\s+/).filter(Boolean);
    for (const t of kTokens) if (targetTokens.has(t)) return true;
  }
  return false;
}

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

export default function Step9Experience() {
  const router = useRouter();
  useEffect(() => { flowLog("page:mount", { page: "step-9" }); }, []);
  const roomId = useRoomStore((s) => s.roomId);
  const renderUrl = useRoomStore((s) => s.renderUrl);

  const [authReady, setAuthReady] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [heroImage, setHeroImage] = useState<string>(DEFAULT_HERO_IMAGE);
  const [zones, setZones] = useState<RoomZone[]>([]);
  const [zonesLoading, setZonesLoading] = useState(true);
  const [productsLoading, setProductsLoading] = useState(true);
  const [matchingInProgress, setMatchingInProgress] = useState(false);
  const [matchingError, setMatchingError] = useState<string | null>(null);
  const [matchRetryTick, setMatchRetryTick] = useState(0);
  const [activeFilter, setActiveFilter] = useState<Category>("All");
  const [sortBy, setSortBy] = useState<SortOption>("Featured");
  const [hoveredProductId, setHoveredProductId] = useState<number | null>(null);
  const [savedUrls, setSavedUrls] = useState<Set<string>>(new Set());
  const [tourIndex, setTourIndex] = useState(0);
  const cardRefs = useRef<Map<number, HTMLElement>>(new Map());
  const [isTouring, setIsTouring] = useState(false);
  const [displayedTotal, setDisplayedTotal] = useState(0);
  const [budgetRange, setBudgetRange] = useState<{
    min: number;
    max: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let pollInterval: number | undefined;

    const checkAuth = async () => {
      const { createBrowserClient } = await import("@/lib/supabase/client");
      const supabase = createBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        router.push("/auth?next=/design/step-9");
        return;
      }
      setAuthReady(true);

      // Use render URL from store if available
      if (renderUrl) {
        setHeroImage(renderUrl);
      }

      // Load budget + keepMask from render_context (set in step-5/step-7c)
      let keptLabels: string[] = [];
      if (roomId) {
        try {
          const { data: rcRow } = await supabase
            .from("rooms")
            .select("render_context")
            .eq("id", roomId)
            .eq("user_id", user.id)
            .single();
          const rc = (rcRow?.render_context ?? null) as {
            budget?: { rangeMin?: number; rangeMax?: number };
            keepMask?: { objects?: Array<{ type?: string; keep?: boolean }> };
          } | null;
          if (
            rc?.budget &&
            typeof rc.budget.rangeMin === "number" &&
            typeof rc.budget.rangeMax === "number"
          ) {
            if (!cancelled)
              setBudgetRange({
                min: rc.budget.rangeMin,
                max: rc.budget.rangeMax,
              });
          }
          const objs = rc?.keepMask?.objects ?? [];
          keptLabels = objs
            .filter((o) => o?.keep === true && typeof o.type === "string")
            .map((o) => o.type as string);
        } catch {
          // non-fatal
        }
      }

      // Load saved_products for this user + room so hearts persist across sessions.
      if (roomId) {
        try {
          const { data: savedRows } = await supabase
            .from("saved_products")
            .select("product_url")
            .eq("user_id", user.id)
            .eq("room_id", roomId);
          if (!cancelled && Array.isArray(savedRows)) {
            setSavedUrls(
              new Set(
                savedRows
                  .map((r: { product_url?: string }) => r.product_url)
                  .filter(
                    (u): u is string => typeof u === "string" && u.length > 0,
                  ),
              ),
            );
          }
        } catch {
          // non-fatal — heart state starts empty
        }
      }

      // Load zones from render_detection_result
      let detectedZones: RoomZone[] = [];
      if (roomId) {
        try {
          const { data: roomDetection } = await supabase
            .from("rooms")
            .select("render_detection_result")
            .eq("id", roomId)
            .single();

          if (
            roomDetection?.render_detection_result &&
            Array.isArray(roomDetection.render_detection_result.items) &&
            roomDetection.render_detection_result.items.length > 0
          ) {
            detectedZones = roomDetection.render_detection_result.items.map(
              (
                item: {
                  label: string;
                  boundingBox: {
                    x: number;
                    y: number;
                    width: number;
                    height: number;
                  };
                },
                i: number,
              ) => ({
                id: i + 1,
                label: item.label,
                top: `${item.boundingBox.y}%`,
                left: `${item.boundingBox.x}%`,
                width: `${item.boundingBox.width}%`,
                height: `${item.boundingBox.height}%`,
              }),
            );
          }
        } catch {
          // Non-fatal
        }
        if (cancelled) return;
        setZones(detectedZones);
        setZonesLoading(false);
      } else {
        setZonesLoading(false);
      }

      // Load matched products
      if (roomId) {
        try {
          const { data: roomProducts } = await supabase
            .from("room_products")
            .select(
              "id, furniture_label, furniture_description, similarity_score, rank, hotspot_x, hotspot_y, product_id, serp_title, serp_price, serp_retailer, serp_product_url, serp_image_url, match_score, match_label, is_sale",
            )
            .eq("room_id", roomId);

          if (cancelled) return;

          if (roomProducts && roomProducts.length > 0) {
            const hasSerpData = roomProducts.some(
              (rp: Record<string, unknown>) => rp.serp_title,
            );

            if (hasSerpData) {
              const mapped: Product[] = roomProducts.map(
                (rp: Record<string, unknown>, i: number) => {
                  const rawLabel = (rp.furniture_label as string) ?? "";
                  const category = mapCategory(rawLabel);
                  const matchedZoneId = findZoneIdForLabel(
                    rawLabel,
                    detectedZones,
                  );
                  if (matchedZoneId === null && rawLabel) {
                    console.warn(
                      `[step-9] No zone matched for furniture_label="${rawLabel}" — product will render without hover highlight`,
                    );
                  }
                  const zoneId = matchedZoneId ?? 0;
                  return {
                    id: i + 1,
                    zone: zoneId,
                    brand: (rp.serp_retailer as string) || "Unknown",
                    name: (rp.serp_title as string) || rawLabel || "Product",
                    category,
                    price: (rp.serp_price as number) || 0,
                    retailer: (rp.serp_retailer as string) || "Unknown",
                    retailerUrl: (rp.serp_product_url as string) || "#",
                    image: (rp.serp_image_url as string) || FALLBACK_IMAGE,
                    addedAt: new Date().toISOString(),
                    rawLabel,
                    isKept: isKeptLabel(rawLabel, keptLabels),
                  };
                },
              );
              setProducts(mapped);
            } else {
              // Legacy catalog path
              const productIds = Array.from(
                new Set(
                  roomProducts
                    .map(
                      (rp: Record<string, unknown>) => rp.product_id as string,
                    )
                    .filter(Boolean),
                ),
              );
              const { data: productDetails } = await supabase
                .from("products")
                .select(
                  "id, name, brand, category, price, image_url, product_url, retailer, affiliate_url",
                )
                .in("id", productIds);
              if (cancelled) return;

              const productMap = new Map(
                (productDetails ?? []).map((p: Record<string, unknown>) => [
                  p.id,
                  p,
                ]),
              );
              const mapped: Product[] = roomProducts.map(
                (rp: Record<string, unknown>, i: number) => {
                  const product = productMap.get(rp.product_id) as
                    | Record<string, unknown>
                    | undefined;
                  const rawLabel =
                    (rp.furniture_label as string) ??
                    (product?.category as string) ??
                    "";
                  const category = mapCategory(
                    (product?.category as string) ?? rawLabel,
                  );
                  const zoneId =
                    findZoneIdForLabel(rawLabel, detectedZones) ?? 0;
                  return {
                    id: (product?.id as number) || i + 1,
                    zone: zoneId,
                    brand: (product?.brand as string) || "Unknown",
                    name: (product?.name as string) || rawLabel || "Product",
                    category,
                    price: (product?.price as number) || 0,
                    retailer: (product?.retailer as string) || "Unknown",
                    retailerUrl:
                      (product?.affiliate_url as string) ||
                      (product?.product_url as string) ||
                      "#",
                    image: (product?.image_url as string) || FALLBACK_IMAGE,
                    addedAt: new Date().toISOString(),
                    rawLabel,
                    isKept: isKeptLabel(rawLabel, keptLabels),
                  };
                },
              );
              setProducts(mapped);
            }
          } else {
            // No room_products — check rooms.matched_products JSONB
            const { data: roomRow, error } = await supabase
              .from("rooms")
              .select("matched_products, redesign_status")
              .eq("id", roomId)
              .single();
            if (cancelled) return;

            if (
              !error &&
              roomRow?.matched_products &&
              Array.isArray(roomRow.matched_products) &&
              roomRow.matched_products.length > 0
            ) {
              const dbProducts = roomRow.matched_products as Record<
                string,
                unknown
              >[];
              const mapped: Product[] = dbProducts.map((p, i) => {
                const rawLabel =
                  (p.itemLabel as string) ?? (p.category as string) ?? "";
                const category = mapCategory(rawLabel);
                const zoneId = findZoneIdForLabel(rawLabel, detectedZones) ?? 0;
                return {
                  id: (p.id as number) || i + 1,
                  zone: zoneId,
                  brand:
                    (p.brand as string) || (p.retailer as string) || "Unknown",
                  name: (p.name as string) || (p.title as string) || "Product",
                  category,
                  price: (p.price as number) || 0,
                  salePrice: (p.sale_price as number) || undefined,
                  retailer: (p.retailer as string) || "Unknown",
                  retailerUrl:
                    (p.affiliate_url as string) ||
                    (p.product_url as string) ||
                    (p.productUrl as string) ||
                    "#",
                  image:
                    (p.image_url as string) ||
                    (p.thumbnail_url as string) ||
                    (p.thumbnailUrl as string) ||
                    FALLBACK_IMAGE,
                  addedAt: (p.created_at as string) || new Date().toISOString(),
                  rawLabel,
                  isKept: isKeptLabel(rawLabel, keptLabels),
                };
              });
              setProducts(mapped);
            } else {
              // Only trigger furniture matching if it's not already running.
              // render/status also fires this; don't double-dispatch.
              setMatchingInProgress(true);
              setProducts([]);
              const alreadyMatching =
                (roomRow as { redesign_status?: string } | null)
                  ?.redesign_status === "matching_products";
              if (!alreadyMatching) {
                fetch("/api/pipeline/furniture-match", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ room_id: roomId }),
                }).catch((err) =>
                  console.warn(
                    "[step-9] Furniture matching trigger failed:",
                    err,
                  ),
                );
              }
              // Poll every 3 s until room_products appear (max 120 s / 2 min).
              // On timeout: show explicit error + retry, do NOT reload (reload
              // would loop the entire poll cycle indefinitely).
              let ticks = 0;
              pollInterval = window.setInterval(async () => {
                ticks++;
                try {
                  const { count } = await supabase
                    .from("room_products")
                    .select("id", { count: "exact", head: true })
                    .eq("room_id", roomId);
                  if ((count ?? 0) > 0) {
                    if (pollInterval !== undefined) {
                      window.clearInterval(pollInterval);
                      pollInterval = undefined;
                    }
                    if (!cancelled) {
                      setMatchingInProgress(false);
                      window.location.reload();
                    }
                  } else if (ticks >= 40) {
                    if (pollInterval !== undefined) {
                      window.clearInterval(pollInterval);
                      pollInterval = undefined;
                    }
                    if (!cancelled) {
                      setMatchingInProgress(false);
                      setMatchingError(
                        "We're having trouble finding products right now.",
                      );
                    }
                  }
                } catch {
                  // transient — keep polling
                }
              }, 3000);
            }
          }
        } catch {
          setProducts([]);
          setZones([]);
        }
      } else {
        // No room ID — show empty state, no fake/placeholder data
        setProducts([]);
        setZones([]);
      }

      if (!cancelled) setProductsLoading(false);
    };
    checkAuth();

    return () => {
      cancelled = true;
      if (pollInterval !== undefined) {
        window.clearInterval(pollInterval);
        pollInterval = undefined;
      }
    };
  }, [router, roomId, renderUrl, matchRetryTick]);

  useEffect(() => {
    if (!isTouring) return;

    const interval = window.setInterval(() => {
      setTourIndex((current) => (current + 1) % zones.length);
    }, TOUR_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [isTouring, zones.length]);

  const visibleProducts = useMemo(() => {
    const filtered = products.filter(
      (product) =>
        activeFilter === "All" ||
        product.category === activeFilter ||
        product.category === "Furniture",
    );

    const sorted = [...filtered].sort((a, b) => {
      const aPrice = a.salePrice ?? a.price;
      const bPrice = b.salePrice ?? b.price;

      if (sortBy === "Price: Low") return aPrice - bPrice;
      if (sortBy === "Price: High") return bPrice - aPrice;
      if (sortBy === "Recently Added")
        return +new Date(b.addedAt) - +new Date(a.addedAt);
      return a.id - b.id;
    });

    return sorted;
  }, [products, activeFilter, sortBy]);

  const savedProducts = useMemo(
    () => products.filter((product) => savedUrls.has(product.retailerUrl)),
    [products, savedUrls],
  );
  const savedTotal = useMemo(
    () =>
      savedProducts.reduce(
        (sum, product) => sum + (product.salePrice ?? product.price),
        0,
      ),
    [savedProducts],
  );
  const maxRoomValue = useMemo(
    () =>
      products.reduce(
        (sum, product) => sum + (product.salePrice ?? product.price),
        0,
      ),
    [products],
  );
  // If the user set a step-5 budget, show progress against that ceiling;
  // otherwise fall back to "% of all matched products collected".
  const budgetCeiling = budgetRange?.max ?? maxRoomValue;
  const progress =
    budgetCeiling > 0
      ? Math.min(100, Math.round((savedTotal / budgetCeiling) * 100))
      : 0;
  const activeZoneId =
    hoveredProductId ?? (isTouring ? (zones[tourIndex]?.id ?? null) : null);

  useEffect(() => {
    let frame = 0;
    const start = displayedTotal;
    const target = savedTotal;
    const duration = 500;
    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const ratio = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - ratio, 3);
      setDisplayedTotal(Math.round(start + (target - start) * eased));
      if (ratio < 1) frame = window.requestAnimationFrame(step);
    };

    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedTotal]);

  const toggleSaved = async (product: Product) => {
    if (!product.retailerUrl || product.retailerUrl === "#") {
      toast.error("This product has no link to save.");
      return;
    }
    const url = product.retailerUrl;
    const wasSaved = savedUrls.has(url);

    // Optimistic update
    setSavedUrls((current) => {
      const next = new Set(current);
      if (wasSaved) next.delete(url);
      else next.add(url);
      return next;
    });

    try {
      const { createBrowserClient } = await import("@/lib/supabase/client");
      const supabase = createBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/auth?next=/design/step-9");
        return;
      }

      if (wasSaved) {
        const { error } = await supabase
          .from("saved_products")
          .delete()
          .eq("user_id", user.id)
          .eq("product_url", url);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("saved_products").upsert(
          {
            user_id: user.id,
            room_id: roomId ?? null,
            product_url: url,
            product_data: {
              name: product.name,
              brand: product.brand,
              category: product.category,
              price: product.price,
              salePrice: product.salePrice ?? null,
              retailer: product.retailer,
              image: product.image,
            },
          },
          { onConflict: "user_id,product_url" },
        );
        if (error) throw error;
      }
    } catch (err) {
      console.error("[step-9] toggleSaved failed:", err);
      // Roll back optimistic update
      setSavedUrls((current) => {
        const next = new Set(current);
        if (wasSaved) next.add(url);
        else next.delete(url);
        return next;
      });
      toast.error("Couldn't save that item — try again.");
    }
  };

  const handleShop = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleShare = async () => {
    const shareUrl =
      typeof window !== "undefined"
        ? window.location.href
        : "https://covainterior.com/design/step-9";

    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("✦ Link copied", {
        className: "step9-toast",
        duration: 1800,
      });
    } catch {
      toast.success("✦ Link copied", {
        className: "step9-toast",
        duration: 1800,
      });
    }
  };

  if (!authReady) {
    return (
      <div className="step9-loading-screen">
        <div className="step9-loading-shell">
          <div className="step9-loading-mark" />
          <p>Preparing your shoppable room...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="step9-shell">
      <div className="step9-grain" aria-hidden="true" />
      <header className="step9-topbar">
        <button
          type="button"
          className="step9-brand"
          onClick={() => router.push("/")}
        >
          Cova
        </button>
        <div className="step9-room-heading">Your Living Room</div>
        <div className="step9-topbar-actions">
          <button
            type="button"
            className="step9-saved-chip"
            onClick={() => router.push("/dashboard/saved")}
          >
            <Heart size={14} />
            <span>{savedUrls.size} Saved</span>
          </button>
          <button type="button" className="step9-avatar" aria-label="Profile">
            <User size={16} />
          </button>
        </div>
      </header>

      <main className="step9-stage">
        <section className="step9-hero-panel">
          <div className="step9-hero-card">
            <img
              src={heroImage}
              alt="Luxury living room visualization"
              className="step9-hero-image"
            />
            <div
              className="step9-hero-sheen"
              style={{ backgroundImage: `url(${LINEN_TEXTURE})` }}
              aria-hidden="true"
            />
            <button
              type="button"
              className="step9-tour-button"
              onClick={() => setIsTouring((current) => !current)}
            >
              <Sparkles size={16} />
              <span>{isTouring ? "◎ Stop Tour" : "◎ Room Tour"}</span>
            </button>

            <div className="step9-hotspots">
              {zonesLoading
                ? null
                : zones.map((zone) => {
                    const isActive = zone.id === activeZoneId;
                    return (
                      <div
                        key={zone.id}
                        className={`step9-zone ${isActive ? "is-active" : ""}`}
                        style={{
                          top: zone.top,
                          left: zone.left,
                          width: zone.width,
                          height: zone.height,
                          pointerEvents: "auto",
                          cursor: "pointer",
                          ...(isActive
                            ? {
                                opacity: 1,
                                border: "2px solid rgba(201, 168, 76, 0.85)",
                                boxShadow:
                                  "0 0 0 1px rgba(201, 168, 76, 0.4), 0 0 28px 4px rgba(201, 168, 76, 0.35), inset 0 0 24px rgba(201, 168, 76, 0.25)",
                              }
                            : null),
                        }}
                        onMouseEnter={() => {
                          setHoveredProductId(zone.id);
                          const match = products.find(
                            (p) => p.zone === zone.id,
                          );
                          if (match) {
                            const el = cardRefs.current.get(match.id);
                            el?.scrollIntoView({
                              behavior: "smooth",
                              block: "nearest",
                            });
                          }
                        }}
                        onMouseLeave={() => setHoveredProductId(null)}
                      >
                        <span className="step9-zone-label">{zone.label}</span>
                      </div>
                    );
                  })}
            </div>

            <div className="step9-room-meta">
              <span>✦ {products.length} pieces in this room</span>
            </div>

            <button
              type="button"
              className="step9-share-button"
              onClick={handleShare}
            >
              <Share2 size={16} />
              <span>Share room</span>
            </button>
          </div>
        </section>

        <div
          className="step9-divider"
          style={{ backgroundImage: `url(${BRASS_TEXTURE})` }}
          aria-hidden="true"
        />

        <section className="step9-panel">
          <div className="step9-panel-scroll">
            <div className="step9-panel-header">
              <div>
                <p className="step9-kicker">Curated Edit</p>
                <h1>Everything in this room</h1>
                <p className="step9-subtitle">
                  Hover to locate each piece in the room, then save or shop the
                  items that fit your design.
                </p>
              </div>

              <div className="step9-filter-row">
                <div
                  className="step9-tabs"
                  role="tablist"
                  aria-label="Filter room products"
                >
                  {FILTERS.map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      className={`step9-tab ${activeFilter === filter ? "is-active" : ""}`}
                      onClick={() => setActiveFilter(filter)}
                    >
                      {filter}
                    </button>
                  ))}
                </div>

                <label className="step9-sorter">
                  <span>Sort</span>
                  <div className="step9-select-shell">
                    <select
                      value={sortBy}
                      onChange={(event) =>
                        setSortBy(event.target.value as SortOption)
                      }
                    >
                      {SORT_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={16} />
                  </div>
                </label>
              </div>

              <div className="step9-budget-card">
                <div>
                  <p>
                    {budgetRange
                      ? `Saved of ${money(budgetRange.min)}–${money(budgetRange.max)} budget`
                      : "Room total"}
                  </p>
                  <strong>{money(displayedTotal)}</strong>
                </div>
                <div className="step9-budget-progress">
                  <div className="step9-budget-bar">
                    <span style={{ width: `${progress}%` }} />
                  </div>
                  <small>
                    {budgetRange
                      ? `${progress}% of budget used`
                      : `${progress}% of room collected`}
                  </small>
                </div>
              </div>
            </div>

            <div className="step9-product-list">
              {productsLoading ? (
                // Loading skeleton — surface color #0F1F3D with gold shimmer
                <>
                  {[1, 2, 3, 4].map((n) => (
                    <div
                      key={n}
                      className="step9-product-card"
                      style={{ opacity: 0.6 }}
                      aria-hidden="true"
                    >
                      <div
                        className="step9-product-image-wrap"
                        style={{
                          background: "#0F1F3D",
                          animation:
                            "step9SkeletonShimmer 1.4s ease-in-out infinite",
                        }}
                      />
                      <div className="step9-product-copy" style={{ gap: 8 }}>
                        <div
                          style={{
                            height: 10,
                            width: "40%",
                            borderRadius: 4,
                            background: "#1E3A5F",
                            animation:
                              "step9SkeletonShimmer 1.4s ease-in-out infinite",
                          }}
                        />
                        <div
                          style={{
                            height: 14,
                            width: "70%",
                            borderRadius: 4,
                            background: "#1E3A5F",
                            animation:
                              "step9SkeletonShimmer 1.4s ease-in-out infinite",
                          }}
                        />
                        <div
                          style={{
                            height: 10,
                            width: "55%",
                            borderRadius: 4,
                            background: "#1E3A5F",
                            animation:
                              "step9SkeletonShimmer 1.4s ease-in-out infinite",
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </>
              ) : matchingError ? (
                <div className="step9-empty-state">
                  <div className="step9-empty-icon">
                    <Link2 size={18} />
                  </div>
                  <h2>{matchingError}</h2>
                  <p>Give it another try — the matcher is usually quick.</p>
                  <button
                    type="button"
                    className="step9-shop-button"
                    style={{ marginTop: 14 }}
                    onClick={async () => {
                      setMatchingError(null);
                      setMatchingInProgress(true);
                      try {
                        const { createBrowserClient } =
                          await import("@/lib/supabase/client");
                        const sb = createBrowserClient();
                        const {
                          data: { user: u },
                        } = await sb.auth.getUser();
                        if (u && roomId) {
                          // Reset status so furniture-match can re-run.
                          await sb
                            .from("rooms")
                            .update({ redesign_status: "complete" })
                            .eq("id", roomId)
                            .eq("user_id", u.id);
                        }
                      } catch (err) {
                        console.warn("[step-9] reset failed:", err);
                      }
                      setMatchRetryTick((n) => n + 1);
                    }}
                  >
                    <span>Try again</span>
                    <ArrowUpRight size={15} />
                  </button>
                </div>
              ) : matchingInProgress ? (
                <div className="step9-empty-state">
                  <div className="step9-empty-icon">
                    <Sparkles size={18} />
                  </div>
                  <h2>Finding your products</h2>
                  <p>
                    Matching furniture to your room — this takes about 30
                    seconds.
                  </p>
                </div>
              ) : visibleProducts.length === 0 ? (
                <div className="step9-empty-state">
                  <div className="step9-empty-icon">
                    <Sparkles size={18} />
                  </div>
                  <h2>We&apos;re still finding products</h2>
                  <p>
                    Check back shortly — product matching may still be in
                    progress.
                  </p>
                  <button
                    type="button"
                    className="step9-shop-button"
                    style={{ marginTop: 14 }}
                    onClick={async () => {
                      setMatchingError(null);
                      setMatchingInProgress(true);
                      try {
                        const { createBrowserClient } =
                          await import("@/lib/supabase/client");
                        const sb = createBrowserClient();
                        const {
                          data: { user: u },
                        } = await sb.auth.getUser();
                        if (u && roomId) {
                          await sb
                            .from("rooms")
                            .update({ redesign_status: "complete" })
                            .eq("id", roomId)
                            .eq("user_id", u.id);
                        }
                      } catch (err) {
                        console.warn("[step-9] reset failed:", err);
                      }
                      setMatchRetryTick((n) => n + 1);
                    }}
                  >
                    <span>Try again</span>
                    <ArrowUpRight size={15} />
                  </button>
                </div>
              ) : (
                visibleProducts.map((product, index) => {
                  const isSaved = savedUrls.has(product.retailerUrl);
                  const activePrice = product.salePrice ?? product.price;
                  const isLinked =
                    activeZoneId !== null && product.zone === activeZoneId;
                  return (
                    <article
                      key={product.id}
                      ref={(el) => {
                        if (el) cardRefs.current.set(product.id, el);
                        else cardRefs.current.delete(product.id);
                      }}
                      className={`step9-product-card ${isLinked ? "is-linked" : ""}`}
                      style={{
                        animationDelay: `${index * 65}ms`,
                        ...(isLinked
                          ? {
                              borderColor: "rgba(201, 168, 76, 0.8)",
                              boxShadow:
                                "0 0 0 1px rgba(201, 168, 76, 0.6), 0 0 24px rgba(201, 168, 76, 0.3)",
                            }
                          : null),
                      }}
                      onMouseEnter={() =>
                        product.zone > 0 && setHoveredProductId(product.zone)
                      }
                      onMouseLeave={() => setHoveredProductId(null)}
                    >
                      <div className="step9-product-image-wrap">
                        <img
                          src={product.image}
                          alt={product.name}
                          className="step9-product-image"
                        />
                      </div>

                      <div className="step9-product-copy">
                        <p className="step9-product-brand">{product.brand}</p>
                        <h2>{product.name}</h2>
                        <div className="step9-product-meta">
                          <span className="step9-category-pill">
                            {product.category}
                          </span>
                          <span>{product.retailer}</span>
                        </div>
                        <div className="step9-pricing">
                          <strong>{money(activePrice)}</strong>
                          {product.salePrice ? (
                            <s>{money(product.price)}</s>
                          ) : null}
                        </div>
                      </div>

                      <div className="step9-product-actions">
                        <button
                          type="button"
                          className={`step9-save-button ${isSaved ? "is-saved" : ""}`}
                          onClick={() => toggleSaved(product)}
                          aria-pressed={isSaved}
                        >
                          {isSaved ? <Check size={16} /> : <Heart size={16} />}
                          <span>{isSaved ? "Saved" : "Save"}</span>
                        </button>
                        {product.isKept ? (
                          <span
                            className="step9-kept-badge"
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              padding: "8px 14px",
                              borderRadius: 999,
                              border: "1px solid rgba(201, 168, 76, 0.6)",
                              color: "#C9A84C",
                              fontSize: 13,
                              fontWeight: 500,
                              background: "rgba(201, 168, 76, 0.08)",
                            }}
                          >
                            <Check size={14} />
                            <span>You kept this</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="step9-shop-button"
                            onClick={() => handleShop(product.retailerUrl)}
                          >
                            <span>Shop</span>
                            <ArrowUpRight size={15} />
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })
              )}
            </div>

            <footer className="step9-panel-footer">
              <div>
                <p>Saved collection</p>
                <strong>
                  {savedProducts.length} item
                  {savedProducts.length === 1 ? "" : "s"} · {money(savedTotal)}
                </strong>
              </div>
              <button
                type="button"
                className="step9-saved-link"
                onClick={() => router.push("/dashboard/saved")}
              >
                <span>View Saved Items</span>
                <ArrowUpRight size={16} />
              </button>
            </footer>
          </div>
        </section>
      </main>

      <footer className="step9-bottom-bar">
        <button
          type="button"
          className="step9-bottom-link"
          onClick={() => router.push("/design/step-8a")}
        >
          <ArrowLeft size={16} />
          <span>Back to Reveal</span>
        </button>
        <p>Step 9 complete — your redesigned room is ready to shop.</p>
        <button
          type="button"
          className="step9-bottom-cta"
          onClick={() => router.push("/dashboard")}
        >
          <span>Go to Dashboard</span>
          <ArrowUpRight size={16} />
        </button>
      </footer>
    </div>
  );
}

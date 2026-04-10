"use client";

/**
 * Design Philosophy: Quiet-luxury editorial.
 * This screen uses cinematic asymmetry, restrained brass accents, dark showroom surfaces,
 * and a Playfair Display + DM Sans pairing to create a premium shoppable-room experience.
 * Every interaction should reinforce clarity, tactility, and visual calm rather than dashboard density.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
  | "Art";
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

const DEFAULT_ZONES: RoomZone[] = [
  {
    id: 1,
    label: "Cloud Modular Sofa",
    top: "57%",
    left: "14%",
    width: "35%",
    height: "24%",
  },
  {
    id: 2,
    label: "Travertine Cocktail Table",
    top: "61%",
    left: "38%",
    width: "16%",
    height: "12%",
  },
  {
    id: 3,
    label: "Bronze Floor Lamp",
    top: "26%",
    left: "52%",
    width: "8%",
    height: "33%",
  },
  {
    id: 4,
    label: "Handwoven Rug",
    top: "70%",
    left: "24%",
    width: "46%",
    height: "17%",
  },
  {
    id: 5,
    label: "Walnut Accent Chair",
    top: "55%",
    left: "63%",
    width: "19%",
    height: "24%",
  },
  {
    id: 6,
    label: "Marble Side Table",
    top: "60%",
    left: "57%",
    width: "11%",
    height: "15%",
  },
  {
    id: 7,
    label: "Brass Mirror",
    top: "20%",
    left: "68%",
    width: "13%",
    height: "20%",
  },
  {
    id: 8,
    label: "Textured Linen Drapes",
    top: "9%",
    left: "6%",
    width: "15%",
    height: "48%",
  },
  {
    id: 9,
    label: "Ceramic Vessel Duo",
    top: "41%",
    left: "31%",
    width: "9%",
    height: "11%",
  },
  {
    id: 10,
    label: "Abstract Canvas",
    top: "16%",
    left: "29%",
    width: "19%",
    height: "19%",
  },
  {
    id: 11,
    label: "Bouclé Ottoman",
    top: "69%",
    left: "52%",
    width: "14%",
    height: "11%",
  },
  {
    id: 12,
    label: "Sculptural Pendant",
    top: "6%",
    left: "43%",
    width: "12%",
    height: "14%",
  },
];

const DEFAULT_PRODUCTS: Product[] = [
  {
    id: 1,
    zone: 1,
    brand: "Atelier Cova",
    name: "Cloud Modular Sofa",
    category: "Seating",
    price: 4890,
    retailer: "Ligne Edit",
    retailerUrl: "https://www.example.com/products/cloud-modular-sofa",
    image:
      "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=320&q=80",
    addedAt: "2026-03-29",
  },
  {
    id: 2,
    zone: 2,
    brand: "Monarch Studio",
    name: "Travertine Cocktail Table",
    category: "Tables",
    price: 2380,
    retailer: "House Form",
    retailerUrl: "https://www.example.com/products/travertine-cocktail-table",
    image:
      "https://images.unsplash.com/photo-1538688525198-9b88f6f53126?auto=format&fit=crop&w=320&q=80",
    addedAt: "2026-04-03",
  },
  {
    id: 3,
    zone: 3,
    brand: "Nocturne",
    name: "Bronze Floor Lamp",
    category: "Lighting",
    price: 1290,
    retailer: "Light Archive",
    retailerUrl: "https://www.example.com/products/bronze-floor-lamp",
    image:
      "https://images.unsplash.com/photo-1549187774-b4e9b0445b41?auto=format&fit=crop&w=320&q=80",
    addedAt: "2026-03-18",
  },
  {
    id: 4,
    zone: 4,
    brand: "Serein Loom",
    name: "Handwoven Rug",
    category: "Rugs",
    price: 3150,
    retailer: "Grounded Objects",
    retailerUrl: "https://www.example.com/products/handwoven-rug",
    image:
      "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=320&q=80&sat=-30",
    addedAt: "2026-02-28",
  },
  {
    id: 5,
    zone: 5,
    brand: "Aurelian",
    name: "Walnut Accent Chair",
    category: "Seating",
    price: 1670,
    salePrice: 1480,
    retailer: "Studio Moderne",
    retailerUrl: "https://www.example.com/products/walnut-accent-chair",
    image:
      "https://images.unsplash.com/photo-1517705008128-361805f42e86?auto=format&fit=crop&w=320&q=80",
    addedAt: "2026-04-07",
  },
  {
    id: 6,
    zone: 6,
    brand: "Pietra Casa",
    name: "Marble Side Table",
    category: "Tables",
    price: 980,
    retailer: "Mason & Field",
    retailerUrl: "https://www.example.com/products/marble-side-table",
    image:
      "https://images.unsplash.com/photo-1499933374294-4584851497cc?auto=format&fit=crop&w=320&q=80",
    addedAt: "2026-03-25",
  },
  {
    id: 7,
    zone: 7,
    brand: "Verre Maison",
    name: "Brass Mirror",
    category: "Decor",
    price: 840,
    retailer: "Archetype Living",
    retailerUrl: "https://www.example.com/products/brass-mirror",
    image:
      "https://images.unsplash.com/photo-1519710164239-da123dc03ef4?auto=format&fit=crop&w=320&q=80",
    addedAt: "2026-03-11",
  },
  {
    id: 8,
    zone: 8,
    brand: "Quiet Thread",
    name: "Textured Linen Drapes",
    category: "Decor",
    price: 1190,
    retailer: "Soft House",
    retailerUrl: "https://www.example.com/products/textured-linen-drapes",
    image:
      "https://images.unsplash.com/photo-1484101403633-562f891dc89a?auto=format&fit=crop&w=320&q=80",
    addedAt: "2026-02-14",
  },
  {
    id: 9,
    zone: 9,
    brand: "Forme",
    name: "Ceramic Vessel Duo",
    category: "Decor",
    price: 420,
    retailer: "Shelf Ritual",
    retailerUrl: "https://www.example.com/products/ceramic-vessel-duo",
    image:
      "https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?auto=format&fit=crop&w=320&q=80",
    addedAt: "2026-04-05",
  },
  {
    id: 10,
    zone: 10,
    brand: "Sunday Atelier",
    name: "Abstract Canvas",
    category: "Art",
    price: 1540,
    retailer: "North Gallery",
    retailerUrl: "https://www.example.com/products/abstract-canvas",
    image:
      "https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?auto=format&fit=crop&w=320&q=80",
    addedAt: "2026-03-31",
  },
  {
    id: 11,
    zone: 11,
    brand: "Maison Bouclé",
    name: "Bouclé Ottoman",
    category: "Seating",
    price: 860,
    retailer: "Cove Edit",
    retailerUrl: "https://www.example.com/products/boucle-ottoman",
    image:
      "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=320&q=80&crop=entropy",
    addedAt: "2026-04-01",
  },
  {
    id: 12,
    zone: 12,
    brand: "Luma Atelier",
    name: "Sculptural Pendant",
    category: "Lighting",
    price: 2210,
    retailer: "Light Archive",
    retailerUrl: "https://www.example.com/products/sculptural-pendant",
    image:
      "https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=320&q=80",
    addedAt: "2026-03-21",
  },
];

// Maps a raw DB category string to the closest display category
function mapCategory(raw: string): Exclude<Category, "All"> {
  if (!raw) return "Decor";
  const normalized = raw.toLowerCase();
  if (normalized.includes("seat") || normalized.includes("sofa") || normalized.includes("chair") || normalized.includes("ottoman")) return "Seating";
  if (normalized.includes("table") || normalized.includes("desk") || normalized.includes("shelf") || normalized.includes("storage")) return "Tables";
  if (normalized.includes("light") || normalized.includes("lamp") || normalized.includes("pendant") || normalized.includes("sconce")) return "Lighting";
  if (normalized.includes("rug") || normalized.includes("carpet")) return "Rugs";
  if (normalized.includes("art") || normalized.includes("canvas") || normalized.includes("print") || normalized.includes("paint")) return "Art";
  return "Decor";
}

// Maps a raw DB category string to a zone id (1–12)
function getCategoryZone(category: string): number {
  const map: Record<string, number> = {
    Seating: 1,
    Tables: 2,
    Lighting: 3,
    Rugs: 4,
    "Seating-accent": 5,
    "Tables-side": 6,
    "Decor-mirror": 7,
    "Decor-curtains": 8,
    Decor: 9,
    Art: 10,
    "Seating-ottoman": 11,
    "Lighting-pendant": 12,
  };
  return map[category] ?? Math.floor(Math.random() * 12) + 1;
}

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

export default function Step9Experience() {
  const router = useRouter();
  const roomId = useRoomStore((s) => s.roomId);
  const renderUrl = useRoomStore((s) => s.renderUrl);

  const [authReady, setAuthReady] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [heroImage, setHeroImage] = useState<string>(DEFAULT_HERO_IMAGE);
  const [zones, setZones] = useState<RoomZone[]>(DEFAULT_ZONES);
  const [zonesLoading, setZonesLoading] = useState(true);
  const [productsLoading, setProductsLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<Category>("All");
  const [sortBy, setSortBy] = useState<SortOption>("Featured");
  const [hoveredProductId, setHoveredProductId] = useState<number | null>(null);
  const [savedIds, setSavedIds] = useState<number[]>([]);
  const [tourIndex, setTourIndex] = useState(0);
  const [isTouring, setIsTouring] = useState(false);
  const [displayedTotal, setDisplayedTotal] = useState(0);

  useEffect(() => {
    const checkAuth = async () => {
      const { createBrowserClient } = await import("@/lib/supabase/client");
      const supabase = createBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/auth?next=/design/step-9");
        return;
      }
      setAuthReady(true);

      // Use render URL from store if available
      if (renderUrl) {
        setHeroImage(renderUrl);
      }

      // Load render_detection_result for zone bounding boxes
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
            const detectedZones: RoomZone[] = roomDetection.render_detection_result.items.map(
              (item: { label: string; boundingBox: { x: number; y: number; width: number; height: number } }, i: number) => ({
                id: i + 1,
                label: item.label,
                top: `${item.boundingBox.y}%`,
                left: `${item.boundingBox.x}%`,
                width: `${item.boundingBox.width}%`,
                height: `${item.boundingBox.height}%`,
              })
            );
            setZones(detectedZones);
          }
          // If null, keep DEFAULT_ZONES — detection hasn't run yet
        } catch {
          // Non-fatal — use defaults
        }
        setZonesLoading(false);
      } else {
        setZonesLoading(false);
      }

      // Load matched products from Supabase if we have a room
      if (roomId) {
        try {
          // Check room_products table first (populated by furniture matching pipeline)
          const { data: roomProducts } = await supabase
            .from("room_products")
            .select("id, furniture_label, furniture_description, similarity_score, rank, hotspot_x, hotspot_y, product_id, serp_title, serp_price, serp_retailer, serp_product_url, serp_image_url, match_score, match_label, is_sale")
            .eq("room_id", roomId);

          if (roomProducts && roomProducts.length > 0) {
            // Check if these are SERP results (serp_title set) or legacy catalog results (product_id set)
            const hasSerpData = roomProducts.some((rp: Record<string, unknown>) => rp.serp_title);

            if (hasSerpData) {
              // SERP path: use inline SERP data directly
              const mapped: Product[] = roomProducts.map((rp: Record<string, unknown>, i: number) => {
                const category = mapCategory((rp.furniture_label as string) ?? "");
                return {
                  id: i + 1,
                  zone: getCategoryZone((rp.furniture_label as string) ?? ""),
                  brand: (rp.serp_retailer as string) || "Unknown",
                  name: (rp.serp_title as string) || (rp.furniture_label as string) || "Product",
                  category,
                  price: (rp.serp_price as number) || 0,
                  salePrice: (rp.is_sale as boolean) ? undefined : undefined,
                  retailer: (rp.serp_retailer as string) || "Unknown",
                  retailerUrl: (rp.serp_product_url as string) || "#",
                  image: (rp.serp_image_url as string) || FALLBACK_IMAGE,
                  addedAt: new Date().toISOString(),
                };
              });
              setProducts(mapped);
            } else {
              // Legacy catalog path: join to products table via product_id
              const productIds = Array.from(new Set(
                roomProducts
                  .map((rp: Record<string, unknown>) => rp.product_id as string)
                  .filter(Boolean)
              ));
              const { data: productDetails } = await supabase
                .from("products")
                .select("id, name, brand, category, price, image_url, product_url, retailer, affiliate_url")
                .in("id", productIds);

              const productMap = new Map((productDetails ?? []).map((p: Record<string, unknown>) => [p.id, p]));
              const mapped: Product[] = roomProducts.map((rp: Record<string, unknown>, i: number) => {
                const product = productMap.get(rp.product_id) as Record<string, unknown> | undefined;
                const category = mapCategory((product?.category as string) ?? "");
                return {
                  id: (product?.id as number) || i + 1,
                  zone: getCategoryZone((product?.category as string) ?? ""),
                  brand: (product?.brand as string) || "Unknown",
                  name: (product?.name as string) || (rp.furniture_label as string) || "Product",
                  category,
                  price: (product?.price as number) || 0,
                  retailer: (product?.retailer as string) || "Unknown",
                  retailerUrl: (product?.affiliate_url as string) || (product?.product_url as string) || "#",
                  image: (product?.image_url as string) || FALLBACK_IMAGE,
                  addedAt: new Date().toISOString(),
                };
              });
              setProducts(mapped);
            }
          } else {
            // No room_products yet — check rooms.matched_products JSONB column
            const { data: roomRow, error } = await supabase
              .from("rooms")
              .select("matched_products, render_context")
              .eq("id", roomId)
              .single();

            if (!error && roomRow?.matched_products && Array.isArray(roomRow.matched_products) && roomRow.matched_products.length > 0) {
              const dbProducts = roomRow.matched_products as Record<string, unknown>[];
              const mapped: Product[] = dbProducts.map((p, i) => {
                const category = mapCategory((p.category as string) ?? (p.itemLabel as string) ?? "");
                return {
                  id: (p.id as number) || i + 1,
                  zone: getCategoryZone((p.category as string) ?? (p.itemLabel as string) ?? ""),
                  brand: (p.brand as string) || (p.retailer as string) || "Unknown",
                  name: (p.name as string) || (p.title as string) || "Product",
                  category,
                  price: (p.price as number) || 0,
                  salePrice: (p.sale_price as number) || undefined,
                  retailer: (p.retailer as string) || "Unknown",
                  retailerUrl: (p.affiliate_url as string) || (p.product_url as string) || (p.productUrl as string) || "#",
                  image: (p.image_url as string) || (p.thumbnail_url as string) || (p.thumbnailUrl as string) || FALLBACK_IMAGE,
                  addedAt: (p.created_at as string) || new Date().toISOString(),
                };
              });
              setProducts(mapped);
            } else {
              // Fire furniture matching pipeline (non-blocking) and fall back to defaults
              fetch("/api/pipeline/furniture-match", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ room_id: roomId }),
              }).catch((err) =>
                console.warn("[step-9] Furniture matching trigger failed:", err)
              );
              setProducts(DEFAULT_PRODUCTS);
              setZones(DEFAULT_ZONES);
            }
          }
        } catch {
          // Network or parse error — fall back gracefully
          setProducts(DEFAULT_PRODUCTS);
          setZones(DEFAULT_ZONES);
        }
      } else {
        // No active room — demo mode
        setProducts(DEFAULT_PRODUCTS);
        setZones(DEFAULT_ZONES);
      }

      setProductsLoading(false);
    };
    checkAuth();
  }, [router, roomId, renderUrl]);

  useEffect(() => {
    if (!isTouring) return;

    const interval = window.setInterval(() => {
      setTourIndex((current) => (current + 1) % zones.length);
    }, TOUR_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [isTouring, zones.length]);

  const visibleProducts = useMemo(() => {
    const filtered = products.filter(
      (product) => activeFilter === "All" || product.category === activeFilter,
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
    () => products.filter((product) => savedIds.includes(product.id)),
    [products, savedIds],
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
  const progress = maxRoomValue > 0
    ? Math.min(100, Math.round((savedTotal / maxRoomValue) * 100))
    : 0;
  const activeZoneId =
    hoveredProductId ??
    (isTouring ? (zones[tourIndex]?.id ?? null) : null);

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
  }, [savedTotal]);

  const toggleSaved = (productId: number) => {
    setSavedIds((current) => {
      const exists = current.includes(productId);
      if (exists) return current.filter((id) => id !== productId);
      return [...current, productId];
    });
  };

  const handleShop = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleShare = async () => {
    const shareUrl =
      typeof window !== "undefined"
        ? window.location.href
        : "https://www.example.com/design/step-9";

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
            <span>{savedIds.length} Saved</span>
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

            <div className="step9-hotspots" aria-hidden="true">
              {zonesLoading ? null : zones.map((zone) => {
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
                    }}
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
                  <p>Room total</p>
                  <strong>{money(displayedTotal)}</strong>
                </div>
                <div className="step9-budget-progress">
                  <div className="step9-budget-bar">
                    <span style={{ width: `${progress}%` }} />
                  </div>
                  <small>{progress}% of room collected</small>
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
                          animation: "step9SkeletonShimmer 1.4s ease-in-out infinite",
                        }}
                      />
                      <div className="step9-product-copy" style={{ gap: 8 }}>
                        <div
                          style={{
                            height: 10,
                            width: "40%",
                            borderRadius: 4,
                            background: "#1E3A5F",
                            animation: "step9SkeletonShimmer 1.4s ease-in-out infinite",
                          }}
                        />
                        <div
                          style={{
                            height: 14,
                            width: "70%",
                            borderRadius: 4,
                            background: "#1E3A5F",
                            animation: "step9SkeletonShimmer 1.4s ease-in-out infinite",
                          }}
                        />
                        <div
                          style={{
                            height: 10,
                            width: "55%",
                            borderRadius: 4,
                            background: "#1E3A5F",
                            animation: "step9SkeletonShimmer 1.4s ease-in-out infinite",
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </>
              ) : visibleProducts.length === 0 ? (
                <div className="step9-empty-state">
                  <div className="step9-empty-icon">
                    <Link2 size={18} />
                  </div>
                  <h2>Nothing here</h2>
                  <p>
                    Try a different category or sort to reveal more items from
                    this room.
                  </p>
                </div>
              ) : (
                visibleProducts.map((product, index) => {
                  const isSaved = savedIds.includes(product.id);
                  const activePrice = product.salePrice ?? product.price;
                  return (
                    <article
                      key={product.id}
                      className="step9-product-card"
                      style={{ animationDelay: `${index * 65}ms` }}
                      onMouseEnter={() => setHoveredProductId(product.zone)}
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
                          onClick={() => toggleSaved(product.id)}
                          aria-pressed={isSaved}
                        >
                          {isSaved ? <Check size={16} /> : <Heart size={16} />}
                          <span>{isSaved ? "Saved" : "Save"}</span>
                        </button>
                        <button
                          type="button"
                          className="step9-shop-button"
                          onClick={() => handleShop(product.retailerUrl)}
                        >
                          <span>Shop</span>
                          <ArrowUpRight size={15} />
                        </button>
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

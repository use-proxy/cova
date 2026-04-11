"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DetectedItem {
  id: string;
  label: string;
  left: number; // bbox center X as % of image width (0–100)
  top: number; // bbox center Y as % of image height (0–100)
  bbox?: [number, number, number, number]; // [x,y,w,h] fractions — for match API
  keep?: boolean | null; // three-state — for match API guard
}

export interface MatchedProduct {
  id: string;
  name: string;
  retailer: string;
  price: number;
  affiliate_url: string;
  image_url: string;
  match_score: number;
  match_label: "Perfect Match" | "Very Similar" | "Inspired By";
  fit_label?: string;
  fit_reason?: string;
  is_sale?: boolean;
  rating?: number | null;
  rating_count?: number | null;
}

type AccessoryProduct = MatchedProduct & { category: string };

interface ShopRoomProps {
  renderUrl: string;
  detections: DetectedItem[];
  productsByItem: Record<string, MatchedProduct[]>;
  isLoadingProducts: boolean;
  onBuyClick: (product: MatchedProduct) => void;
  onRefreshItem?: (itemId: string, currentProductName: string) => void;
  roomTotal?: number;
  savings?: number | null;
  accessories?: AccessoryProduct[];
}

// ─── Match color map ──────────────────────────────────────────────────────────

const MATCH_COLORS: Record<MatchedProduct["match_label"], string> = {
  "Perfect Match": "#4A9B7F",
  "Very Similar": "#C9A84C",
  "Inspired By": "#8A9BB5",
};

// ─── Skeleton card ────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div
      style={{
        width: "168px",
        height: "280px",
        backgroundColor: "#F5F0E8",
        borderRadius: "14px",
        overflow: "hidden",
        position: "relative",
        flexShrink: 0,
      }}
    >
      <motion.div
        animate={{ x: ["-100%", "200%"] }}
        transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
        style={{
          position: "absolute",
          inset: 0,
          width: "50%",
          background:
            "linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)",
        }}
      />
    </div>
  );
}

// ─── Product card (v0 — ivory) ────────────────────────────────────────────────

function ProductCard({
  product,
  onBuyClick,
}: {
  product: MatchedProduct;
  onBuyClick: () => void;
}) {
  const formattedPrice = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(product.price);

  const matchColor = MATCH_COLORS[product.match_label];

  return (
    <div
      style={{
        width: "168px",
        backgroundColor: "#F5F0E8",
        borderRadius: "14px",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      {/* Product image */}
      <div
        style={{
          height: "140px",
          overflow: "hidden",
          backgroundColor: "#E8E0D0",
        }}
      >
        {product.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.image_url}
            alt={product.name}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              backgroundColor: "#E8E0D0",
            }}
          />
        )}
      </div>

      {/* Info */}
      <div style={{ padding: "10px 10px 12px" }}>
        {/* Name */}
        <p
          style={{
            fontSize: "12px",
            fontWeight: 600,
            color: "#1A2D42",
            lineHeight: 1.3,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            marginBottom: "6px",
          }}
        >
          {product.name}
        </p>

        {/* Retailer + match dot */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "5px",
            marginBottom: "5px",
          }}
        >
          <span
            style={{
              width: "7px",
              height: "7px",
              borderRadius: "50%",
              backgroundColor: matchColor,
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: "11px", color: "#6B7A8D" }}>
            {product.retailer}
          </span>
        </div>

        {/* Fit indicator */}
        {product.fit_label &&
          product.fit_label !== "Dimensions Unconfirmed" && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                marginBottom: "5px",
              }}
            >
              <span
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  flexShrink: 0,
                  backgroundColor:
                    product.fit_label === "Perfect Fit"
                      ? "#1A7A4A"
                      : product.fit_label === "Good Fit"
                        ? "#C9A84C"
                        : "#D4801A",
                }}
              />
              <span
                style={{
                  fontSize: "10px",
                  color:
                    product.fit_label === "Perfect Fit"
                      ? "#1A7A4A"
                      : product.fit_label === "Good Fit"
                        ? "#C9A84C"
                        : "#D4801A",
                }}
              >
                {product.fit_label}
              </span>
            </div>
          )}

        {/* Price */}
        <p
          style={{
            fontSize: "15px",
            fontWeight: 700,
            color: "#1A2D42",
            marginBottom: "8px",
          }}
        >
          {formattedPrice}
        </p>

        {/* Buy button */}
        <button
          onClick={onBuyClick}
          style={{
            width: "100%",
            backgroundColor: "#C9A84C",
            color: "#091829",
            border: "none",
            borderRadius: "8px",
            padding: "8px",
            fontSize: "12px",
            fontWeight: 600,
            cursor: "pointer",
            marginBottom: "6px",
          }}
        >
          Buy →
        </button>

        {/* Trust line */}
        <p style={{ fontSize: "10px", color: "#8A9BB5", textAlign: "center" }}>
          via {product.retailer}
        </p>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ShopRoom({
  renderUrl,
  detections,
  productsByItem,
  isLoadingProducts,
  onBuyClick,
  onRefreshItem,
  roomTotal = 0,
  savings = null,
  accessories = [],
}: ShopRoomProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState(detections[0]?.id ?? "");
  const [dotsVisible, setDotsVisible] = useState(false);
  const [hoveredDot, setHoveredDot] = useState<string | null>(null);

  // Reveal dots after 1.5s
  useEffect(() => {
    const t = setTimeout(() => setDotsVisible(true), 1500);
    return () => clearTimeout(t);
  }, []);

  // Sync activeTab when detections first arrive
  useEffect(() => {
    if (!activeTab && detections.length > 0) {
      setActiveTab(detections[0].id);
    }
  }, [detections, activeTab]);

  const currentProducts = productsByItem[activeTab] ?? [];

  // True when detections is just the synthetic fallback
  const isSynthetic =
    detections.length === 1 && detections[0].id === "your-room";
  const visibleItemCount = detections.filter(
    (d) => d.id !== "your-room",
  ).length;

  function handleDotClick(id: string) {
    setActiveTab(id);
    setIsExpanded(true);
  }

  function handlePillClick(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setActiveTab(id);
    setIsExpanded(true);
  }

  function handleBackdropClick() {
    setIsExpanded(false);
  }

  return (
    <div
      className="fixed inset-0 overflow-hidden"
      style={{ backgroundColor: "#091829" }}
    >
      {/* ── CSS animations ─────────────────────────────────────────────────── */}
      <style>{`
        @keyframes dot-pulse {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.35); opacity: 0.25; }
        }
        .animate-dot-pulse {
          animation: dot-pulse 2.2s ease-in-out infinite;
        }
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.2s ease-out forwards;
        }
        .scrollbar-hide {
          scrollbar-width: none;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>

      {/* ── Layer 1: render image ──────────────────────────────────────────── */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={renderUrl}
        alt="Your redesigned room"
        crossOrigin="anonymous"
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Bottom gradient */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to top, rgba(9,24,41,0.95) 0%, rgba(9,24,41,0.4) 40%, transparent 70%)",
          pointerEvents: "none",
        }}
      />
      {/* Top gradient */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(9,24,41,0.45) 0%, transparent 28%)",
          pointerEvents: "none",
        }}
      />

      {/* ── Step indicator ─────────────────────────────────────────────────── */}
      <div
        className="absolute top-5 left-5 right-5"
        style={{ zIndex: 10, pointerEvents: "none" }}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="font-sans text-[11px]" style={{ color: "#8A9BB5" }}>
            10 of 10
          </span>
        </div>
        <div
          className="h-[2px] rounded-full overflow-hidden"
          style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
        >
          {/* 100% filled — final step */}
          <div
            className="h-full rounded-full"
            style={{ width: "100%", backgroundColor: "#C9A84C" }}
          />
        </div>
      </div>

      {/* ── Clickable backdrop (collapses sheet on click) ──────────────────── */}
      <div
        className="absolute inset-0"
        style={{ zIndex: 15 }}
        onClick={handleBackdropClick}
      />

      {/* ── Layer 2: hotspot dots ──────────────────────────────────────────── */}
      {detections.map((item, index) => {
        // No dot for synthetic fallback item
        if (item.id === "your-room") return null;

        const isActive = activeTab === item.id && isExpanded;
        const staggerDelay = 1.5 + index * 0.2;

        return (
          <div
            key={item.id}
            style={{
              position: "absolute",
              left: `${item.left}%`,
              top: `${item.top}%`,
              transform: "translate(-50%, -50%)",
              zIndex: 20,
              opacity: dotsVisible ? 1 : 0,
              transition: `opacity 0.4s ease ${staggerDelay}s`,
            }}
          >
            {/* Outer pulse ring */}
            <div
              className="animate-dot-pulse"
              style={{
                position: "absolute",
                width: "44px",
                height: "44px",
                borderRadius: "50%",
                backgroundColor: isActive
                  ? "rgba(201,168,76,0.25)"
                  : "rgba(201,168,76,0.15)",
                border: "1.5px solid rgba(201,168,76,0.5)",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                pointerEvents: "none",
              }}
            />

            {/* Inner dot (clickable) */}
            <button
              onClick={() => handleDotClick(item.id)}
              onMouseEnter={() => setHoveredDot(item.id)}
              onMouseLeave={() => setHoveredDot(null)}
              style={{
                position: "relative",
                zIndex: 1,
                width: "20px",
                height: "20px",
                borderRadius: "50%",
                backgroundColor: isActive ? "#C9A84C" : "rgba(201,168,76,0.85)",
                border: isActive
                  ? "2px solid #F8F6F1"
                  : "2px solid rgba(248,246,241,0.6)",
                boxShadow: isActive
                  ? "0 0 14px rgba(201,168,76,0.8)"
                  : "0 0 6px rgba(201,168,76,0.45)",
                cursor: "pointer",
                padding: 0,
                display: "block",
              }}
            />

            {/* Hover label */}
            {hoveredDot === item.id && (
              <div
                className="animate-fade-in"
                style={{
                  position: "absolute",
                  bottom: "28px",
                  left: "50%",
                  transform: "translateX(-50%)",
                  backgroundColor: "rgba(9,24,41,0.9)",
                  color: "#F8F6F1",
                  fontSize: "11px",
                  fontFamily: "var(--font-sans)",
                  fontWeight: 500,
                  padding: "4px 8px",
                  borderRadius: "6px",
                  whiteSpace: "nowrap",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                  border: "1px solid rgba(201,168,76,0.3)",
                  pointerEvents: "none",
                }}
              >
                {item.label}
              </div>
            )}
          </div>
        );
      })}

      {/* ── Layer 3: bottom sheet ──────────────────────────────────────────── */}
      <div
        className="absolute bottom-0 left-0 right-0 overflow-hidden transition-all duration-300 ease-in-out"
        style={{
          height: isExpanded ? "72%" : "120px",
          backgroundColor: "#0D2035",
          borderTopLeftRadius: "24px",
          borderTopRightRadius: "24px",
          zIndex: 25,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Collapsed state ─────────────────────────────────────────────── */}
        {!isExpanded && (
          <div
            className="h-full px-5 pt-3 cursor-pointer"
            onClick={() => setIsExpanded(true)}
          >
            {/* Drag handle */}
            <div className="flex justify-center mb-3">
              <div
                className="w-8 h-1 rounded-full"
                style={{ backgroundColor: "#1E3A5F" }}
              />
            </div>

            {/* Title + count */}
            <div className="flex items-center justify-between mb-1">
              <span
                style={{
                  fontFamily: "var(--font-serif)",
                  fontSize: "17px",
                  color: "#F8F6F1",
                }}
              >
                Shop your room
              </span>
              <span
                className="font-sans text-[12px]"
                style={{ color: "#8A9BB5" }}
              >
                {isSynthetic
                  ? "Tap to explore"
                  : `${visibleItemCount} items found`}
              </span>
            </div>

            {/* Room total + savings */}
            {roomTotal > 0 && (
              <div className="flex items-center gap-3 mb-2">
                <span
                  className="font-sans text-[11px]"
                  style={{ color: "#F8F6F1", opacity: 0.7 }}
                >
                  Room total:{" "}
                  {new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: "USD",
                    maximumFractionDigits: 0,
                  }).format(roomTotal)}
                </span>
                {savings !== null && savings > 0 && (
                  <span
                    className="font-sans text-[11px]"
                    style={{ color: "#C9A84C" }}
                  >
                    Saved{" "}
                    {new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: "USD",
                      maximumFractionDigits: 0,
                    }).format(savings)}{" "}
                    vs budget
                  </span>
                )}
              </div>
            )}

            {/* Pill strip */}
            <div
              className="scrollbar-hide flex gap-2 overflow-x-auto pb-1"
              onClick={(e) => e.stopPropagation()}
            >
              {detections.map((item) => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={(e) => handlePillClick(item.id, e)}
                    className="flex-shrink-0 font-sans text-[12px] font-medium px-3 py-1.5 rounded-full"
                    style={{
                      backgroundColor: isActive ? "#C9A84C" : "transparent",
                      color: isActive ? "#091829" : "#8A9BB5",
                      border: `1px solid ${isActive ? "#C9A84C" : "#1E3A5F"}`,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Expanded state ───────────────────────────────────────────────── */}
        {isExpanded && (
          <div className="h-full flex flex-col px-5 pt-3">
            {/* Drag handle */}
            <div className="flex justify-center mb-3 flex-shrink-0">
              <div
                className="w-8 h-1 rounded-full"
                style={{ backgroundColor: "#1E3A5F" }}
              />
            </div>

            {/* Header: title + X */}
            <div className="flex items-center justify-between mb-1 flex-shrink-0">
              <span
                style={{
                  fontFamily: "var(--font-serif)",
                  fontSize: "20px",
                  color: "#F8F6F1",
                }}
              >
                Shop your room
              </span>
              <button
                onClick={() => setIsExpanded(false)}
                className="font-sans"
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#8A9BB5",
                  fontSize: "22px",
                  lineHeight: 1,
                  padding: "0 2px",
                }}
              >
                ×
              </button>
            </div>

            {/* Room total + savings (expanded) */}
            {roomTotal > 0 && (
              <div className="flex items-center gap-3 mb-3 flex-shrink-0">
                <span
                  className="font-sans text-[11px]"
                  style={{ color: "#F8F6F1", opacity: 0.7 }}
                >
                  Room total:{" "}
                  {new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: "USD",
                    maximumFractionDigits: 0,
                  }).format(roomTotal)}
                </span>
                {savings !== null && savings > 0 && (
                  <span
                    className="font-sans text-[11px]"
                    style={{ color: "#C9A84C" }}
                  >
                    Saved{" "}
                    {new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: "USD",
                      maximumFractionDigits: 0,
                    }).format(savings)}{" "}
                    vs budget
                  </span>
                )}
              </div>
            )}

            {/* Tab bar */}
            <div className="scrollbar-hide flex gap-2 overflow-x-auto mb-4 flex-shrink-0">
              {detections.map((item) => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className="flex-shrink-0 font-sans text-[13px] font-medium px-4 py-2 rounded-full"
                    style={{
                      backgroundColor: isActive ? "#C9A84C" : "transparent",
                      color: isActive ? "#091829" : "#8A9BB5",
                      border: `1px solid ${isActive ? "#C9A84C" : "#1E3A5F"}`,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>

            {/* Scrollable content: products + accessories */}
            <div className="flex-1 overflow-y-auto">
              {/* Product grid (horizontal scroll) */}
              <div className="scrollbar-hide flex gap-3 overflow-x-auto pb-3 items-start">
                {isLoadingProducts && currentProducts.length === 0 ? (
                  <>
                    <SkeletonCard />
                    <SkeletonCard />
                    <SkeletonCard />
                  </>
                ) : currentProducts.length > 0 ? (
                  currentProducts.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      onBuyClick={() => onBuyClick(product)}
                    />
                  ))
                ) : (
                  <p
                    className="font-sans text-[13px]"
                    style={{ color: "#8A9BB5" }}
                  >
                    No products found for this item.
                  </p>
                )}
              </div>

              {/* Show me something different */}
              {onRefreshItem && (
                <button
                  onClick={() =>
                    onRefreshItem(activeTab, currentProducts[0]?.name ?? "")
                  }
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontFamily: "var(--font-sans)",
                    fontSize: "12px",
                    color: "#8A9BB5",
                    padding: "8px 0",
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                  }}
                >
                  ↻ Show me something different
                </button>
              )}

              {/* Complete the Look — accessory recommendations */}
              {accessories.length > 0 && (
                <div style={{ marginTop: "24px", paddingBottom: "16px" }}>
                  {/* Section header */}
                  <div style={{ marginBottom: "12px" }}>
                    <p
                      style={{
                        fontFamily: "var(--font-sans)",
                        fontSize: "11px",
                        fontWeight: 500,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        color: "#C9A84C",
                      }}
                    >
                      Complete the Look
                    </p>
                    <p
                      style={{
                        fontFamily: "var(--font-sans)",
                        fontSize: "12px",
                        color: "#8A9BB5",
                        marginTop: "2px",
                      }}
                    >
                      Accessories matched to your style
                    </p>
                  </div>

                  {/* Horizontal scroll of accessory cards */}
                  <div
                    className="scrollbar-hide"
                    style={{
                      display: "flex",
                      gap: "12px",
                      overflowX: "auto",
                      paddingBottom: "4px",
                    }}
                  >
                    {accessories.map((accessory) => (
                      <ProductCard
                        key={accessory.id}
                        product={{
                          id: accessory.id,
                          name: accessory.name,
                          retailer: accessory.retailer,
                          price: accessory.price,
                          affiliate_url: accessory.affiliate_url,
                          image_url: accessory.image_url,
                          match_score: accessory.match_score,
                          match_label: accessory.match_label,
                          is_sale: accessory.is_sale,
                          rating: accessory.rating,
                          rating_count: accessory.rating_count,
                        }}
                        onBuyClick={() => onBuyClick(accessory)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

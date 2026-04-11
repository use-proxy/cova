"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { X } from "lucide-react";
import { ProductCard, type Product } from "./ProductCard";

interface ProductPanelProps {
  isOpen: boolean;
  onClose: () => void;
  furnitureName: string;
  products: Product[];
  initialMatchIndex?: number;
}

export function ProductPanel({
  isOpen,
  onClose,
  furnitureName,
  products,
  initialMatchIndex = 0,
}: ProductPanelProps) {
  const [activeMatch, setActiveMatch] = useState(initialMatchIndex);
  const panelRef = useRef<HTMLDivElement>(null);
  const cardContainerRef = useRef<HTMLDivElement>(null);
  const dragStartX = useRef<number | null>(null);
  const dragCurrentX = useRef<number>(0);
  const isDragging = useRef<boolean>(false);

  // Reset match index when products change
  useEffect(() => {
    setActiveMatch(initialMatchIndex);
  }, [initialMatchIndex]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  // Animate card entrance when activeMatch changes (from tab click)
  const animateCardEntrance = useCallback((direction: 1 | -1) => {
    const el = cardContainerRef.current;
    if (!el) return;
    // Instantly position off-screen on the entrance side
    el.style.transition = "none";
    el.style.transform = `translateX(${direction * -110}%)`;
    el.style.opacity = "0";
    // Next frame: animate in
    requestAnimationFrame(() => {
      if (!cardContainerRef.current) return;
      cardContainerRef.current.style.transition =
        "transform 300ms ease-out, opacity 300ms ease-out";
      cardContainerRef.current.style.transform = "translateX(0)";
      cardContainerRef.current.style.opacity = "1";
    });
  }, []);

  const goToMatch = useCallback(
    (index: number) => {
      if (index === activeMatch || index < 0 || index >= products.length)
        return;
      const direction = index > activeMatch ? -1 : 1; // new card enters from the direction of navigation
      setActiveMatch(index);
      animateCardEntrance(direction);
    },
    [activeMatch, products.length, animateCardEntrance],
  );

  // Swipe handlers
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    dragStartX.current = e.clientX;
    isDragging.current = true;
    dragCurrentX.current = 0;
    cardContainerRef.current?.setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current || dragStartX.current === null) return;
    dragCurrentX.current = e.clientX - dragStartX.current;
    if (cardContainerRef.current) {
      cardContainerRef.current.style.transform = `translateX(${dragCurrentX.current}px)`;
      cardContainerRef.current.style.transition = "none";
    }
  }, []);

  const handlePointerUp = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;

    const delta = dragCurrentX.current;
    dragCurrentX.current = 0;

    if (Math.abs(delta) > 60) {
      const direction = delta > 0 ? 1 : -1;
      const el = cardContainerRef.current;
      if (el) {
        // Fly card off screen
        el.style.transition =
          "transform 300ms ease-out, opacity 300ms ease-out";
        el.style.transform = `translateX(${direction * 110}%)`;
        el.style.opacity = "0";
      }
      setTimeout(() => {
        // Change match
        if (direction < 0 && activeMatch < products.length - 1) {
          setActiveMatch((m) => m + 1);
        } else if (direction > 0 && activeMatch > 0) {
          setActiveMatch((m) => m - 1);
        }
        // Animate new card in from opposite side
        const entranceDir = direction;
        requestAnimationFrame(() => {
          const el2 = cardContainerRef.current;
          if (!el2) return;
          el2.style.transition = "none";
          el2.style.transform = `translateX(${entranceDir * -110}%)`;
          el2.style.opacity = "0";
          requestAnimationFrame(() => {
            if (!cardContainerRef.current) return;
            cardContainerRef.current.style.transition =
              "transform 300ms ease-out, opacity 300ms ease-out";
            cardContainerRef.current.style.transform = "translateX(0)";
            cardContainerRef.current.style.opacity = "1";
          });
        });
      }, 300);
    } else {
      // Spring back
      if (cardContainerRef.current) {
        cardContainerRef.current.style.transition =
          "transform 400ms cubic-bezier(0.175, 0.885, 0.32, 1.275)";
        cardContainerRef.current.style.transform = "translateX(0)";
      }
    }

    dragStartX.current = null;
  }, [activeMatch, products.length]);

  const product = products[activeMatch];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 transition-all duration-500"
        style={{
          background: isOpen ? "rgba(10,22,40,0.6)" : "transparent",
          backdropFilter: isOpen ? "blur(4px)" : "none",
          pointerEvents: isOpen ? "auto" : "none",
          opacity: isOpen ? 1 : 0,
        }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className="fixed z-50 bg-[#0d1f3c] flex flex-col overflow-hidden
          md:right-0 md:top-0 md:bottom-0 md:w-[420px] md:rounded-l-3xl
          max-md:bottom-0 max-md:left-0 max-md:right-0 max-md:rounded-t-3xl max-md:max-h-[92vh]"
        style={{
          transform: isOpen
            ? "translateX(0) translateY(0)"
            : typeof window !== "undefined" && window.innerWidth < 768
              ? "translateY(100%)"
              : "translateX(100%)",
          transition: "transform 500ms cubic-bezier(0.32, 0.72, 0, 1)",
          boxShadow: isOpen ? "-20px 0 60px rgba(0,0,0,0.5)" : "none",
        }}
      >
        {/* Mobile handle bar */}
        <div className="md:hidden flex justify-center pt-3 pb-1">
          <div
            className="w-8 h-1 rounded-full"
            style={{ background: "rgba(201,168,76,0.3)" }}
          />
        </div>

        {/* Header */}
        <div
          className="flex items-center justify-between px-5 h-16 flex-shrink-0"
          style={{
            borderBottom: "1px solid rgba(201,168,76,0.15)",
            animation: isOpen
              ? "panelFadeUp 250ms ease-out 100ms both"
              : "none",
          }}
        >
          <div>
            <p className="font-serif text-lg text-white">{furnitureName}</p>
            <p className="text-xs font-sans text-[#C9A84C]/60">
              {products.length} matches found
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 hover:border-[#C9A84C]"
            style={{ border: "1px solid rgba(201,168,76,0.3)" }}
            aria-label="Close panel"
          >
            <X className="w-4 h-4 text-white/50 hover:text-[#C9A84C]" />
          </button>
        </div>

        {/* Match tabs */}
        <div
          className="flex items-center justify-center gap-2 py-3 flex-shrink-0"
          style={{
            animation: isOpen
              ? "panelFadeUp 250ms ease-out 150ms both"
              : "none",
          }}
        >
          {products.map((_, i) => (
            <button
              key={i}
              onClick={() => goToMatch(i)}
              className="px-3 py-1.5 rounded-full text-[10px] font-sans uppercase tracking-[0.1em] transition-all duration-200"
              style={{
                background: i === activeMatch ? "#C9A84C" : "transparent",
                color: i === activeMatch ? "#0a1628" : "rgba(255,255,255,0.6)",
                border:
                  i === activeMatch ? "none" : "1px solid rgba(201,168,76,0.3)",
              }}
            >
              Match {i + 1}
            </button>
          ))}
        </div>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5 pb-3 flex-shrink-0">
          {products.map((_, i) => (
            <div
              key={i}
              className="rounded-full transition-all duration-200"
              style={{
                width: i === activeMatch ? 8 : 5,
                height: i === activeMatch ? 8 : 5,
                background:
                  i === activeMatch ? "#C9A84C" : "rgba(201,168,76,0.25)",
              }}
            />
          ))}
        </div>

        {/* Swipeable product card area */}
        {product && (
          <div
            ref={cardContainerRef}
            className="flex-1 overflow-y-auto"
            style={{ touchAction: "pan-y", userSelect: "none", cursor: "grab" }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <ProductCard
              key={product.id}
              product={product}
              onClose={onClose}
              onSimilarSelect={() => {}}
            />
          </div>
        )}
      </div>
    </>
  );
}

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Check, Camera, ChevronLeft, ChevronRight } from "lucide-react";

// Color constants
const COLORS = {
  background: "#091829",
  surface: "#0D2035",
  elevated: "#112540",
  gold: "#C9A84C",
  goldHover: "#D4B460",
  ivory: "#F5F0E8",
  muted: "#8A9BB5",
  subtle: "#4A5E7A",
  border: "rgba(201,168,76,0.20)",
  borderLight: "rgba(201,168,76,0.15)",
};

// Room types
const ROOMS = [
  { id: "living-room", name: "Living Room", preset: false },
  { id: "bedroom", name: "Bedroom", preset: false },
  { id: "studio", name: "Studio", preset: false },
  { id: "home-office", name: "Home Office", preset: false },
  { id: "dining-room", name: "Dining Room", preset: false },
  { id: "bathroom", name: "Bathroom", preset: false },
  { id: "outdoor", name: "Outdoor", preset: false },
  { id: "dorm-room", name: "Dorm Room", preset: true },
  { id: "first-apartment", name: "First Apartment", preset: true },
];

// Budget tiers
const TIERS = [
  {
    id: 0,
    label: "Thrift",
    range: "$500 – $2,000",
    description: "Secondhand finds, DIY projects, budget retailers",
    icon: "🪴",
  },
  {
    id: 1,
    label: "Balanced",
    range: "$2,000 – $8,000",
    description: "Mix of affordable and investment pieces",
    icon: "⚖️",
  },
  {
    id: 2,
    label: "Premium",
    range: "$8,000 – $25,000",
    description: "Quality brands, custom options, designer touches",
    icon: "✨",
  },
  {
    id: 3,
    label: "Luxury",
    range: "$25,000 – $75,000",
    description: "High-end designers, bespoke furniture, art pieces",
    icon: "💎",
  },
  {
    id: 4,
    label: "Ultra",
    range: "$75,000+",
    description: "No budget limits, exclusive access, white-glove service",
    icon: "👑",
  },
];

// Animated headline component
function AnimatedHeadline({ text }: { text: string }) {
  const words = text.split(" ");
  return (
    <h1
      className="font-serif text-center"
      style={{
        fontSize: "clamp(32px, 5vw, 48px)",
        color: COLORS.ivory,
        marginTop: 48,
        marginBottom: 8,
      }}
    >
      {words.map((word, i) => (
        <span
          key={i}
          className="inline-block"
          style={{
            animation: `wordFadeIn 400ms ease forwards`,
            animationDelay: `${i * 120}ms`,
            opacity: 0,
            marginRight: "0.3em",
          }}
        >
          {word}
        </span>
      ))}
    </h1>
  );
}

// Room card component
function RoomCard({
  room,
  isSelected,
  onSelect,
}: {
  room: (typeof ROOMS)[0];
  isSelected: boolean;
  onSelect: () => void;
}) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={onSelect}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="w-full text-left overflow-hidden relative transition-all duration-250 ease-out focus:outline-none"
        style={{
          aspectRatio: "4/3",
          borderRadius: 12,
          background: COLORS.surface,
          border: isSelected
            ? `1.5px solid ${COLORS.gold}`
            : `1px solid ${COLORS.borderLight}`,
          borderColor: isHovered && !isSelected
            ? "rgba(201,168,76,0.5)"
            : isSelected
              ? COLORS.gold
              : COLORS.borderLight,
          boxShadow: isSelected
            ? `0 0 0 1px rgba(201,168,76,0.3), 0 12px 40px rgba(0,0,0,0.5), 0 0 30px rgba(201,168,76,0.08)`
            : isHovered
              ? `0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(201,168,76,0.1)`
              : "none",
          transform: isHovered && !isSelected ? "translateY(-3px)" : "none",
          cursor: "pointer",
        }}
      >
        {/* Image area - top 70% */}
        <div
          className="relative overflow-hidden"
          style={{
            height: "70%",
            background: COLORS.elevated,
            filter: isHovered ? "brightness(1.1)" : "brightness(1)",
            transition: "filter 250ms ease",
          }}
        >
          {/* Gradient overlay */}
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(transparent 60%, rgba(9,24,41,0.6))`,
            }}
          />
          {/* Camera placeholder icon */}
          <div className="absolute inset-0 flex items-center justify-center">
            <Camera
              size={32}
              style={{ color: "rgba(201,168,76,0.25)" }}
            />
          </div>
        </div>

        {/* Label area - bottom 30% */}
        <div
          className="flex items-center gap-2"
          style={{
            height: "30%",
            padding: "12px 14px",
            background: isSelected
              ? `linear-gradient(135deg, ${COLORS.surface}, rgba(201,168,76,0.06))`
              : COLORS.surface,
          }}
        >
          <span
            className="font-sans text-[13px] font-medium"
            style={{
              color: isSelected ? COLORS.gold : COLORS.ivory,
            }}
          >
            {room.name}
          </span>
          {room.preset && (
            <span
              className="font-sans text-[9px] uppercase"
              style={{
                color: COLORS.gold,
                border: `1px solid rgba(201,168,76,0.4)`,
                borderRadius: 4,
                padding: "2px 6px",
                letterSpacing: "0.05em",
              }}
            >
              Preset
            </span>
          )}
        </div>

        {/* Selected checkmark */}
        {isSelected && (
          <div
            className="absolute flex items-center justify-center"
            style={{
              top: 10,
              right: 10,
              width: 20,
              height: 20,
              borderRadius: "50%",
              background: COLORS.gold,
              animation: "checkIn 200ms ease forwards",
            }}
          >
            <Check size={12} color="white" strokeWidth={3} />
          </div>
        )}
      </button>

      {/* Preset tooltip */}
      {isSelected && room.preset && (
        <div
          className="absolute left-1/2 -translate-x-1/2 font-sans text-[11px] text-center whitespace-nowrap"
          style={{
            bottom: -28,
            color: COLORS.muted,
            animation: "wordFadeIn 200ms ease forwards",
          }}
        >
          Budget and constraints pre-filled for this space
        </div>
      )}
    </div>
  );
}

// Budget tier card
function TierCard({
  tier,
  isSelected,
  position,
  onClick,
}: {
  tier: (typeof TIERS)[0];
  isSelected: boolean;
  position: number; // -2, -1, 0, 1, 2 (0 = center)
  onClick: () => void;
}) {
  const getTransform = () => {
    const absPos = Math.abs(position);
    const scale = 1 - absPos * 0.12;
    const translateX = position * 120;
    const translateZ = -absPos * 100;
    const rotateY = position * -8;
    return `translateX(${translateX}px) translateZ(${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`;
  };

  const getOpacity = () => {
    const absPos = Math.abs(position);
    if (absPos === 0) return 1;
    if (absPos === 1) return 0.7;
    return 0.4;
  };

  return (
    <button
      onClick={onClick}
      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transition-all duration-300 ease-out focus:outline-none"
      style={{
        width: "clamp(260px, 32vw, 300px)",
        height: 220,
        transform: getTransform(),
        opacity: getOpacity(),
        zIndex: 10 - Math.abs(position),
        pointerEvents: Math.abs(position) > 1 ? "none" : "auto",
      }}
    >
      <div
        className="w-full h-full rounded-xl flex flex-col transition-all duration-300"
        style={{
          padding: "20px 24px",
          background: isSelected
            ? `linear-gradient(135deg, ${COLORS.surface}, rgba(201,168,76,0.08))`
            : COLORS.surface,
          border: isSelected
            ? `2px solid ${COLORS.gold}`
            : `1px solid ${COLORS.borderLight}`,
          boxShadow: isSelected
            ? `0 0 40px rgba(201,168,76,0.2), 0 20px 60px rgba(0,0,0,0.4)`
            : `0 10px 40px rgba(0,0,0,0.3)`,
          gap: 10,
        }}
      >
        {/* Top row: icon + checkmark */}
        <div className="flex items-center justify-between flex-shrink-0">
          <span style={{ fontSize: 22 }}>{tier.icon}</span>
          {isSelected && (
            <div
              className="flex items-center justify-center flex-shrink-0"
              style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                background: COLORS.gold,
              }}
            >
              <Check size={11} color={COLORS.background} strokeWidth={3} />
            </div>
          )}
        </div>
        {/* Label */}
        <h3
          className="font-serif flex-shrink-0"
          style={{
            fontSize: 18,
            lineHeight: 1.2,
            color: isSelected ? COLORS.gold : COLORS.ivory,
            margin: 0,
          }}
        >
          {tier.label}
        </h3>
        {/* Range */}
        <p
          className="font-sans font-semibold flex-shrink-0"
          style={{ fontSize: 14, color: COLORS.ivory, margin: 0 }}
        >
          {tier.range}
        </p>
        {/* Divider */}
        <div style={{ height: 1, background: "rgba(201,168,76,0.12)", flexShrink: 0 }} />
        {/* Description */}
        <p
          className="font-sans leading-relaxed"
          style={{
            fontSize: 11,
            color: COLORS.muted,
            margin: 0,
            flex: 1,
            overflow: "hidden",
          }}
        >
          {tier.description}
        </p>
      </div>
    </button>
  );
}

// Budget carousel component
function BudgetCarousel({
  selectedTier,
  onSelectTier,
}: {
  selectedTier: number;
  onSelectTier: (tier: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);

  const handlePrev = useCallback(() => {
    if (selectedTier > 0) {
      onSelectTier(selectedTier - 1);
    }
  }, [selectedTier, onSelectTier]);

  const handleNext = useCallback(() => {
    if (selectedTier < TIERS.length - 1) {
      onSelectTier(selectedTier + 1);
    }
  }, [selectedTier, onSelectTier]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") handlePrev();
      if (e.key === "ArrowRight") handleNext();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handlePrev, handleNext]);

  // Touch/mouse drag support
  const handleDragStart = (clientX: number) => {
    setIsDragging(true);
    setStartX(clientX);
    setDragOffset(0);
  };

  const handleDragMove = (clientX: number) => {
    if (!isDragging) return;
    setDragOffset(clientX - startX);
  };

  const handleDragEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    if (dragOffset > 50) handlePrev();
    else if (dragOffset < -50) handleNext();
    setDragOffset(0);
  };

  return (
    <div className="relative" style={{ perspective: "1000px" }}>
      {/* Navigation arrows */}
      <button
        onClick={handlePrev}
        disabled={selectedTier === 0}
        className="absolute left-4 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full transition-all duration-200 focus:outline-none"
        style={{
          background: selectedTier === 0 ? "transparent" : COLORS.surface,
          border: `1px solid ${selectedTier === 0 ? "transparent" : COLORS.borderLight}`,
          opacity: selectedTier === 0 ? 0.3 : 1,
          cursor: selectedTier === 0 ? "not-allowed" : "pointer",
        }}
      >
        <ChevronLeft size={24} style={{ color: COLORS.ivory }} />
      </button>
      <button
        onClick={handleNext}
        disabled={selectedTier === TIERS.length - 1}
        className="absolute right-4 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full transition-all duration-200 focus:outline-none"
        style={{
          background: selectedTier === TIERS.length - 1 ? "transparent" : COLORS.surface,
          border: `1px solid ${selectedTier === TIERS.length - 1 ? "transparent" : COLORS.borderLight}`,
          opacity: selectedTier === TIERS.length - 1 ? 0.3 : 1,
          cursor: selectedTier === TIERS.length - 1 ? "not-allowed" : "pointer",
        }}
      >
        <ChevronRight size={24} style={{ color: COLORS.ivory }} />
      </button>

      {/* Carousel container */}
      <div
        ref={containerRef}
        className="relative mx-auto overflow-visible"
        style={{
          height: 260,
          maxWidth: 600,
          transformStyle: "preserve-3d",
        }}
        onMouseDown={(e) => handleDragStart(e.clientX)}
        onMouseMove={(e) => handleDragMove(e.clientX)}
        onMouseUp={handleDragEnd}
        onMouseLeave={handleDragEnd}
        onTouchStart={(e) => handleDragStart(e.touches[0].clientX)}
        onTouchMove={(e) => handleDragMove(e.touches[0].clientX)}
        onTouchEnd={handleDragEnd}
      >
        {TIERS.map((tier, index) => {
          const position = index - selectedTier;
          if (Math.abs(position) > 2) return null;
          return (
            <TierCard
              key={tier.id}
              tier={tier}
              isSelected={index === selectedTier}
              position={position}
              onClick={() => onSelectTier(index)}
            />
          );
        })}
      </div>

      {/* Tier indicators */}
      <div className="flex justify-center gap-2 mt-6">
        {TIERS.map((tier, index) => (
          <button
            key={tier.id}
            onClick={() => onSelectTier(index)}
            className="w-2 h-2 rounded-full transition-all duration-200 focus:outline-none"
            style={{
              background: index === selectedTier ? COLORS.gold : COLORS.subtle,
              transform: index === selectedTier ? "scale(1.3)" : "scale(1)",
            }}
          />
        ))}
      </div>
    </div>
  );
}

// Main page component
export default function CovaDesignStep1() {
  const router = useRouter();
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [selectedTier, setSelectedTier] = useState(1); // Default to "Balanced"
  const [ctaUnlocked, setCtaUnlocked] = useState(false);
  const [ctaAnimating, setCtaAnimating] = useState(false);

  // Handle CTA unlock animation
  useEffect(() => {
    if (selectedRoom && !ctaUnlocked) {
      setCtaAnimating(true);
      setCtaUnlocked(true);
      const timer = setTimeout(() => setCtaAnimating(false), 600);
      return () => clearTimeout(timer);
    }
  }, [selectedRoom, ctaUnlocked]);

  const handleContinue = () => {
    if (!selectedRoom) return;
    console.log({ room: selectedRoom, tier: selectedTier });
    router.push("/design/step-2");
  };

  return (
    <div
      className="min-h-screen overflow-y-auto"
      style={{ background: COLORS.background }}
    >
      {/* Progress bar */}
      <div className="fixed top-0 left-0 right-0 z-50">
        <div style={{ height: 1, background: COLORS.gold, opacity: 0.3 }} />
        <div
          style={{
            height: 2,
            width: "9%",
            background: COLORS.gold,
          }}
        />
      </div>

      {/* Step indicator */}
      <div
        className="font-sans text-center uppercase"
        style={{
          paddingTop: 28,
          fontSize: 11,
          color: COLORS.subtle,
          letterSpacing: "0.15em",
        }}
      >
        Step 1 of 11
      </div>

      {/* Section 1: Room Type Selection */}
      <section className="px-4" style={{ maxWidth: 900, margin: "0 auto" }}>
        <AnimatedHeadline text="What are we designing today?" />

        <p
          className="font-sans text-center text-sm"
          style={{ color: COLORS.muted, marginBottom: 48 }}
        >
          Choose a room to get started.
        </p>

        {/* Room grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {ROOMS.map((room) => (
            <RoomCard
              key={room.id}
              room={room}
              isSelected={selectedRoom === room.id}
              onSelect={() => setSelectedRoom(room.id)}
            />
          ))}
        </div>
      </section>

      {/* Gold divider */}
      <div
        className="relative my-10"
        style={{ maxWidth: 900, margin: "40px auto" }}
      >
        <div
          style={{
            height: 1,
            background: COLORS.borderLight,
          }}
        />
        <span
          className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 font-sans uppercase"
          style={{
            fontSize: 10,
            letterSpacing: "0.25em",
            color: COLORS.gold,
            background: COLORS.background,
            padding: "0 16px",
          }}
        >
          Your Budget
        </span>
      </div>

      {/* Section 2: Budget Selector */}
      <section style={{ paddingTop: 32, paddingBottom: 48 }}>
        <BudgetCarousel
          selectedTier={selectedTier}
          onSelectTier={setSelectedTier}
        />
      </section>

      {/* Unified CTA */}
      <section
        className="px-4"
        style={{
          maxWidth: 480,
          margin: "0 auto",
          paddingBottom: 60,
        }}
      >
        <button
          onClick={handleContinue}
          disabled={!selectedRoom}
          className="w-full font-sans text-[15px] font-semibold transition-all duration-300 focus:outline-none"
          style={{
            padding: "16px 40px",
            borderRadius: 10,
            border: "none",
            background: selectedRoom
              ? COLORS.gold
              : "rgba(201,168,76,0.3)",
            color: selectedRoom ? COLORS.background : COLORS.muted,
            cursor: selectedRoom ? "pointer" : "not-allowed",
            boxShadow: selectedRoom
              ? "0 0 40px rgba(201,168,76,0.25)"
              : "none",
            animation: ctaAnimating ? "ctaUnlock 300ms ease forwards" : "none",
          }}
          onMouseEnter={(e) => {
            if (selectedRoom) {
              e.currentTarget.style.background = COLORS.goldHover;
              e.currentTarget.style.boxShadow = "0 0 60px rgba(201,168,76,0.4)";
              e.currentTarget.style.transform = "translateY(-2px)";
            }
          }}
          onMouseLeave={(e) => {
            if (selectedRoom) {
              e.currentTarget.style.background = COLORS.gold;
              e.currentTarget.style.boxShadow = "0 0 40px rgba(201,168,76,0.25)";
              e.currentTarget.style.transform = "translateY(0)";
            }
          }}
        >
          {selectedRoom ? "Start Designing →" : "Start Designing →"}
        </button>

        <p
          className="font-sans text-center mt-3"
          style={{ fontSize: 11, color: COLORS.subtle }}
        >
          No account needed to start
        </p>
      </section>
    </div>
  );
}

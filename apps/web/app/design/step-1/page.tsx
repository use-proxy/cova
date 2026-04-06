"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { StepIndicator } from "@/components/cova/StepIndicator";
import { useFingerprintStore, useSessionStore } from "@/lib/store";

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
  { id: "living-room", name: "Living Room", preset: false, imageUrl: "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/landing-assets/room-cards/living-room.jpg" },
  { id: "bedroom", name: "Bedroom", preset: false, imageUrl: "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/landing-assets/room-cards/bedroom.jpg" },
  { id: "studio", name: "Studio", preset: false, imageUrl: "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/landing-assets/room-cards/studio.jpg" },
  { id: "home-office", name: "Home Office", preset: false, imageUrl: "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/landing-assets/room-cards/home-office.jpg" },
  { id: "dining-room", name: "Dining Room", preset: false, imageUrl: "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/landing-assets/room-cards/dining-room.jpg" },
  { id: "bathroom", name: "Bathroom", preset: false, imageUrl: "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/landing-assets/room-cards/bathroom.jpg" },
  { id: "outdoor", name: "Outdoor", preset: false, imageUrl: "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/landing-assets/room-cards/outdoor.jpg" },
  { id: "dorm-room", name: "Dorm Room", preset: true, imageUrl: "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/landing-assets/room-cards/dorm-room.jpg" },
  { id: "first-apartment", name: "First Apartment", preset: true, imageUrl: "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/landing-assets/room-cards/first-apartment.jpg" },
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
            transition: "filter 250ms ease",
          }}
        >
          <img
            src={room.imageUrl}
            alt={room.name}
            className="absolute inset-0 w-full h-full object-cover"
            style={{
              filter: isSelected
                ? "brightness(0.7)"
                : isHovered
                  ? "brightness(0.85)"
                  : "brightness(0.75)",
              transition: "filter 250ms ease",
            }}
          />
          {/* Gradient overlay */}
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(transparent 60%, rgba(9,24,41,0.6))`,
            }}
          />
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


// Map carousel tier index (0-4) to store BudgetTier + range
const TIER_INDEX_TO_STORE: Array<{
  tier: 'budget' | 'mid' | 'premium' | 'luxury';
  range: [number, number];
}> = [
  { tier: 'budget',  range: [500,   2000]  }, // Thrift
  { tier: 'mid',     range: [2000,  8000]  }, // Balanced
  { tier: 'premium', range: [8000,  25000] }, // Premium
  { tier: 'luxury',  range: [25000, 75000] }, // Luxury
  { tier: 'luxury',  range: [75000, 500000]}, // Ultra → maps to luxury
];

// Main page component
export default function CovaDesignStep1() {
  const router = useRouter();
  const { setRoomType, setBudget } = useFingerprintStore();
  const { setStep } = useSessionStore();
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
    // Save room type and budget to store before navigating
    setRoomType(selectedRoom);
    const budgetMap = TIER_INDEX_TO_STORE[selectedTier] ?? TIER_INDEX_TO_STORE[1]!;
    setBudget(budgetMap.tier, budgetMap.range);
    setStep(2);
    router.push("/design/step-2");
  };

  return (
    <div
      className="min-h-screen overflow-y-auto"
      style={{ background: COLORS.background }}
    >
      <StepIndicator currentStep={1} totalSteps={10} />


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
      <section className="px-4" style={{ maxWidth: 900, margin: "0 auto", paddingTop: 32, paddingBottom: 48 }}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {TIERS.map((tier, index) => {
            const isSelected = selectedTier === index;
            return (
              <button
                key={tier.id}
                onClick={() => setSelectedTier(index)}
                className="text-left focus:outline-none transition-all duration-200"
                style={{
                  minHeight: 80,
                  padding: "20px 24px",
                  borderRadius: 12,
                  border: isSelected ? `2px solid ${COLORS.gold}` : `1px solid rgba(201,168,76,0.2)`,
                  background: isSelected ? "rgba(201,168,76,0.1)" : COLORS.surface,
                  cursor: "pointer",
                }}
              >
                <div className="flex items-center gap-3 mb-1">
                  <span style={{ fontSize: 18 }}>{tier.icon}</span>
                  <span className="font-serif text-base" style={{ color: isSelected ? COLORS.gold : COLORS.ivory }}>{tier.label}</span>
                  <span className="font-sans text-sm font-semibold ml-auto" style={{ color: COLORS.ivory }}>{tier.range}</span>
                  {isSelected && (
                    <div className="flex items-center justify-center flex-shrink-0" style={{ width: 20, height: 20, borderRadius: "50%", background: COLORS.gold }}>
                      <Check size={11} color={COLORS.background} strokeWidth={3} />
                    </div>
                  )}
                </div>
                <p className="font-sans text-xs" style={{ color: COLORS.muted, marginTop: 4 }}>{tier.description}</p>
              </button>
            );
          })}
        </div>
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
          Create your free account after capturing your room
        </p>
      </section>
    </div>
  );
}

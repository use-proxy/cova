"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, X } from "lucide-react";
import { useFingerprintStore, useSessionStore } from "@/lib/store";
import type { WallLayout } from "@/lib/store/fingerprint";
import { StepIndicator } from "@/components/cova/StepIndicator";
import { parseMeasurementParams, isIOS, isAndroid } from "@/lib/measureBridge";
import dynamic from "next/dynamic";

const RoomMeasure = dynamic(
  () => import("@/components/capture/RoomMeasure"),
  { ssr: false }
);

// Color constants
const colors = {
  navy: "#091829",
  gold: "#C9A84C",
  goldHover: "#D4B460",
  ivory: "#F5F0E8",
  muted: "#8A9BB5",
  mutedDark: "#4A5E7A",
  surface: "#0D2035",
  surface2: "#112540",
  goldBorder: "rgba(201,168,76,0.2)",
  goldBorderFocus: "rgba(201,168,76,0.6)",
  goldBorderLight: "rgba(201,168,76,0.15)",
  goldBorderMed: "rgba(201,168,76,0.3)",
  warning: "#D4801A",
  warningBg: "rgba(212,128,26,0.15)",
  remove: "#C0392B",
};

// Types
type PlacedSymbol = {
  id: string;
  type: "window" | "door";
  wall: "top" | "bottom" | "left" | "right";
  position: number; // 0-100% along the wall
};

// WallLayout is imported from @/lib/store/fingerprint

const naturalLightOptions = [
  "No windows",
  "One small window",
  "One large window",
  "Multiple windows",
  "Floor-to-ceiling windows",
];

const floorOptions = [
  "Hardwood",
  "Light laminate",
  "Carpet",
  "Tile",
  "Concrete",
  "Mixed / unsure",
];

const wallFinishOptions = [
  "Painted (standard)",
  "Exposed brick",
  "Wallpaper",
  "Wood paneling",
  "Concrete",
  "Unsure",
];

const fixedElements = [
  { emoji: "🔥", label: "Fireplace" },
  { emoji: "📚", label: "Built-in shelves" },
  { emoji: "🧱", label: "Exposed brick" },
  { emoji: "🏠", label: "Open to kitchen" },
  { emoji: "🏛", label: "Structural column" },
  { emoji: "🌡", label: "Radiator" },
  { emoji: "🚿", label: "En-suite bathroom" },
  { emoji: "🪟", label: "Bay window" },
  { emoji: "📐", label: "Sloped ceiling" },
  { emoji: "🪞", label: "Large mirror wall" },
  { emoji: "🛗", label: "Low doorways" },
  { emoji: "🔌", label: "Limited outlets" },
];

const starterChips = [
  "I rent",
  "I have pets",
  "Can't drill walls",
  "Child-safe furniture",
  "Very low light",
  "Tight budget",
  "Sharing the space",
  "Working from home",
  "Frequent guests",
];

const mustHaveItems = [
  { emoji: "📺", label: "TV" },
  { emoji: "🔊", label: "Soundbar" },
  { emoji: "💡", label: "Smart Lighting" },
  { emoji: "🎮", label: "Gaming Setup" },
  { emoji: "🛋", label: "Sofa" },
  { emoji: "🛏", label: "Bed" },
  { emoji: "💻", label: "Desk" },
  { emoji: "🍽", label: "Dining Table" },
  { emoji: "🪴", label: "Plants" },
  { emoji: "🖼", label: "Art" },
  { emoji: "🪞", label: "Mirror" },
  { emoji: "📚", label: "Bookshelf" },
  { emoji: "🟫", label: "Rug" },
  { emoji: "🏋", label: "Exercise Equipment" },
  { emoji: "🎹", label: "Piano / Instrument" },
];

// Custom Dropdown Component
interface CustomDropdownProps {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

function CustomDropdown({
  label,
  options,
  value,
  onChange,
  placeholder = "Select...",
}: CustomDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!dropdownRef.current?.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <label style={{ color: colors.muted, fontSize: 12 }}>{label}</label>
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between gap-2 transition-all duration-200 cursor-pointer"
          style={{
            background: colors.surface2,
            border: `1px solid ${isOpen ? colors.goldBorderFocus : colors.goldBorder}`,
            boxShadow: isOpen ? `0 0 0 3px rgba(201,168,76,0.1)` : "none",
            borderRadius: 10,
            padding: "12px 14px",
            color: value ? colors.ivory : colors.muted,
            fontSize: 15,
          }}
          onMouseEnter={(e) => {
            if (!isOpen)
              e.currentTarget.style.borderColor = "rgba(201,168,76,0.5)";
          }}
          onMouseLeave={(e) => {
            if (!isOpen) e.currentTarget.style.borderColor = colors.goldBorder;
          }}
        >
          <span style={{ fontFamily: "Inter, sans-serif" }}>
            {value || placeholder}
          </span>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke={colors.gold}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 200ms ease",
            }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {isOpen && (
          <div
            className="absolute z-50"
            style={{
              top: "calc(100% + 4px)",
              left: 0,
              right: 0,
              background: colors.surface2,
              border: `1px solid ${colors.goldBorderMed}`,
              borderRadius: 10,
              boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
              maxHeight: 240,
              overflowY: "auto",
              padding: 4,
            }}
          >
            {options.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  onChange(opt);
                  setIsOpen(false);
                }}
                className="w-full text-left flex items-center justify-between transition-colors duration-150 cursor-pointer"
                style={{
                  padding: "10px 14px",
                  color: opt === value ? colors.gold : colors.ivory,
                  background:
                    opt === value ? "rgba(201,168,76,0.15)" : "transparent",
                  borderRadius: 8,
                  fontSize: 14,
                  fontFamily: "Inter, sans-serif",
                }}
                onMouseEnter={(e) => {
                  if (opt !== value)
                    e.currentTarget.style.background = "rgba(201,168,76,0.1)";
                }}
                onMouseLeave={(e) => {
                  if (opt !== value)
                    e.currentTarget.style.background = "transparent";
                }}
              >
                <span>{opt}</span>
                {opt === value && (
                  <Check size={16} style={{ color: colors.gold }} />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  placeholder,
  hint,
  suffix = "ft",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  hint?: string;
  suffix?: string;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <label style={{ color: colors.muted, fontSize: 12 }}>{label}</label>
      <div className="relative">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          className="w-full transition-all duration-200 outline-none"
          style={{
            background: colors.surface2,
            border: `1px solid ${focused ? colors.goldBorderFocus : colors.goldBorder}`,
            borderRadius: 10,
            padding: "12px 14px",
            paddingRight: 40,
            color: colors.ivory,
            fontSize: 15,
          }}
        />
        <span
          className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: colors.muted, fontSize: 14 }}
        >
          {suffix}
        </span>
      </div>
      {hint && (
        <span style={{ color: colors.mutedDark, fontSize: 11 }}>{hint}</span>
      )}
    </div>
  );
}

// Drag-to-place wall schematic
function WallSchematic({
  placedSymbols,
  setPlacedSymbols,
}: {
  placedSymbols: PlacedSymbol[];
  setPlacedSymbols: React.Dispatch<React.SetStateAction<PlacedSymbol[]>>;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [draggedType, setDraggedType] = useState<"window" | "door" | null>(
    null
  );
  const [hoveredWall, setHoveredWall] = useState<
    "top" | "bottom" | "left" | "right" | null
  >(null);
  const [hoveredSymbolId, setHoveredSymbolId] = useState<string | null>(null);

  // Touch drag state
  const [touchDragType, setTouchDragType] = useState<"window" | "door" | null>(
    null
  );
  const [touchGhostPos, setTouchGhostPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const generateId = () =>
    Math.random().toString(36).substring(2, 9) + Date.now().toString(36);

  // Determine which wall zone a point is in
  const getWallFromPoint = (
    x: number,
    y: number
  ): "top" | "bottom" | "left" | "right" | null => {
    // Wall zones based on 280x280 SVG
    if (y >= 0 && y <= 48 && x >= 24 && x <= 256) return "top";
    if (y >= 232 && y <= 280 && x >= 24 && x <= 256) return "bottom";
    if (x >= 0 && x <= 48 && y >= 24 && y <= 256) return "left";
    if (x >= 232 && x <= 280 && y >= 24 && y <= 256) return "right";
    return null;
  };

  // Calculate position percentage along a wall
  const getPositionOnWall = (
    wall: "top" | "bottom" | "left" | "right",
    x: number,
    y: number
  ): number => {
    if (wall === "top" || wall === "bottom") {
      return Math.max(10, Math.min(90, ((x - 24) / 232) * 100));
    } else {
      return Math.max(10, Math.min(90, ((y - 24) / 232) * 100));
    }
  };

  // Desktop drag handlers
  const handleDragStart = (
    e: React.DragEvent,
    type: "window" | "door"
  ) => {
    setDraggedType(type);
    e.dataTransfer.setData("text/plain", type);
    e.dataTransfer.effectAllowed = "copy";
  };

  const handleDragEnd = () => {
    setDraggedType(null);
    setHoveredWall(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 280;
    const y = ((e.clientY - rect.top) / rect.height) * 280;
    setHoveredWall(getWallFromPoint(x, y));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!svgRef.current || !draggedType) return;

    const rect = svgRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 280;
    const y = ((e.clientY - rect.top) / rect.height) * 280;
    const wall = getWallFromPoint(x, y);

    if (wall) {
      const position = getPositionOnWall(wall, x, y);
      setPlacedSymbols((prev) => [
        ...prev,
        { id: generateId(), type: draggedType, wall, position },
      ]);
    }

    setDraggedType(null);
    setHoveredWall(null);
  };

  // Touch handlers for mobile
  const handleTouchStart = (
    e: React.TouchEvent,
    type: "window" | "door"
  ) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    setTouchDragType(type);
    setTouchGhostPos({ x: touch.clientX, y: touch.clientY });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchDragType) return;
    const touch = e.touches[0];
    setTouchGhostPos({ x: touch.clientX, y: touch.clientY });

    // Check if over SVG
    if (svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect();
      if (
        touch.clientX >= rect.left &&
        touch.clientX <= rect.right &&
        touch.clientY >= rect.top &&
        touch.clientY <= rect.bottom
      ) {
        const x = ((touch.clientX - rect.left) / rect.width) * 280;
        const y = ((touch.clientY - rect.top) / rect.height) * 280;
        setHoveredWall(getWallFromPoint(x, y));
      } else {
        setHoveredWall(null);
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchDragType || !svgRef.current) {
      setTouchDragType(null);
      setTouchGhostPos(null);
      setHoveredWall(null);
      return;
    }

    const touch = e.changedTouches[0];
    const rect = svgRef.current.getBoundingClientRect();
    const x = ((touch.clientX - rect.left) / rect.width) * 280;
    const y = ((touch.clientY - rect.top) / rect.height) * 280;
    const wall = getWallFromPoint(x, y);

    if (wall) {
      const position = getPositionOnWall(wall, x, y);
      setPlacedSymbols((prev) => [
        ...prev,
        { id: generateId(), type: touchDragType, wall, position },
      ]);
    }

    setTouchDragType(null);
    setTouchGhostPos(null);
    setHoveredWall(null);
  };

  const removeSymbol = (id: string) => {
    setPlacedSymbols((prev) => prev.filter((s) => s.id !== id));
  };

  // Render placed symbol SVG
  const renderSymbol = (symbol: PlacedSymbol) => {
    let cx: number, cy: number, rotation: number;

    switch (symbol.wall) {
      case "top":
        cx = 24 + (symbol.position / 100) * 232;
        cy = 36;
        rotation = 0;
        break;
      case "bottom":
        cx = 24 + (symbol.position / 100) * 232;
        cy = 244;
        rotation = 180;
        break;
      case "left":
        cx = 36;
        cy = 24 + (symbol.position / 100) * 232;
        rotation = 90;
        break;
      case "right":
        cx = 244;
        cy = 24 + (symbol.position / 100) * 232;
        rotation = -90;
        break;
    }

    const isHovered = hoveredSymbolId === symbol.id;

    return (
      <g
        key={symbol.id}
        transform={`translate(${cx}, ${cy}) rotate(${rotation})`}
        style={{
          cursor: "pointer",
          filter: isHovered
            ? "drop-shadow(0 0 4px rgba(201,168,76,0.8))"
            : "none",
          transition: "filter 150ms ease",
        }}
        onMouseEnter={() => setHoveredSymbolId(symbol.id)}
        onMouseLeave={() => setHoveredSymbolId(null)}
      >
        {symbol.type === "window" ? (
          <>
            <rect
              x="-14"
              y="-10"
              width="28"
              height="20"
              fill={colors.surface}
              stroke={colors.gold}
              strokeWidth="1.5"
              rx="2"
            />
            <line
              x1="0"
              y1="-10"
              x2="0"
              y2="10"
              stroke={colors.gold}
              strokeWidth="1"
            />
            <line
              x1="-14"
              y1="0"
              x2="14"
              y2="0"
              stroke={colors.gold}
              strokeWidth="1"
            />
          </>
        ) : (
          <>
            <rect
              x="-10"
              y="-10"
              width="20"
              height="20"
              fill={colors.surface}
              stroke={colors.gold}
              strokeWidth="1.5"
              rx="2"
            />
            <path
              d="M -10 10 Q 10 10 10 -10"
              fill="none"
              stroke={colors.gold}
              strokeWidth="1"
              strokeDasharray="2 2"
            />
          </>
        )}
        {/* Remove button - visible on hover */}
        {isHovered && (
          <g
            transform="translate(10, -14)"
            onClick={(e) => {
              e.stopPropagation();
              removeSymbol(symbol.id);
            }}
            style={{ cursor: "pointer" }}
          >
            <circle r="6" fill={colors.remove} />
            <line
              x1="-2.5"
              y1="-2.5"
              x2="2.5"
              y2="2.5"
              stroke="white"
              strokeWidth="1.5"
            />
            <line
              x1="2.5"
              y1="-2.5"
              x2="-2.5"
              y2="2.5"
              stroke="white"
              strokeWidth="1.5"
            />
          </g>
        )}
      </g>
    );
  };

  // Generate summary text
  const getSummary = () => {
    if (placedSymbols.length === 0) {
      return "Tap and drag windows or doors onto your room";
    }

    const wallLabels: Record<string, string> = {
      top: "Back wall",
      bottom: "Front wall",
      left: "Left wall",
      right: "Right wall",
    };

    const summary: Record<string, { windows: number; doors: number }> = {};

    placedSymbols.forEach((s) => {
      if (!summary[s.wall]) summary[s.wall] = { windows: 0, doors: 0 };
      if (s.type === "window") summary[s.wall].windows++;
      else summary[s.wall].doors++;
    });

    return Object.entries(summary)
      .map(([wall, counts]) => {
        const parts: string[] = [];
        if (counts.windows > 0)
          parts.push(`${counts.windows} window${counts.windows > 1 ? "s" : ""}`);
        if (counts.doors > 0)
          parts.push(`${counts.doors} door${counts.doors > 1 ? "s" : ""}`);
        return `${wallLabels[wall]}: ${parts.join(", ")}`;
      })
      .join(" · ");
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Symbol palette */}
      <div
        className="flex items-center justify-center gap-4"
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Window symbol */}
        <div
          draggable
          onDragStart={(e) => handleDragStart(e, "window")}
          onDragEnd={handleDragEnd}
          onTouchStart={(e) => handleTouchStart(e, "window")}
          className="flex flex-col items-center gap-2 cursor-grab active:cursor-grabbing transition-all duration-150"
          style={{
            background: colors.surface2,
            border: `1px solid rgba(201,168,76,0.3)`,
            borderRadius: 8,
            padding: "10px 16px",
            opacity: draggedType === "window" || touchDragType === "window" ? 0.7 : 1,
            transform:
              draggedType === "window" || touchDragType === "window"
                ? "scale(0.95)"
                : "scale(1)",
          }}
        >
          <svg width="32" height="24" viewBox="0 0 32 24">
            <rect
              x="2"
              y="2"
              width="28"
              height="20"
              fill="none"
              stroke={colors.gold}
              strokeWidth="1.5"
              rx="2"
            />
            <line
              x1="9"
              y1="2"
              x2="9"
              y2="22"
              stroke={colors.gold}
              strokeWidth="1"
            />
            <line
              x1="16"
              y1="2"
              x2="16"
              y2="22"
              stroke={colors.gold}
              strokeWidth="1"
            />
            <line
              x1="23"
              y1="2"
              x2="23"
              y2="22"
              stroke={colors.gold}
              strokeWidth="1"
            />
          </svg>
          <span style={{ color: colors.muted, fontSize: 11 }}>Window</span>
        </div>

        {/* Door symbol */}
        <div
          draggable
          onDragStart={(e) => handleDragStart(e, "door")}
          onDragEnd={handleDragEnd}
          onTouchStart={(e) => handleTouchStart(e, "door")}
          className="flex flex-col items-center gap-2 cursor-grab active:cursor-grabbing transition-all duration-150"
          style={{
            background: colors.surface2,
            border: `1px solid rgba(201,168,76,0.3)`,
            borderRadius: 8,
            padding: "10px 16px",
            opacity: draggedType === "door" || touchDragType === "door" ? 0.7 : 1,
            transform:
              draggedType === "door" || touchDragType === "door"
                ? "scale(0.95)"
                : "scale(1)",
          }}
        >
          <svg width="32" height="24" viewBox="0 0 32 24">
            <rect
              x="6"
              y="2"
              width="16"
              height="20"
              fill="none"
              stroke={colors.gold}
              strokeWidth="1.5"
              rx="2"
            />
            <path
              d="M 6 22 Q 6 6 22 2"
              fill="none"
              stroke={colors.gold}
              strokeWidth="1"
              strokeDasharray="2 2"
            />
          </svg>
          <span style={{ color: colors.muted, fontSize: 11 }}>Door</span>
        </div>
      </div>

      {/* Back label */}
      <span style={{ color: colors.muted, fontSize: 11 }}>Back</span>

      <div className="relative flex items-center gap-4">
        {/* Left label */}
        <span
          style={{
            color: colors.muted,
            fontSize: 11,
            writingMode: "vertical-rl",
            transform: "rotate(180deg)",
          }}
        >
          Left
        </span>

        {/* Room SVG */}
        <svg
          ref={svgRef}
          width="280"
          height="280"
          viewBox="0 0 280 280"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onDragLeave={() => setHoveredWall(null)}
        >
          {/* Room background */}
          <rect
            x="24"
            y="24"
            width="232"
            height="232"
            rx="4"
            fill={colors.surface2}
            stroke={colors.goldBorderMed}
            strokeWidth="2"
            style={{ filter: "drop-shadow(0 4px 24px rgba(0,0,0,0.4))" }}
          />

          {/* Wall drop zones with highlight */}
          {/* Top wall zone */}
          <rect
            x="24"
            y="24"
            width="232"
            height="24"
            rx="4"
            fill={
              hoveredWall === "top"
                ? "rgba(201,168,76,0.15)"
                : "rgba(201,168,76,0.05)"
            }
            style={{ transition: "fill 150ms ease" }}
          />
          {hoveredWall === "top" && (
            <line
              x1="24"
              y1="24"
              x2="256"
              y2="24"
              stroke="rgba(201,168,76,0.6)"
              strokeWidth="2"
            />
          )}

          {/* Bottom wall zone */}
          <rect
            x="24"
            y="232"
            width="232"
            height="24"
            rx="4"
            fill={
              hoveredWall === "bottom"
                ? "rgba(201,168,76,0.15)"
                : "rgba(201,168,76,0.05)"
            }
            style={{ transition: "fill 150ms ease" }}
          />
          {hoveredWall === "bottom" && (
            <line
              x1="24"
              y1="256"
              x2="256"
              y2="256"
              stroke="rgba(201,168,76,0.6)"
              strokeWidth="2"
            />
          )}

          {/* Left wall zone */}
          <rect
            x="24"
            y="24"
            width="24"
            height="232"
            rx="4"
            fill={
              hoveredWall === "left"
                ? "rgba(201,168,76,0.15)"
                : "rgba(201,168,76,0.05)"
            }
            style={{ transition: "fill 150ms ease" }}
          />
          {hoveredWall === "left" && (
            <line
              x1="24"
              y1="24"
              x2="24"
              y2="256"
              stroke="rgba(201,168,76,0.6)"
              strokeWidth="2"
            />
          )}

          {/* Right wall zone */}
          <rect
            x="232"
            y="24"
            width="24"
            height="232"
            rx="4"
            fill={
              hoveredWall === "right"
                ? "rgba(201,168,76,0.15)"
                : "rgba(201,168,76,0.05)"
            }
            style={{ transition: "fill 150ms ease" }}
          />
          {hoveredWall === "right" && (
            <line
              x1="256"
              y1="24"
              x2="256"
              y2="256"
              stroke="rgba(201,168,76,0.6)"
              strokeWidth="2"
            />
          )}

          {/* Center compass dot */}
          <circle cx="140" cy="140" r="3" fill={colors.gold} />

          {/* Room label */}
          <text
            x="140"
            y="160"
            textAnchor="middle"
            fill={colors.mutedDark}
            fontSize="10"
            fontFamily="Inter, sans-serif"
          >
            Room
          </text>

          {/* Render placed symbols */}
          {placedSymbols.map(renderSymbol)}
        </svg>

        {/* Right label */}
        <span
          style={{
            color: colors.muted,
            fontSize: 11,
            writingMode: "vertical-rl",
          }}
        >
          Right
        </span>
      </div>

      {/* Front label */}
      <span style={{ color: colors.muted, fontSize: 11 }}>Front</span>

      {/* Summary text */}
      <p
        className="text-center mt-2"
        style={{
          color: placedSymbols.length === 0 ? colors.mutedDark : colors.muted,
          fontSize: 12,
        }}
      >
        {getSummary()}
      </p>

      {/* Touch ghost element */}
      {touchGhostPos && touchDragType && (
        <div
          className="fixed pointer-events-none z-50"
          style={{
            left: touchGhostPos.x - 20,
            top: touchGhostPos.y - 15,
            opacity: 0.8,
          }}
        >
          <svg width="40" height="30" viewBox="0 0 40 30">
            {touchDragType === "window" ? (
              <>
                <rect
                  x="2"
                  y="2"
                  width="36"
                  height="26"
                  fill={colors.surface}
                  stroke={colors.gold}
                  strokeWidth="2"
                  rx="2"
                />
                <line
                  x1="14"
                  y1="2"
                  x2="14"
                  y2="28"
                  stroke={colors.gold}
                  strokeWidth="1"
                />
                <line
                  x1="26"
                  y1="2"
                  x2="26"
                  y2="28"
                  stroke={colors.gold}
                  strokeWidth="1"
                />
              </>
            ) : (
              <>
                <rect
                  x="6"
                  y="2"
                  width="28"
                  height="26"
                  fill={colors.surface}
                  stroke={colors.gold}
                  strokeWidth="2"
                  rx="2"
                />
                <path
                  d="M 6 28 Q 6 6 34 2"
                  fill="none"
                  stroke={colors.gold}
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                />
              </>
            )}
          </svg>
        </div>
      )}
    </div>
  );
}

export default function Step4Page() {
  const router = useRouter();
  const {
    setRoomDimensions,
    setWallLayout,
    setFixedElements,
    setSurfaces,
    setCloset,
    setConstraints: saveConstraints,
    setInclusions,
  } = useFingerprintStore();
  const { setStep } = useSessionStore();

  const [mounted, setMounted] = useState(false);
  const [showWarning, setShowWarning] = useState(false);

  // Form state
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [ceilingHeight, setCeilingHeight] = useState("");
  const [naturalLight, setNaturalLight] = useState("");
  const [placedSymbols, setPlacedSymbols] = useState<PlacedSymbol[]>([]);
  const [selectedFixed, setSelectedFixed] = useState<string[]>([]);
  const [floorType, setFloorType] = useState("");
  const [wallFinish, setWallFinish] = useState("");
  const [hasCloset, setHasCloset] = useState(false);
  const [closetWall, setClosetWall] = useState<string | null>(null);
  const [constraints, setConstraints] = useState("");
  const [selectedMustHaves, setSelectedMustHaves] = useState<string[]>([]);
  const [customInclusion, setCustomInclusion] = useState("");
  const [customItems, setCustomItems] = useState<string[]>([]);
  const [pulsedChip, setPulsedChip] = useState<string | null>(null);
  const [measurementSource, setMeasurementSource] = useState<'shortcut' | null>(null);
  const [deviceType, setDeviceType] = useState<'ios' | 'android' | 'desktop'>('desktop');
  const [showWebXR, setShowWebXR] = useState(false);
  const [webXRSupported, setWebXRSupported] = useState(false);

  // Pre-fill from Siri Shortcut URL params on mount (window.location avoids Suspense requirement)
  useEffect(() => {
    const params = parseMeasurementParams(new URLSearchParams(window.location.search));
    if (params.source === 'shortcut') {
      if (params.length) setLength(String(params.length));
      if (params.width) setWidth(String(params.width));
      if (params.ceiling) setCeilingHeight(String(params.ceiling));
      setMeasurementSource('shortcut');
    }
  }, []);

  // Detect device type client-side
  useEffect(() => {
    if (isIOS()) setDeviceType('ios');
    else if (isAndroid()) setDeviceType('android');
    else setDeviceType('desktop');
  }, []);

  // Check WebXR support on Android
  useEffect(() => {
    import('@/lib/measureBridge').then(({ supportsWebXRMeasurement }) => {
      void supportsWebXRMeasurement().then(setWebXRSupported);
    });
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  const sqft = length && width ? parseInt(length) * parseInt(width) : null;
  const sizeLabel = sqft
    ? sqft < 150
      ? "Small"
      : sqft <= 300
        ? "Medium"
        : "Large"
    : null;

  const toggleFixed = (label: string) => {
    setSelectedFixed((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    );
  };

  const toggleMustHave = (label: string) => {
    setSelectedMustHaves((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    );
  };

  const handleStarterChip = (chip: string) => {
    setPulsedChip(chip);
    setTimeout(() => setPulsedChip(null), 300);
    setConstraints((prev) => (prev ? `${prev}, ${chip}` : chip));
  };

  const addCustomItem = () => {
    if (customInclusion.trim()) {
      setCustomItems((prev) => [...prev, customInclusion.trim()]);
      setSelectedMustHaves((prev) => [...prev, customInclusion.trim()]);
      setCustomInclusion("");
    }
  };

  const removeCustomItem = (item: string) => {
    setCustomItems((prev) => prev.filter((i) => i !== item));
    setSelectedMustHaves((prev) => prev.filter((i) => i !== item));
  };

  const navigateForward = () => {
    // 1. Save dimensions
    setRoomDimensions({
      length: length ? parseFloat(length) : null,
      width: width ? parseFloat(width) : null,
      ceilingHeight: ceilingHeight ? parseFloat(ceilingHeight) : null,
      naturalLight: naturalLight || null,
    });

    // 2. Save wall layout
    const wallLayoutData: WallLayout = {
      top: [], bottom: [], left: [], right: [],
    };
    placedSymbols.forEach((s) => {
      wallLayoutData[s.wall].push({ type: s.type, position: s.position });
    });
    setWallLayout(wallLayoutData);

    // 3. Save fixed elements
    setFixedElements(selectedFixed);

    // 4. Save surfaces
    setSurfaces(floorType, wallFinish);

    // 5. Save closet
    setCloset(hasCloset, closetWall);

    // 6. Parse and save constraints — fire and forget
    if (constraints.trim()) {
      fetch("/api/parse-constraints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: constraints }),
      })
        .then((r) => r.json())
        .then((data: { constraints: string[]; inclusions: string[] }) => {
          saveConstraints(data.constraints ?? []);
        })
        .catch(() => {
          // Silently fail — raw text stored in local state
        });
    }

    // 7. Save inclusions
    const allInclusions = [...selectedMustHaves, ...customItems];
    setInclusions(allInclusions);

    // 8. Navigate to step 6
    setStep(6);
    router.push("/design/step-6");
  };

  const handleContinue = () => {
    const hasDimensions = length && width;
    if (!hasDimensions) {
      setShowWarning(true);
      setTimeout(() => setShowWarning(false), 4000);
      setTimeout(() => navigateForward(), 1000);
      return;
    }
    navigateForward();
  };

  if (!mounted) return null;

  if (showWebXR) {
    return (
      <RoomMeasure
        onMeasurementComplete={(measuredLength, measuredWidth) => {
          setLength(String(measuredLength));
          setWidth(String(measuredWidth));
          setShowWebXR(false);
          setMeasurementSource('shortcut'); // reuse shortcut confirmation UI
        }}
        onCancel={() => setShowWebXR(false)}
      />
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: colors.navy }}
    >
      <StepIndicator currentStep={5} totalSteps={10} />

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto pb-40">
        <div className="max-w-2xl mx-auto px-6 py-8">
          {/* Header */}
          <div
            className="mb-8"
            style={{
              animation: mounted ? "sectionIn 400ms ease forwards" : undefined,
              opacity: 0,
            }}
          >
            <h1
              className="font-serif mb-3"
              style={{
                color: colors.ivory,
                fontSize: 36,
                letterSpacing: "0.02em",
              }}
            >
              Tell us about your space
            </h1>
            <p style={{ color: colors.muted, fontSize: 14 }}>
              The more detail you share, the more accurate your render.
            </p>
          </div>

          {/* Section 1: Room Dimensions */}
          <section
            style={{
              animation: mounted
                ? "sectionIn 400ms ease 80ms forwards"
                : undefined,
              opacity: 0,
            }}
          >
            {/* Section label with tooltip */}
            <div className="flex items-center justify-between mb-4">
              <span
                className="uppercase tracking-widest"
                style={{ color: colors.gold, fontSize: 11 }}
              >
                Room dimensions
              </span>
              <div className="relative group">
                <span
                  className="cursor-help"
                  style={{ color: colors.gold, fontSize: 14 }}
                >
                  *
                </span>
                <div
                  className="absolute right-0 top-6 w-64 p-3 rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-30"
                  style={{
                    background: colors.surface,
                    border: `1px solid ${colors.gold}`,
                  }}
                >
                  <p
                    style={{ color: colors.ivory, fontSize: 12, lineHeight: 1.5 }}
                  >
                    Highly recommended — without dimensions we cannot guarantee
                    furniture will be correctly scaled or products accurately
                    sized for your space.
                  </p>
                  <div
                    className="absolute -top-2 right-3 w-3 h-3 rotate-45"
                    style={{
                      background: colors.surface,
                      borderLeft: `1px solid ${colors.gold}`,
                      borderTop: `1px solid ${colors.gold}`,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Measurement helper */}
            <div
              style={{
                marginBottom: '16px',
                padding: '12px 16px',
                borderRadius: '12px',
                background: colors.surface2,
                border: `1px solid ${colors.goldBorder}`,
              }}
            >
              {measurementSource === 'shortcut' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: '#4A9B7F', fontSize: '14px' }}>✓</span>
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px', color: colors.ivory }}>
                    Dimensions imported from Apple Measure
                  </span>
                </div>
              )}

              {deviceType === 'ios' && measurementSource !== 'shortcut' && (
                <>
                  <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px', color: colors.ivory, marginBottom: '8px' }}>
                    Get exact measurements with Apple Measure
                  </p>
                  <a
                    href="https://www.icloud.com/shortcuts/placeholder"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-block',
                      padding: '8px 16px',
                      borderRadius: '8px',
                      background: colors.gold,
                      color: colors.navy,
                      fontFamily: 'Inter, sans-serif',
                      fontSize: '13px',
                      fontWeight: 500,
                      textDecoration: 'none',
                    }}
                  >
                    Get Measure Shortcut
                  </a>
                </>
              )}

              {deviceType === 'android' && measurementSource !== 'shortcut' && (
                <>
                  {webXRSupported ? (
                    <button
                      onClick={() => setShowWebXR(true)}
                      style={{
                        display: 'inline-block',
                        padding: '8px 16px',
                        borderRadius: '8px',
                        background: colors.gold,
                        color: colors.navy,
                        fontFamily: 'Inter, sans-serif',
                        fontSize: '13px',
                        fontWeight: 500,
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      Measure with Camera
                    </button>
                  ) : (
                    <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px', color: colors.muted }}>
                      💡 Use Google Measure app or a tape measure for accurate dimensions
                    </p>
                  )}
                </>
              )}

              {deviceType === 'desktop' && measurementSource !== 'shortcut' && (
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px', color: colors.muted }}>
                  💡 Tip: Use the Apple Measure app on your iPhone to get exact dimensions
                </p>
              )}
            </div>

            {/* 2x2 grid */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <NumberInput
                label="Length"
                value={length}
                onChange={setLength}
                placeholder="e.g. 15"
              />
              <NumberInput
                label="Width"
                value={width}
                onChange={setWidth}
                placeholder="e.g. 12"
              />
              <NumberInput
                label="Ceiling height"
                value={ceilingHeight}
                onChange={setCeilingHeight}
                placeholder="8"
                hint="Standard is 8–9 ft"
              />
              <CustomDropdown
                label="Natural light"
                value={naturalLight}
                onChange={setNaturalLight}
                options={naturalLightOptions}
                placeholder="Select..."
              />
            </div>

            {/* Sqft calculator */}
            {sqft && (
              <div
                className="text-center py-3"
                style={{
                  color: colors.gold,
                  fontSize: 13,
                  animation: "fadeIn 200ms ease",
                }}
              >
                ≈ {sqft} sqft · {sizeLabel} room
              </div>
            )}

            {/* Wall layout */}
            <div className="mt-6">
              <span
                className="uppercase tracking-widest block mb-1"
                style={{ color: colors.gold, fontSize: 11 }}
              >
                Wall layout
              </span>
              <p className="mb-4" style={{ color: colors.muted, fontSize: 12 }}>
                Drag windows and doors onto your room layout
              </p>
              <WallSchematic
                placedSymbols={placedSymbols}
                setPlacedSymbols={setPlacedSymbols}
              />
            </div>

            {/* Fixed elements */}
            <div className="mt-6">
              <span
                className="uppercase tracking-widest block mb-1"
                style={{ color: colors.gold, fontSize: 11 }}
              >
                Fixed elements
              </span>
              <p className="mb-3" style={{ color: colors.muted, fontSize: 12 }}>
                What&apos;s already there that can&apos;t move?
              </p>
              <div className="flex gap-2 overflow-x-auto pb-2 -mx-6 px-6 scrollbar-hide">
                {fixedElements.map((el) => {
                  const selected = selectedFixed.includes(el.label);
                  return (
                    <button
                      key={el.label}
                      type="button"
                      onClick={() => toggleFixed(el.label)}
                      className="flex items-center gap-2 px-3 py-2 rounded-full whitespace-nowrap transition-all duration-200 shrink-0"
                      style={{
                        background: selected
                          ? "rgba(201,168,76,0.15)"
                          : colors.surface2,
                        border: `1px solid ${selected ? colors.gold : colors.goldBorder}`,
                        color: selected ? colors.ivory : colors.muted,
                      }}
                    >
                      {selected && (
                        <Check size={14} style={{ color: colors.gold }} />
                      )}
                      <span>{el.emoji}</span>
                      <span style={{ fontSize: 13 }}>{el.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Surfaces */}
            <div className="mt-6">
              <span
                className="uppercase tracking-widest block mb-3"
                style={{ color: colors.gold, fontSize: 11 }}
              >
                Existing surfaces
              </span>
              <div className="grid grid-cols-2 gap-3">
                <CustomDropdown
                  label="Floor"
                  value={floorType}
                  onChange={setFloorType}
                  options={floorOptions}
                  placeholder="Select..."
                />
                <CustomDropdown
                  label="Walls"
                  value={wallFinish}
                  onChange={setWallFinish}
                  options={wallFinishOptions}
                  placeholder="Select..."
                />
              </div>
            </div>

            {/* Closet */}
            <div className="mt-6">
              <span
                className="uppercase tracking-widest block mb-3"
                style={{ color: colors.gold, fontSize: 11 }}
              >
                Closet
              </span>
              <div className="flex items-center justify-between">
                <span style={{ color: colors.ivory, fontSize: 14 }}>
                  Does this room have a closet?
                </span>
                <button
                  type="button"
                  onClick={() => setHasCloset(!hasCloset)}
                  className="relative w-12 h-6 rounded-full transition-all duration-250"
                  style={{
                    background: hasCloset ? colors.gold : colors.surface2,
                  }}
                >
                  <div
                    className="absolute top-1 w-4 h-4 rounded-full transition-all duration-250"
                    style={{
                      background: hasCloset ? colors.navy : colors.mutedDark,
                      left: hasCloset ? 28 : 4,
                    }}
                  />
                </button>
              </div>
              <div
                className="overflow-hidden transition-all duration-200"
                style={{
                  maxHeight: hasCloset ? 80 : 0,
                  opacity: hasCloset ? 1 : 0,
                }}
              >
                <p
                  className="mt-3 mb-2"
                  style={{ color: colors.muted, fontSize: 12 }}
                >
                  Which wall?
                </p>
                <div className="flex gap-2">
                  {["Front", "Back", "Left", "Right"].map((wall) => (
                    <button
                      key={wall}
                      type="button"
                      onClick={() => setClosetWall(wall)}
                      className="px-4 py-2 rounded-lg transition-all duration-200"
                      style={{
                        background:
                          closetWall === wall ? colors.gold : "transparent",
                        border: `1px solid ${colors.gold}`,
                        color: closetWall === wall ? colors.navy : colors.gold,
                        fontSize: 13,
                      }}
                    >
                      {wall}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Divider */}
          <div
            className="my-8"
            style={{ height: 1, background: colors.goldBorderLight }}
          />

          {/* Section 2: Constraints */}
          <section
            style={{
              animation: mounted
                ? "sectionIn 400ms ease 160ms forwards"
                : undefined,
              opacity: 0,
            }}
          >
            <span
              className="uppercase tracking-widest block mb-1"
              style={{ color: colors.gold, fontSize: 11 }}
            >
              Anything we should know?
            </span>
            <p className="mb-4" style={{ color: colors.muted, fontSize: 12 }}>
              Rental rules, lifestyle, budget limits...
            </p>

            {/* Starter chips */}
            <div className="flex gap-2 overflow-x-auto pb-3 -mx-6 px-6 scrollbar-hide">
              {starterChips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => handleStarterChip(chip)}
                  className="px-3 py-1.5 rounded-full whitespace-nowrap transition-all duration-200 shrink-0"
                  style={{
                    background: colors.surface2,
                    border: `1px solid ${colors.goldBorderMed}`,
                    color: colors.gold,
                    fontSize: 10,
                    transform: pulsedChip === chip ? "scale(1.05)" : "scale(1)",
                    boxShadow:
                      pulsedChip === chip ? `0 0 12px ${colors.gold}` : "none",
                  }}
                >
                  {chip}
                </button>
              ))}
            </div>

            {/* Text area */}
            <textarea
              value={constraints}
              onChange={(e) => setConstraints(e.target.value)}
              placeholder="Anything else about your space or situation..."
              className="w-full resize-none outline-none transition-all duration-200"
              style={{
                background: colors.surface2,
                border: `1px solid ${colors.goldBorder}`,
                borderRadius: 12,
                padding: "14px 16px",
                color: colors.ivory,
                fontSize: 15,
                minHeight: 80,
              }}
              onFocus={(e) =>
                (e.target.style.borderColor = colors.goldBorderFocus)
              }
              onBlur={(e) => (e.target.style.borderColor = colors.goldBorder)}
            />
          </section>

          {/* Divider */}
          <div
            className="my-8"
            style={{ height: 1, background: colors.goldBorderLight }}
          />

          {/* Section 3: Must-haves */}
          <section
            style={{
              animation: mounted
                ? "sectionIn 400ms ease 240ms forwards"
                : undefined,
              opacity: 0,
            }}
          >
            <span
              className="uppercase tracking-widest block mb-1"
              style={{ color: colors.gold, fontSize: 11 }}
            >
              Must-haves
            </span>
            <p className="mb-4" style={{ color: colors.muted, fontSize: 12 }}>
              Items that must appear in your design
            </p>

            {/* Chip grid */}
            <div className="flex flex-wrap gap-2 mb-4">
              {mustHaveItems.map((item) => {
                const selected = selectedMustHaves.includes(item.label);
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => toggleMustHave(item.label)}
                    className="flex items-center gap-2 px-3 py-2 rounded-full transition-all duration-200"
                    style={{
                      background: selected
                        ? "rgba(201,168,76,0.15)"
                        : colors.surface2,
                      border: `1px solid ${selected ? colors.gold : colors.goldBorder}`,
                      color: selected ? colors.ivory : colors.muted,
                    }}
                  >
                    {selected && (
                      <Check size={14} style={{ color: colors.gold }} />
                    )}
                    <span>{item.emoji}</span>
                    <span style={{ fontSize: 13 }}>{item.label}</span>
                  </button>
                );
              })}
              {/* Custom items */}
              {customItems.map((item) => (
                <button
                  key={item}
                  type="button"
                  className="flex items-center gap-2 px-3 py-2 rounded-full transition-all duration-200"
                  style={{
                    background: "rgba(201,168,76,0.15)",
                    border: `1px solid ${colors.gold}`,
                    color: colors.ivory,
                    animation: "chipIn 200ms ease",
                  }}
                >
                  <Check size={14} style={{ color: colors.gold }} />
                  <span>💬</span>
                  <span style={{ fontSize: 13 }}>{item}</span>
                  <X
                    size={14}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeCustomItem(item);
                    }}
                    className="ml-1 cursor-pointer hover:opacity-70"
                    style={{ color: colors.muted }}
                  />
                </button>
              ))}
            </div>

            {/* Custom input */}
            <div>
              <p className="mb-2" style={{ color: colors.muted, fontSize: 12 }}>
                Something else?
              </p>
              <div className="relative">
                <input
                  type="text"
                  value={customInclusion}
                  onChange={(e) => setCustomInclusion(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addCustomItem()}
                  placeholder="e.g. standing desk, murphy bed, wine rack..."
                  className="w-full outline-none transition-all duration-200"
                  style={{
                    background: colors.surface2,
                    border: `1px solid ${colors.goldBorder}`,
                    borderRadius: 10,
                    padding: "10px 14px",
                    paddingRight: 70,
                    color: colors.ivory,
                    fontSize: 14,
                  }}
                  onFocus={(e) =>
                    (e.target.style.borderColor = colors.goldBorderFocus)
                  }
                  onBlur={(e) =>
                    (e.target.style.borderColor = colors.goldBorder)
                  }
                />
                <button
                  type="button"
                  onClick={addCustomItem}
                  className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 px-2 py-1 rounded transition-opacity duration-200"
                  style={{
                    color: colors.gold,
                    fontSize: 12,
                    opacity: customInclusion ? 1 : 0.5,
                  }}
                >
                  Add <Plus size={14} />
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Fixed footer */}
      <div
        className="fixed bottom-0 left-0 right-0 px-6 py-4"
        style={{
          background: colors.surface,
          borderTop: `1px solid rgba(201,168,76,0.1)`,
        }}
      >
        <div className="max-w-2xl mx-auto">
          {/* Warning toast */}
          {showWarning && (
            <div
              className="mb-3 px-4 py-3 rounded-lg flex items-center gap-2"
              style={{
                background: colors.warningBg,
                border: `1px solid ${colors.warning}`,
                animation: "slideUp 200ms ease",
              }}
            >
              <span style={{ fontSize: 14 }}>⚠</span>
              <span style={{ color: colors.warning, fontSize: 13 }}>
                Adding room dimensions improves render accuracy significantly
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={handleContinue}
            className="w-full py-4 rounded-xl font-semibold transition-all duration-200 hover:-translate-y-0.5"
            style={{
              background: colors.gold,
              color: colors.navy,
              fontSize: 16,
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = colors.goldHover)
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = colors.gold)
            }
          >
            Continue →
          </button>
          <button
            type="button"
            className="w-full mt-3 py-2 text-center transition-colors duration-200 hover:underline"
            style={{ color: colors.mutedDark, fontSize: 12 }}
            onMouseEnter={(e) => (e.currentTarget.style.color = colors.muted)}
            onMouseLeave={(e) =>
              (e.currentTarget.style.color = colors.mutedDark)
            }
            onClick={() => {
              // Save dimensions
              setRoomDimensions({
                length: length ? parseFloat(length) : null,
                width: width ? parseFloat(width) : null,
                ceilingHeight: ceilingHeight ? parseFloat(ceilingHeight) : null,
                naturalLight: naturalLight || null,
              });
              // Save wall layout from any symbols placed so far
              const skipWallLayout: WallLayout = { top: [], bottom: [], left: [], right: [] };
              placedSymbols.forEach((s) => {
                skipWallLayout[s.wall].push({ type: s.type, position: s.position });
              });
              setWallLayout(skipWallLayout);
              // Save fixed elements, surfaces, closet
              setFixedElements(selectedFixed);
              setSurfaces(floorType, wallFinish);
              setCloset(hasCloset, closetWall);
              // Save any constraints entered as raw comma-split array
              const constraintsArray = constraints.trim()
                ? constraints.split(',').map((c) => c.trim()).filter(Boolean)
                : [];
              saveConstraints(constraintsArray);
              // Save inclusions
              setInclusions([...selectedMustHaves, ...customItems]);
              setStep(6);
              router.push("/design/step-6");
            }}
          >
            Skip for now
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes sectionIn {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes chipIn {
          from {
            transform: scale(0.8);
            opacity: 0;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}

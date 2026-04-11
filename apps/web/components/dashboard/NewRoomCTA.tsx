"use client";

import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";

export function NewRoomCTA() {
  const router = useRouter();

  return (
    <section
      className="mx-6 mt-8 mb-12 rounded-3xl overflow-hidden relative cursor-pointer group"
      style={{
        height: 160,
        background:
          "linear-gradient(135deg, rgba(201,168,76,0.15) 0%, rgba(13,31,60,0.9) 40%, rgba(20,60,80,0.8) 100%)",
        border: "1px solid rgba(201,168,76,0.3)",
        opacity: 0,
        animation: "slideUp 400ms ease-out 1000ms forwards",
        transition: "border-color 400ms ease",
      }}
      onClick={() => router.push("/capture/new")}
      role="button"
      tabIndex={0}
      aria-label="Start designing a new room"
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push("/capture/new");
        }
      }}
    >
      {/* Animated dot-grid pattern */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(201,168,76,0.18) 1px, transparent 1px)",
          backgroundSize: "20px 20px",
          animation: "patternDrift 8s linear infinite",
        }}
      />

      {/* Decorative arch — slow spin, very faint */}
      <svg
        aria-hidden="true"
        width="80"
        height="56"
        viewBox="0 0 32 20"
        fill="none"
        className="absolute right-6 top-6 pointer-events-none"
        style={{
          opacity: 0.12,
          animation: "archSpin 30s linear infinite",
          transformOrigin: "40px 28px",
        }}
      >
        <path
          d="M2 18Q16 2 30 18"
          stroke="var(--cova-gold)"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
      </svg>

      {/* Hover brightening overlay */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100"
        style={{
          background: "rgba(201,168,76,0.04)",
          transition: "opacity 400ms ease",
        }}
      />

      {/* Content */}
      <div className="relative z-10 p-6 flex flex-col justify-center h-full">
        <h2
          className="text-xl text-white leading-tight"
          style={{ fontFamily: "Playfair Display, Georgia, serif" }}
        >
          Design a new{" "}
          <em style={{ fontStyle: "italic", color: "var(--cova-gold)" }}>
            space.
          </em>
        </h2>
        <p
          className="text-xs mt-1"
          style={{
            color: "rgba(255,255,255,0.55)",
            fontFamily: "Inter, sans-serif",
          }}
        >
          Ready when you are.
        </p>
        <button
          className="mt-4 flex items-center gap-2 px-4 rounded-xl text-xs uppercase tracking-wider font-medium w-fit cursor-pointer hover:opacity-90 transition-opacity duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-cova-gold"
          style={{
            height: 44,
            background: "var(--cova-gold)",
            color: "var(--cova-bg)",
            fontFamily: "Inter, sans-serif",
          }}
          onClick={(e) => {
            e.stopPropagation();
            router.push("/capture/new");
          }}
          aria-label="Start designing a new room"
        >
          Start Designing
          <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}

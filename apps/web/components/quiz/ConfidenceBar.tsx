"use client";

interface ConfidenceBarProps {
  confidence: number;
  complete: boolean;
}

export function ConfidenceBar({ confidence, complete }: ConfidenceBarProps) {
  const label = complete
    ? "Style captured \u2713"
    : confidence > 75
      ? "Almost there..."
      : "Learning your style...";

  return (
    <div className="px-5 py-3">
      <div
        className="relative w-full h-2 rounded-full overflow-hidden"
        style={{ background: "#0d1f3c" }}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${Math.min(confidence, 100)}%`,
            background: "#C9A84C",
            transition: "width 400ms ease",
          }}
        />
      </div>
      <p
        className={`mt-2 text-xs font-sans uppercase tracking-[0.15em] ${complete ? "text-[#C9A84C]" : "text-white/50"}`}
      >
        {label}
      </p>
    </div>
  );
}

"use client";

interface Stat {
  value: string;
  label: string;
}

interface StatsRowProps {
  stats: Stat[];
}

export function StatsRow({ stats }: StatsRowProps) {
  return (
    <div
      className="flex gap-4 px-6 mt-6 overflow-x-auto scrollbar-hide"
      role="list"
      aria-label="Design statistics"
    >
      {stats.map((stat, i) => (
        <div
          key={stat.label}
          role="listitem"
          className="flex-shrink-0 rounded-2xl p-4"
          style={{
            minWidth: 120,
            background: "rgba(13,31,60,0.8)",
            border: "1px solid rgba(201,168,76,0.15)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            opacity: 0,
            animation: `slideUp 400ms ease-out ${200 + i * 80}ms forwards`,
          }}
        >
          <p
            className="text-2xl text-white leading-none"
            style={{ fontFamily: "Playfair Display, Georgia, serif" }}
          >
            {stat.value}
          </p>
          <p
            className="mt-2 text-[10px] uppercase tracking-[0.12em] leading-tight"
            style={{
              color: "rgba(201,168,76,0.7)",
              fontFamily: "Inter, sans-serif",
            }}
          >
            {stat.label}
          </p>
        </div>
      ))}
    </div>
  );
}

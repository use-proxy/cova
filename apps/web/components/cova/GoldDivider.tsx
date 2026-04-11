export interface GoldDividerProps {
  label?: string;
  className?: string;
}

export function GoldDivider({ label, className = "" }: GoldDividerProps) {
  if (!label) {
    return (
      <div
        className={className}
        style={{
          height: 1,
          background: "var(--cova-border)",
          width: "100%",
        }}
      />
    );
  }

  return (
    <div
      className={["flex items-center gap-4 w-full", className]
        .filter(Boolean)
        .join(" ")}
    >
      <div style={{ flex: 1, height: 1, background: "var(--cova-border)" }} />
      <span
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "var(--text-xs)",
          letterSpacing: "0.12em",
          color: "var(--cova-muted)",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: "var(--cova-border)" }} />
    </div>
  );
}

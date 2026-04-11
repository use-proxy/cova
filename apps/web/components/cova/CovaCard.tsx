"use client";

export interface CovaCardProps {
  variant?: "default" | "elevated" | "interactive";
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

const VARIANT_CLASSES: Record<NonNullable<CovaCardProps["variant"]>, string> = {
  default: "bg-cova-surface border border-cova-border rounded-xl p-6",
  elevated:
    "bg-cova-surface border border-cova-border rounded-xl p-6 shadow-[var(--shadow-gold)]",
  interactive:
    "bg-cova-surface border border-cova-border rounded-xl p-6 cursor-pointer transition-all duration-150 hover:border-cova-border-gold hover:bg-cova-surface-3",
};

export function CovaCard({
  variant = "default",
  children,
  className = "",
  onClick,
}: CovaCardProps) {
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") onClick();
            }
          : undefined
      }
      className={[VARIANT_CLASSES[variant], className]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}

"use client";

export interface CovaButtonProps {
  variant?: "primary" | "ghost" | "destructive" | "icon";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
  type?: "button" | "submit" | "reset";
}

const VARIANT_CLASSES: Record<
  NonNullable<CovaButtonProps["variant"]>,
  string
> = {
  primary:
    "bg-cova-gold text-cova-bg font-semibold hover:bg-cova-gold-light active:scale-[0.98]",
  ghost:
    "bg-transparent border border-cova-border-gold text-cova-ivory hover:bg-cova-surface-3",
  destructive: "bg-cova-error text-cova-ivory hover:opacity-90",
  icon: "bg-transparent aspect-square",
};

const SIZE_CLASSES: Record<NonNullable<CovaButtonProps["size"]>, string> = {
  sm: "px-3 py-1.5 text-sm rounded-md",
  md: "px-5 py-2.5 text-base rounded-lg",
  lg: "px-7 py-3.5 text-lg rounded-xl",
};

const ICON_SIZE_CLASSES: Record<
  NonNullable<CovaButtonProps["size"]>,
  string
> = {
  sm: "p-1.5 text-sm rounded-md",
  md: "p-2.5 text-base rounded-lg",
  lg: "p-3.5 text-lg rounded-xl",
};

const SPINNER_SIZE: Record<NonNullable<CovaButtonProps["size"]>, string> = {
  sm: "w-3.5 h-3.5",
  md: "w-4 h-4",
  lg: "w-5 h-5",
};

export function CovaButton({
  variant = "primary",
  size = "md",
  isLoading = false,
  disabled = false,
  onClick,
  children,
  className = "",
  type = "button",
}: CovaButtonProps) {
  const isDisabled = disabled || isLoading;

  return (
    <button
      type={type}
      disabled={isDisabled}
      onClick={onClick}
      className={[
        "inline-flex items-center justify-center gap-2 font-sans transition-all duration-150 outline-none",
        VARIANT_CLASSES[variant],
        variant === "icon" ? ICON_SIZE_CLASSES[size] : SIZE_CLASSES[size],
        isDisabled ? "opacity-40 cursor-not-allowed pointer-events-none" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {isLoading ? (
        <span
          className={[
            "animate-spin border-2 border-current border-t-transparent rounded-full",
            SPINNER_SIZE[size],
          ].join(" ")}
        />
      ) : (
        children
      )}
    </button>
  );
}

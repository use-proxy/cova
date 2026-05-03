"use client";

// P01b — Toast / TopBanner. Used from this phase forward across the app.
// Spec: phase doc §6 1B.
// - Full-width banner inside the form column (NOT viewport-wide).
// - Mount: 4px slide-down from top + opacity fade.
// - Background #A8443B at 8%/12% opacity. Text: italic serif, ivory.
// - Auto-dismiss after 5s. Manual dismiss via close-X.
// - Reduced-motion: instant render, no slide.
// - ARIA: role="alert", aria-live="polite".

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

interface ToastProps {
  message: string;
  onDismiss: () => void;
  /** Auto-dismiss after Nms. Default 5000. Pass 0 to disable. */
  autoDismissMs?: number;
}

export function Toast({ message, onDismiss, autoDismissMs = 5000 }: ToastProps) {
  const reducedMotion = useRef<boolean>(false);
  const [shown, setShown] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      reducedMotion.current = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
    }
    if (reducedMotion.current) {
      setShown(true);
      return;
    }
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (autoDismissMs <= 0) return;
    const t = setTimeout(onDismiss, autoDismissMs);
    return () => clearTimeout(t);
  }, [autoDismissMs, onDismiss]);

  return (
    <div
      role="alert"
      aria-live="polite"
      className={[
        "mb-6",
        "flex items-start justify-between gap-3",
        "p-3",
        "bg-cova-warm-error/[0.12]",
        "transition-[opacity,transform] ease-out",
        reducedMotion.current ? "duration-0" : "duration-150",
        shown ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1",
      ].join(" ")}
    >
      <p className="font-serif italic text-[13px] text-cova-warm-error leading-snug">
        {message}
      </p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 text-cova-warm-error/80 hover:text-cova-warm-error transition-colors duration-200 ease-out focus:outline-none uppercase tracking-[0.2em] text-[10px]"
      >
        <X size={14} strokeWidth={1.5} />
      </button>
    </div>
  );
}

export default Toast;

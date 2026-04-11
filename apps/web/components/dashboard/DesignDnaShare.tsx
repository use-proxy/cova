"use client";

import { CovaButton } from "@/components/cova/CovaButton";

interface DesignDnaShareProps {
  styleName: string | null;
}

export function DesignDnaShare({ styleName }: DesignDnaShareProps) {
  async function handleShare() {
    const text = styleName ?? "my design style";
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "My Design DNA", text });
        return;
      } catch {
        // fall through to clipboard
      }
    }
    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(text);
      // Simple feedback via alert since we don't have toast imported here
      alert("Copied to clipboard!");
    } catch {
      // ignore
    }
  }

  return (
    <CovaButton variant="ghost" size="sm" onClick={handleShare}>
      Share my Design DNA
    </CovaButton>
  );
}

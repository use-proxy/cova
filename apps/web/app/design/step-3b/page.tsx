"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { flowLog } from "@/lib/debug/flow-logger";
import { useFingerprintStore } from "@/lib/store/fingerprint";
import {
  fingerprintToStyleBlend,
  type StyleName,
  type DimensionName,
} from "@/lib/quiz/style-archetypes";
import { toCovaKeyDisplayName } from "@/lib/ai/anchor-display";
import type { AnyFingerprint } from "@/types/fingerprint";
import "../step-1/step1.css";
import "./step3b.css";

// ── Display name mapping (COVA* → human readable) ───────────────────────────
const DISPLAY_NAMES: Record<StyleName, string> = {
  COVASCANDINAV: "Scandinavian",
  COVAJAPANDI: "Japandi",
  COVABIOPHILIC: "Biophilic",
  COVAMINIMAL: "Minimalist",
  COVAMIDCENTURY: "Mid-Century",
  COVACOASTAL: "Coastal",
  COVABOHEMIAN: "Bohemian",
  COVAINDUSTRIAL: "Industrial",
  COVAFARMHOUSE: "Farmhouse",
  COVAARTDECO: "Art Deco",
};

type BlendEntry = { style: StyleName; weight: number };

export default function Step3bPage() {
  const router = useRouter();
  useEffect(() => { flowLog("page:mount", { page: "step-3b" }); }, []);
  const fingerprint = useFingerprintStore((s) => s.fingerprint);
  const [mode, setMode] = useState<"confirm" | "adjust">("confirm");
  const [blend, setBlend] = useState<BlendEntry[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auth check
  useEffect(() => {
    const check = async () => {
      const { createBrowserClient } = await import("@/lib/supabase/client");
      const supabase = createBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) router.push("/auth?next=/design/step-3b");
    };
    void check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Compute blend from fingerprint on mount
  useEffect(() => {
    if (!fingerprint) {
      router.push("/design/step-2");
      return;
    }

    // Extract V3 dimensions or try to adapt
    const dims = fingerprint.dimensions;
    // fingerprint_version may be "v3" at runtime even though the store type
    // is StyleFingerprint (v1|v2). This is safe — DB/API can return "v3".
    const isV3 = (fingerprint as AnyFingerprint).fingerprint_version === "v3";

    if (isV3) {
      const v3Dims = dims as unknown as Record<DimensionName, number>;
      const rawBlend = fingerprintToStyleBlend(v3Dims);
      const entries = Object.entries(rawBlend)
        .map(([style, weight]) => ({ style: style as StyleName, weight }))
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 3);
      setBlend(entries);
    } else {
      // V2 fallback — just show top styles from store
      const store = useFingerprintStore.getState();
      if (store.competingStyles.length > 0) {
        // Use competing styles as approximate blend
        const primary = store.competingStyles[0];
        const secondary = store.competingStyles[1];
        const entries: BlendEntry[] = [];
        // Map display names back to StyleNames
        for (const [key, displayName] of Object.entries(DISPLAY_NAMES)) {
          if (displayName === primary) {
            entries.push({ style: key as StyleName, weight: store.blendRatio });
          } else if (displayName === secondary) {
            entries.push({ style: key as StyleName, weight: 1 - store.blendRatio });
          }
        }
        if (entries.length > 0) setBlend(entries);
      }
    }
  }, [fingerprint, router]);

  // Slider adjustment: constrain all sliders to sum to 100%
  const handleSliderChange = useCallback(
    (index: number, newValue: number) => {
      setBlend((prev) => {
        const updated = [...prev];
        const oldValue = updated[index]?.weight ?? 0;
        const diff = newValue - oldValue;
        updated[index] = { ...updated[index]!, weight: newValue };

        // Distribute the diff across other sliders proportionally
        const otherIndices = prev
          .map((_, i) => i)
          .filter((i) => i !== index);
        const otherTotal = otherIndices.reduce(
          (sum, i) => sum + (prev[i]?.weight ?? 0),
          0,
        );

        for (const i of otherIndices) {
          const proportion =
            otherTotal > 0 ? (prev[i]?.weight ?? 0) / otherTotal : 1 / otherIndices.length;
          const newWeight = Math.max(0, (prev[i]?.weight ?? 0) - diff * proportion);
          updated[i] = { ...updated[i]!, weight: newWeight };
        }

        // Renormalize to exactly 1.0
        const total = updated.reduce((sum, e) => sum + e.weight, 0);
        if (total > 0) {
          for (let i = 0; i < updated.length; i++) {
            updated[i] = { ...updated[i]!, weight: updated[i]!.weight / total };
          }
        }

        return updated;
      });
    },
    [],
  );

  const handleConfirm = useCallback(async () => {
    setIsSubmitting(true);
    try {
      // Save style_blend to DB
      const { createBrowserClient } = await import("@/lib/supabase/client");
      const supabase = createBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const styleBlend: Record<string, number> = {};
        for (const entry of blend) {
          styleBlend[DISPLAY_NAMES[entry.style]] = Math.round(entry.weight * 100) / 100;
        }

        await supabase
          .from("users")
          .update({ style_blend: styleBlend })
          .eq("id", user.id);
      }
    } catch (err) {
      console.error("[step-3b] save error:", err);
    }
    router.push("/design/step-4");
  }, [blend, router]);

  if (blend.length === 0) {
    return (
      <main className="cova-page">
        <div className="step3b-loading">
          <p>Computing your style blend...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="cova-page">
      <div className="cova-noise-overlay" />
      <section className="cova-shell">
        <header className="cova-header">
          <button
            type="button"
            className="cova-icon-button"
            aria-label="Go back"
            onClick={() => router.push("/design/step-3")}
          >
            <span aria-hidden="true">&lsaquo;</span>
          </button>
          <div className="cova-header-center">
            <button
              type="button"
              className="cova-wordmark"
              onClick={() => router.push("/")}
              aria-label="Cova home"
            >
              Cova
            </button>
            <div className="cova-progress-rail">
              <div className="cova-progress-fill" style={{ width: "90%" }} />
            </div>
          </div>
          <div className="cova-step-meta">
            <span>Step 2 of 4</span>
            <span>Style confirmation</span>
          </div>
        </header>

        <div className="step3b-content">
          <div className="step3b-header">
            <p className="step3b-eyebrow">Your Style DNA</p>
            <h1 className="step3b-title">
              {mode === "confirm" ? "Here's what we found" : "Fine-tune your blend"}
            </h1>
          </div>

          {/* Style blend bars */}
          <div className="step3b-bars">
            {blend.map((entry, i) => (
              <div key={entry.style} className="step3b-bar-row">
                <div className="step3b-bar-track">
                  <div
                    className="step3b-bar-fill"
                    style={{ width: `${Math.round(entry.weight * 100)}%` }}
                  />
                </div>
                <div className="step3b-bar-label">
                  <span className="step3b-bar-name">
                    {toCovaKeyDisplayName(entry.style)}
                  </span>
                  <span className="step3b-bar-pct">
                    {Math.round(entry.weight * 100)}%
                  </span>
                </div>

                {mode === "adjust" && (
                  <input
                    type="range"
                    className="step3b-slider"
                    min={0}
                    max={100}
                    step={1}
                    value={Math.round(entry.weight * 100)}
                    onChange={(e) =>
                      handleSliderChange(i, Number(e.target.value) / 100)
                    }
                  />
                )}
              </div>
            ))}
          </div>

          {/* Action buttons */}
          <div className="step3b-actions">
            {mode === "confirm" ? (
              <>
                <button
                  type="button"
                  className="step3b-btn step3b-btn--primary"
                  onClick={() => void handleConfirm()}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Saving..." : "This feels right \u2192"}
                </button>
                <button
                  type="button"
                  className="step3b-btn step3b-btn--ghost"
                  onClick={() => setMode("adjust")}
                >
                  \u2190 Adjust
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="step3b-btn step3b-btn--primary"
                  onClick={() => void handleConfirm()}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Saving..." : "Update my style \u2192"}
                </button>
                <button
                  type="button"
                  className="step3b-btn step3b-btn--ghost"
                  onClick={() => setMode("confirm")}
                >
                  \u2190 Back
                </button>
              </>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

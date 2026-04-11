"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useFingerprintStore } from "@/lib/store/fingerprint";
import { toDisplayName } from "@/lib/ai/anchor-display";
import "../step-1/step1.css";
import "./step2.css";

type StyleCard = {
  id: string;
  label: string;
  image: string;
};

export default function CovaStyleSelectionPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [burstCard, setBurstCard] = useState<string | null>(null);
  const [pointer, setPointer] = useState({ x: 50, y: 28 });
  const [styles, setStyles] = useState<StyleCard[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      const { createBrowserClient } = await import("@/lib/supabase/client");
      const supabase = createBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) router.push("/auth?next=/design/step-2");
    };
    checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch the 9 anchors from quiz_anchor_images via /api/quiz/next-card.
  // IDs returned here are the real quiz_anchor_images.id UUIDs — the
  // fingerprint route keys phase_a_selections off these exact IDs.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/quiz/next-card")
      .then(async (res) => {
        if (!res.ok) throw new Error(`next-card ${res.status}`);
        return res.json() as Promise<{
          cards: Array<{ id: string; style_name: string; image_url: string }>;
        }>;
      })
      .then((json) => {
        if (cancelled) return;
        const cards: StyleCard[] = (json.cards ?? []).map((c) => ({
          id: c.id,
          label: toDisplayName(c.style_name),
          image: c.image_url,
        }));
        setStyles(cards);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const progressWidth = useMemo(() => {
    const base = 26;
    const bonus = selected.length * 16;
    return `${Math.min(base + bonus, 58)}%`;
  }, [selected.length]);

  const toggleSelection = (id: string) => {
    setSelected((current) => {
      if (current.includes(id)) {
        return current.filter((item) => item !== id);
      }

      const next = current.length < 2 ? [...current, id] : [current[1], id];

      if (next.length === 2) {
        setBurstCard(id);
        window.setTimeout(
          () => setBurstCard((active) => (active === id ? null : active)),
          650,
        );
      }

      return next;
    });
  };

  const handleContinue = () => {
    if (selected.length === 2) {
      // Sync selections to fingerprint store (cookie-persisted, survives OAuth redirects)
      const fpStore = useFingerprintStore.getState();
      // Clear any previous phase-A selections before adding new ones
      fpStore.phaseASelections.forEach((id) =>
        fpStore.removePhaseASelection(id),
      );
      selected.forEach((id) => fpStore.addPhaseASelection(id));
      router.push("/design/step-3");
    }
  };

  return (
    <main
      className="cova-page"
      onMouseMove={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        const x = ((event.clientX - bounds.left) / bounds.width) * 100;
        const y = ((event.clientY - bounds.top) / bounds.height) * 100;
        setPointer({ x, y });
      }}
    >
      <div className="cova-ambient-layer" />
      <div
        className="cova-pointer-glow"
        style={{
          background: `radial-gradient(circle at ${pointer.x}% ${pointer.y}%, rgba(201,168,76,0.16), rgba(201,168,76,0.06) 22%, rgba(9,24,41,0) 54%)`,
        }}
      />
      <div className="cova-grid-overlay" />
      <div className="cova-noise-overlay" />

      <section className="cova-shell">
        <header className="cova-header">
          <button
            type="button"
            className="cova-icon-button"
            aria-label="Go back"
            onClick={() => router.push("/design/step-1")}
          >
            <span aria-hidden="true">‹</span>
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
              <div
                className="cova-progress-fill"
                style={{ width: progressWidth }}
              />
            </div>
          </div>

          <div className="cova-step-meta">
            <span>Step 1 of 4</span>
            <span>Style quiz phase</span>
          </div>
        </header>

        <section className="cova-hero">
          <p className="cova-eyebrow">Your Style Anchors</p>
          <h1>What draws you in?</h1>
          <p className="cova-subtext">
            Choose 2 spaces that feel like home. We&apos;ll do the rest.
          </p>
        </section>

        {loadError && (
          <p style={{ textAlign: "center", color: "#C0504A", padding: "1rem" }}>
            Failed to load: {loadError}
          </p>
        )}
        {!loadError && styles.length === 0 && (
          <p style={{ textAlign: "center", color: "#8BA3C0", padding: "1rem" }}>
            Loading style anchors…
          </p>
        )}

        <section
          className="cova-grid"
          aria-label="Interior design style selection"
        >
          {styles.map((style, index) => {
            const isSelected = selected.includes(style.id);
            const isBursting = burstCard === style.id;

            return (
              <button
                key={style.id}
                type="button"
                className={`cova-card ${isSelected ? "is-selected" : ""}`}
                onClick={() => toggleSelection(style.id)}
                aria-pressed={isSelected}
                aria-label={style.label}
                style={{ animationDelay: `${index * 60}ms` }}
              >
                <div
                  className="cova-card-image"
                  style={{
                    backgroundImage: `linear-gradient(180deg, rgba(9,24,41,0.1), rgba(9,24,41,0.42)), url(${style.image})`,
                  }}
                />

                <div className="cova-card-shimmer" />

                {isSelected ? (
                  <div className="cova-check" aria-hidden="true">
                    ✦
                  </div>
                ) : null}

                {isBursting ? (
                  <div className="cova-burst" aria-hidden="true">
                    {Array.from({ length: 10 }).map((_, particleIndex) => (
                      <span
                        key={particleIndex}
                        style={{
                          ["--angle" as string]: `${particleIndex * 36}deg`,
                          ["--distance" as string]: `${38 + (particleIndex % 3) * 12}px`,
                        }}
                      />
                    ))}
                  </div>
                ) : null}
              </button>
            );
          })}
        </section>

        <footer className="cova-footer-panel">
          <div className="cova-selection-copy">
            <span className={selected.length === 2 ? "is-complete" : ""}>
              {selected.length} of 2 selected
            </span>
          </div>

          <button
            type="button"
            className={`cova-cta ${selected.length === 2 ? "is-ready" : ""}`}
            disabled={selected.length !== 2}
            onClick={handleContinue}
          >
            See Your Matches →
          </button>
        </footer>
      </section>
    </main>
  );
}

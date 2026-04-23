"use client";

/**
 * Step 7f — Art & Posters
 *
 * Shows 5 art layout options. If user selects A-D, generates poster artwork
 * using FLUX dev matching their style. User picks a poster, then continues.
 *
 * Writes: personalization_context.art = {layout_type, poster_urls[], position}
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { flowLog } from "@/lib/debug/flow-logger";
import { useArea2Store } from "@/lib/stores/area2Store";
import { createBrowserClient } from "@/lib/supabase/client";
import { useRoomStore } from "@/lib/store/room";

// ── Layout options ───────────────────────────────────────────────────────────

interface ArtLayout {
  id: string;
  label: string;
  description: string;
  pieceCount: number;
  arrangement: string;
  icon: string; // ASCII art representation
}

const ART_LAYOUTS: ArtLayout[] = [
  {
    id: "gallery_wall",
    label: "Gallery Wall",
    description: "A curated grid of 6 pieces that tells a story",
    pieceCount: 6,
    arrangement: "grid",
    icon: "[ ][ ][ ]\n[ ][ ][ ]",
  },
  {
    id: "statement_piece",
    label: "Statement Piece",
    description: "One large, bold artwork as the focal point",
    pieceCount: 1,
    arrangement: "single",
    icon: "[        ]\n[        ]\n[        ]",
  },
  {
    id: "triptych",
    label: "Triptych",
    description: "Three pieces in a horizontal row, visually connected",
    pieceCount: 3,
    arrangement: "horizontal",
    icon: "[ ] [ ] [ ]",
  },
  {
    id: "salon_wall",
    label: "Salon Wall",
    description: "An asymmetric mix of sizes for an eclectic, collected feel",
    pieceCount: 5,
    arrangement: "asymmetric",
    icon: "  [ ][  ]\n[  ][ ][ ]",
  },
  {
    id: "no_art",
    label: "No Art",
    description: "Keep the walls clean and minimal",
    pieceCount: 0,
    arrangement: "none",
    icon: "",
  },
];

// ── Persist helper ───────────────────────────────────────────────────────────

async function persistArt(
  roomId: string,
  art: {
    layout_type: string;
    poster_urls: string[];
    selected_poster_url?: string;
    position: string;
  },
) {
  const supabase = createBrowserClient();
  const { data: room } = await supabase
    .from("rooms")
    .select("personalization_context")
    .eq("id", roomId)
    .single();

  const existing =
    (room?.personalization_context as Record<string, unknown>) ?? {};

  await supabase
    .from("rooms")
    .update({
      personalization_context: { ...existing, art },
    })
    .eq("id", roomId);
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Step7fArtPosters() {
  const router = useRouter();
  const [isMounted, setIsMounted] = useState(false);
  const [selectedLayout, setSelectedLayout] = useState<string | null>(null);
  const [generatingArt, setGeneratingArt] = useState(false);
  const [posterOptions, setPosterOptions] = useState<string[]>([]);
  const [selectedPoster, setSelectedPoster] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const roomStoreId = useRoomStore((s) => s.roomId);
  const area2RoomId = useArea2Store((s) => s.roomId);
  const effectiveRoomId = area2RoomId ?? roomStoreId;

  useEffect(() => setIsMounted(true), []);
  useEffect(() => {
    if (!isMounted) return;
    flowLog("page:mount", { page: "step-7f" });
  }, [isMounted]);

  // Get style context for art generation
  const fingerprint = useArea2Store((s) => {
    const ctx = s.roomContext;
    return ctx?.existingStyleFingerprint ?? "warm contemporary interior";
  });

  const handleLayoutSelect = useCallback(
    async (layout: ArtLayout) => {
      if (layout.id === "no_art") {
        // Skip art entirely
        setSaving(true);
        if (effectiveRoomId) {
          await persistArt(effectiveRoomId, {
            layout_type: "none",
            poster_urls: [],
            position: "none",
          }).catch(console.warn);
        }
        router.push("/design/step-7g");
        return;
      }

      setSelectedLayout(layout.id);
      setGeneratingArt(true);
      setPosterOptions([]);
      setSelectedPoster(null);

      // Generate poster artwork using FLUX dev
      try {
        const styleDesc =
          typeof fingerprint === "string" ? fingerprint : "contemporary";
        const prompts = [
          `Fine art print for ${styleDesc} interior, ${layout.arrangement} arrangement, elegant gallery quality, muted tones, abstract composition`,
          `Art poster for ${styleDesc} room, sophisticated wall decor, painterly texture, neutral palette with subtle color accents`,
          `Modern wall art for ${styleDesc} space, gallery-quality print, harmonious colors, balanced composition, professional photography`,
        ];

        const results = await Promise.allSettled(
          prompts.map(async (prompt) => {
            const res = await fetch("/api/fal/proxy", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                target_url: "https://queue.fal.run/fal-ai/flux/dev",
                input: {
                  prompt,
                  image_size: layout.id === "triptych" ? "landscape_16_9" : "portrait_4_3",
                  num_inference_steps: 20,
                  guidance_scale: 3.5,
                },
              }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = (await res.json()) as {
              images?: { url: string }[];
            };
            return data?.images?.[0]?.url ?? null;
          }),
        );

        const urls = results
          .filter(
            (r): r is PromiseFulfilledResult<string | null> =>
              r.status === "fulfilled" && r.value !== null,
          )
          .map((r) => r.value!);

        setPosterOptions(urls);
      } catch (err) {
        console.warn("[step-7f] Art generation failed:", err);
      } finally {
        setGeneratingArt(false);
      }
    },
    [effectiveRoomId, fingerprint, router],
  );

  const handlePosterSelect = (url: string) => {
    setSelectedPoster(url);
  };

  const handleContinue = useCallback(async () => {
    if (!selectedLayout) return;
    setSaving(true);

    if (effectiveRoomId) {
      await persistArt(effectiveRoomId, {
        layout_type: selectedLayout,
        poster_urls: posterOptions,
        selected_poster_url: selectedPoster ?? undefined,
        position: "focal_wall",
      }).catch(console.warn);
    }

    // Also update area2Store art brief
    const layout = ART_LAYOUTS.find((l) => l.id === selectedLayout);
    if (layout) {
      useArea2Store.getState().setArtBrief({
        hasArtDirection: true,
        visualDirection: `${layout.label} arrangement`,
        colorPalette: [],
        mood: "",
        abstractionLevel: "semi-abstract",
        subjectMatter: "",
        frameStyle: "gallery-wrap",
        placement: "focal-wall",
        galleryWall: layout.id === "gallery_wall" || layout.id === "salon_wall",
        chosenArtImageUrl: selectedPoster ?? undefined,
        generatedOptions: posterOptions,
        includesPersonalPhotos: false,
        hasBookCollection: false,
        hasVinylCollection: false,
        copyrightSafe: true,
      });
    }

    router.push("/design/step-7g");
  }, [selectedLayout, effectiveRoomId, posterOptions, selectedPoster, router]);

  const handleSkip = useCallback(() => {
    router.push("/design/step-7g");
  }, [router]);

  if (!isMounted) return null;

  return (
    <div className="min-h-screen bg-[#091829] font-['DM_Sans',system-ui,sans-serif] text-[#F5F0E8] flex flex-col">
      {/* Progress bar */}
      <div className="fixed top-0 left-0 right-0 h-[3px] bg-[rgba(201,168,76,0.15)] z-[60]">
        <div className="h-full w-[76%] bg-[#C9A84C] transition-all duration-[400ms] ease-out" />
      </div>

      {/* Top bar */}
      <nav
        className="sticky top-0 z-50 h-14 flex items-center justify-between px-6"
        style={{
          background: "rgba(9,24,41,0.8)",
          backdropFilter: "blur(20px)",
          borderBottom: "1px solid rgba(201,168,76,0.1)",
        }}
      >
        <button
          type="button"
          onClick={() => router.push("/design/step-7e")}
          className="bg-transparent border-none text-[rgba(245,240,232,0.6)] text-sm cursor-pointer"
        >
          &larr; Back
        </button>
        <span className="font-['Playfair_Display',Georgia,serif] italic text-xl text-[#C9A84C] tracking-[0.05em]">
          Cova
        </span>
        <button
          type="button"
          onClick={handleSkip}
          disabled={saving}
          className="bg-transparent border-none text-[rgba(245,240,232,0.45)] text-sm cursor-pointer"
        >
          Skip
        </button>
      </nav>

      {/* Main content */}
      <div className="flex-1 px-6 py-8 max-w-[640px] mx-auto w-full">
        {!selectedLayout ? (
          // Layout selection
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <h1 className="text-2xl font-semibold mb-2">
              How should art be displayed?
            </h1>
            <p className="text-sm text-[rgba(245,240,232,0.55)] mb-8">
              Choose an arrangement and we&apos;ll generate artwork that matches your
              style.
            </p>

            <div className="flex flex-col gap-3">
              {ART_LAYOUTS.map((layout, i) => (
                <motion.button
                  key={layout.id}
                  type="button"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06, duration: 0.25 }}
                  onClick={() => handleLayoutSelect(layout)}
                  disabled={saving}
                  className="w-full text-left rounded-xl cursor-pointer transition-all duration-200"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(201,168,76,0.15)",
                    padding: "16px 20px",
                  }}
                  onMouseEnter={(e) => {
                    (
                      e.currentTarget as HTMLButtonElement
                    ).style.borderColor = "rgba(201,168,76,0.5)";
                    (
                      e.currentTarget as HTMLButtonElement
                    ).style.background = "rgba(201,168,76,0.08)";
                  }}
                  onMouseLeave={(e) => {
                    (
                      e.currentTarget as HTMLButtonElement
                    ).style.borderColor = "rgba(201,168,76,0.15)";
                    (
                      e.currentTarget as HTMLButtonElement
                    ).style.background = "rgba(255,255,255,0.04)";
                  }}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="font-semibold text-[15px] mb-1">
                        {layout.label}
                      </div>
                      <div className="text-sm text-[rgba(245,240,232,0.5)]">
                        {layout.description}
                      </div>
                    </div>
                    {layout.icon && (
                      <pre
                        className="text-xs text-[#C9A84C] leading-tight whitespace-pre"
                        style={{ fontFamily: "monospace", opacity: 0.6 }}
                      >
                        {layout.icon}
                      </pre>
                    )}
                  </div>
                </motion.button>
              ))}
            </div>
          </motion.div>
        ) : (
          // Poster selection
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <button
              type="button"
              onClick={() => {
                setSelectedLayout(null);
                setPosterOptions([]);
                setSelectedPoster(null);
              }}
              className="bg-transparent border-none text-[rgba(245,240,232,0.5)] text-sm cursor-pointer mb-4"
            >
              &larr; Change layout
            </button>

            <h1 className="text-2xl font-semibold mb-2">
              Pick your artwork
            </h1>
            <p className="text-sm text-[rgba(245,240,232,0.55)] mb-6">
              {ART_LAYOUTS.find((l) => l.id === selectedLayout)?.label} — select
              a piece that resonates with you.
            </p>

            {generatingArt ? (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <div
                  className="w-12 h-12 rounded-full"
                  style={{
                    border: "3px solid rgba(201,168,76,0.25)",
                    borderTopColor: "#C9A84C",
                    animation: "spin 1s linear infinite",
                  }}
                />
                <p className="text-sm text-[rgba(245,240,232,0.6)]">
                  Creating artwork for your style...
                </p>
              </div>
            ) : posterOptions.length > 0 ? (
              <>
                <div className="grid grid-cols-3 gap-3 mb-6">
                  {posterOptions.map((url, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handlePosterSelect(url)}
                      className="bg-transparent p-0 cursor-pointer rounded-xl overflow-hidden"
                      style={{
                        border: `2px solid ${selectedPoster === url ? "#C9A84C" : "rgba(201,168,76,0.15)"}`,
                        transition: "border-color 0.2s ease",
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={`Art option ${i + 1}`}
                        className="w-full aspect-[3/4] object-cover block"
                      />
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleContinue}
                  disabled={saving}
                  className="w-full py-[14px] rounded-lg text-[15px] font-semibold border-none cursor-pointer transition-all duration-200"
                  style={{
                    background: selectedPoster
                      ? "#C9A84C"
                      : "rgba(201,168,76,0.15)",
                    color: selectedPoster
                      ? "#091829"
                      : "rgba(245,240,232,0.45)",
                  }}
                >
                  {selectedPoster
                    ? "Continue with this artwork"
                    : "Continue without selecting"}
                </button>
              </>
            ) : (
              // Generation failed or no results
              <div className="text-center py-12">
                <p className="text-sm text-[rgba(245,240,232,0.5)] mb-4">
                  Art generation is taking longer than expected.
                </p>
                <button
                  type="button"
                  onClick={handleContinue}
                  className="py-3 px-6 rounded-lg text-sm font-semibold border-none cursor-pointer"
                  style={{ background: "#C9A84C", color: "#091829" }}
                >
                  Continue anyway
                </button>
              </div>
            )}
          </motion.div>
        )}
      </div>

      <style jsx global>{`
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}

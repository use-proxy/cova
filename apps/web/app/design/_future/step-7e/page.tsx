"use client";

/**
 * Step 7e — Smart Technology Discovery
 *
 * Conversational flow asking about smart tech (TV, lighting, speakers).
 * On each answer, fires fal-ai FLUX image-to-image for a live preview
 * showing the tech item placed in the room. User can accept or reject.
 *
 * Writes: personalization_context.smart_tech = [{item, accepted, placement_zone}]
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { flowLog } from "@/lib/debug/flow-logger";
import { useArea2Store } from "@/lib/stores/area2Store";
import { createBrowserClient } from "@/lib/supabase/client";
import { useRoomStore } from "@/lib/store/room";

// ── Tech questions ───────────────────────────────────────────────────────────

interface TechQuestion {
  id: string;
  question: string;
  description: string;
  options: { label: string; value: string; item?: string; zone?: string }[];
}

const TECH_QUESTIONS: TechQuestion[] = [
  {
    id: "tv",
    question: "How do you watch TV in this room?",
    description:
      "We can place a TV that blends with your design — or skip it entirely.",
    options: [
      {
        label: "Samsung Frame TV",
        value: "frame_tv",
        item: "Samsung Frame TV displaying fine art",
        zone: "focal_wall",
      },
      {
        label: "Standard wall-mounted TV",
        value: "wall_tv",
        item: '65" wall-mounted flat screen TV',
        zone: "focal_wall",
      },
      {
        label: "Projector setup",
        value: "projector",
        item: "ceiling-mounted projector with retractable screen",
        zone: "ceiling",
      },
      { label: "No TV in this room", value: "none" },
    ],
  },
  {
    id: "lighting",
    question: "What about smart lighting?",
    description: "Smart lights let you set the mood for any time of day.",
    options: [
      {
        label: "Philips Hue color scenes",
        value: "hue",
        item: "Philips Hue smart ambient light strips and smart bulbs",
        zone: "ambient",
      },
      {
        label: "Nanoleaf panels",
        value: "nanoleaf",
        item: "Nanoleaf geometric light panels on accent wall",
        zone: "accent_wall",
      },
      {
        label: "Smart dimmer switches only",
        value: "dimmer",
        item: "smart dimmer switch controls",
        zone: "switches",
      },
      { label: "Standard lighting is fine", value: "none" },
    ],
  },
  {
    id: "audio",
    question: "Any smart speakers or audio?",
    description: "Great sound makes a room feel complete.",
    options: [
      {
        label: "Sonos soundbar + sub",
        value: "sonos",
        item: "Sonos Arc soundbar mounted below TV",
        zone: "below_tv",
      },
      {
        label: "Bookshelf speakers",
        value: "bookshelf",
        item: "KEF LSX II wireless bookshelf speakers",
        zone: "flanking_tv",
      },
      {
        label: "Smart display (Echo Show / Nest)",
        value: "smart_display",
        item: "smart display on side table",
        zone: "side_table",
      },
      { label: "No audio setup", value: "none" },
    ],
  },
];

// ── Types ────────────────────────────────────────────────────────────────────

interface SmartTechItem {
  id: string;
  item: string;
  accepted: boolean;
  placement_zone: string;
  previewUrl?: string;
}

type PreviewState = "idle" | "generating" | "ready" | "error";

// ── Persist helper ───────────────────────────────────────────────────────────

async function persistSmartTech(roomId: string, smartTech: SmartTechItem[]) {
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
      personalization_context: {
        ...existing,
        smart_tech: smartTech.map((t) => ({
          item: t.item,
          accepted: t.accepted,
          placement_zone: t.placement_zone,
        })),
      },
    })
    .eq("id", roomId);
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Step7eSmartTech() {
  const router = useRouter();
  const [isMounted, setIsMounted] = useState(false);
  const [currentQ, setCurrentQ] = useState(0);
  const [techItems, setTechItems] = useState<SmartTechItem[]>([]);
  const [previewState, setPreviewState] = useState<PreviewState>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pendingItem, setPendingItem] = useState<SmartTechItem | null>(null);
  const [roomPhotoUrl, setRoomPhotoUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const roomStoreId = useRoomStore((s) => s.roomId);
  const area2RoomId = useArea2Store((s) => s.roomId);
  const effectiveRoomId = area2RoomId ?? roomStoreId;

  useEffect(() => {
    setIsMounted(true);
  }, []);
  useEffect(() => {
    if (!isMounted) return;
    flowLog("page:mount", { page: "step-7e" });
  }, [isMounted]);

  // Load room photo
  useEffect(() => {
    if (!effectiveRoomId) return;
    const load = async () => {
      const supabase = createBrowserClient();
      const { data: room } = await supabase
        .from("rooms")
        .select("original_photo_url, original_image_url")
        .eq("id", effectiveRoomId)
        .single();
      const url = room?.original_photo_url ?? room?.original_image_url ?? null;
      if (url) setRoomPhotoUrl(url);
    };
    load().catch(console.warn);
  }, [effectiveRoomId]);

  const question = TECH_QUESTIONS[currentQ];
  const isLastQuestion = currentQ >= TECH_QUESTIONS.length - 1;

  const handleOptionSelect = useCallback(
    async (option: (typeof TECH_QUESTIONS)[0]["options"][0]) => {
      if (option.value === "none") {
        // Skip — no tech for this category
        if (isLastQuestion) {
          // Done — persist and navigate
          setSaving(true);
          if (effectiveRoomId && techItems.length > 0) {
            await persistSmartTech(effectiveRoomId, techItems).catch(
              console.warn,
            );
          }
          router.push("/design/step-7f");
          return;
        }
        setCurrentQ((q) => q + 1);
        return;
      }

      // User selected a tech item — generate preview
      const newItem: SmartTechItem = {
        id: option.value,
        item: option.item!,
        accepted: false,
        placement_zone: option.zone!,
      };

      setPendingItem(newItem);
      setPreviewState("generating");
      setPreviewUrl(null);

      // Fire FLUX image-to-image for live preview
      if (roomPhotoUrl) {
        try {
          const res = await fetch("/api/fal/proxy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              target_url:
                "https://queue.fal.run/fal-ai/flux/dev/image-to-image",
              input: {
                image_url: roomPhotoUrl,
                prompt: `Same room interior photograph with ${option.item} added. Photorealistic, professional interior design photography, natural lighting.`,
                strength: 0.3,
                num_inference_steps: 20,
                guidance_scale: 3.5,
                image_size: "landscape_16_9",
              },
            }),
          });

          if (res.ok) {
            const data = (await res.json()) as {
              images?: { url: string }[];
            };
            const url = data?.images?.[0]?.url;
            if (url) {
              setPreviewUrl(url);
              setPreviewState("ready");
            } else {
              setPreviewState("error");
            }
          } else {
            setPreviewState("error");
          }
        } catch {
          setPreviewState("error");
        }
      } else {
        // No room photo — skip preview, auto-accept
        setTechItems((prev) => [...prev, { ...newItem, accepted: true }]);
        setPendingItem(null);
        if (isLastQuestion) {
          setSaving(true);
          const items = [...techItems, { ...newItem, accepted: true }];
          if (effectiveRoomId) {
            await persistSmartTech(effectiveRoomId, items).catch(console.warn);
          }
          router.push("/design/step-7f");
          return;
        }
        setCurrentQ((q) => q + 1);
      }
    },
    [
      effectiveRoomId,
      isLastQuestion,
      roomPhotoUrl,
      techItems,
      router,
    ],
  );

  const handleAccept = useCallback(async () => {
    if (!pendingItem) return;
    const accepted = { ...pendingItem, accepted: true, previewUrl: previewUrl ?? undefined };
    const updated = [...techItems, accepted];
    setTechItems(updated);
    setPendingItem(null);
    setPreviewState("idle");
    setPreviewUrl(null);

    if (isLastQuestion) {
      setSaving(true);
      if (effectiveRoomId) {
        await persistSmartTech(effectiveRoomId, updated).catch(console.warn);
      }
      router.push("/design/step-7f");
      return;
    }
    setCurrentQ((q) => q + 1);
  }, [pendingItem, techItems, isLastQuestion, effectiveRoomId, previewUrl, router]);

  const handleReject = useCallback(() => {
    if (!pendingItem) return;
    // Reject — record as not accepted, move on
    const rejected = { ...pendingItem, accepted: false };
    setTechItems((prev) => [...prev, rejected]);
    setPendingItem(null);
    setPreviewState("idle");
    setPreviewUrl(null);

    if (isLastQuestion) {
      const updated = [...techItems, rejected];
      setSaving(true);
      if (effectiveRoomId) {
        persistSmartTech(effectiveRoomId, updated).catch(console.warn);
      }
      router.push("/design/step-7f");
      return;
    }
    setCurrentQ((q) => q + 1);
  }, [pendingItem, techItems, isLastQuestion, effectiveRoomId, router]);

  const handleSkipAll = useCallback(async () => {
    setSaving(true);
    if (effectiveRoomId && techItems.length > 0) {
      await persistSmartTech(effectiveRoomId, techItems).catch(console.warn);
    }
    router.push("/design/step-7f");
  }, [effectiveRoomId, techItems, router]);

  if (!isMounted) return null;

  const acceptedCount = techItems.filter((t) => t.accepted).length;

  return (
    <div className="min-h-screen bg-[#091829] font-['DM_Sans',system-ui,sans-serif] text-[#F5F0E8] flex flex-col">
      {/* Progress bar */}
      <div className="fixed top-0 left-0 right-0 h-[3px] bg-[rgba(201,168,76,0.15)] z-[60]">
        <div
          className="h-full bg-[#C9A84C] transition-all duration-[400ms] ease-out"
          style={{ width: `${70 + (currentQ / TECH_QUESTIONS.length) * 5}%` }}
        />
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
          onClick={() => router.push("/design/step-7c")}
          className="bg-transparent border-none text-[rgba(245,240,232,0.6)] text-sm cursor-pointer"
        >
          &larr; Back
        </button>
        <span className="font-['Playfair_Display',Georgia,serif] italic text-xl text-[#C9A84C] tracking-[0.05em]">
          Cova
        </span>
        <button
          type="button"
          onClick={handleSkipAll}
          disabled={saving}
          className="bg-transparent border-none text-[rgba(245,240,232,0.45)] text-sm cursor-pointer"
        >
          Skip
        </button>
      </nav>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 max-w-[640px] mx-auto w-full">
        {/* Room photo with preview overlay */}
        {roomPhotoUrl && (
          <div className="w-full rounded-xl overflow-hidden mb-8 relative">
            <img
              src={previewState === "ready" && previewUrl ? previewUrl : roomPhotoUrl}
              alt="Your room"
              className="w-full h-auto block"
              style={{
                transition: "opacity 0.4s ease",
              }}
            />
            {previewState === "generating" && (
              <div
                className="absolute inset-0 flex flex-col items-center justify-center gap-3"
                style={{ background: "rgba(9,24,41,0.7)" }}
              >
                <div
                  className="w-10 h-10 rounded-full"
                  style={{
                    border: "3px solid rgba(201,168,76,0.25)",
                    borderTopColor: "#C9A84C",
                    animation: "spin 1s linear infinite",
                  }}
                />
                <p className="text-sm text-[rgba(245,240,232,0.7)]">
                  Placing {pendingItem?.item}...
                </p>
              </div>
            )}
            {previewState === "ready" && (
              <div className="absolute bottom-3 left-3 right-3 flex gap-2">
                <button
                  type="button"
                  onClick={handleAccept}
                  className="flex-1 py-3 rounded-lg text-sm font-semibold cursor-pointer border-none"
                  style={{ background: "#C9A84C", color: "#091829" }}
                >
                  Keep this
                </button>
                <button
                  type="button"
                  onClick={handleReject}
                  className="flex-1 py-3 rounded-lg text-sm font-semibold cursor-pointer"
                  style={{
                    background: "rgba(255,255,255,0.08)",
                    color: "#F5F0E8",
                    border: "1px solid rgba(201,168,76,0.2)",
                  }}
                >
                  Remove
                </button>
              </div>
            )}
            {previewState === "error" && (
              <div className="absolute bottom-3 left-3 right-3 flex gap-2">
                <button
                  type="button"
                  onClick={handleAccept}
                  className="flex-1 py-3 rounded-lg text-sm font-semibold cursor-pointer border-none"
                  style={{ background: "#C9A84C", color: "#091829" }}
                >
                  Add anyway
                </button>
                <button
                  type="button"
                  onClick={handleReject}
                  className="flex-1 py-3 rounded-lg text-sm font-semibold cursor-pointer"
                  style={{
                    background: "rgba(255,255,255,0.08)",
                    color: "#F5F0E8",
                    border: "1px solid rgba(201,168,76,0.2)",
                  }}
                >
                  Skip
                </button>
              </div>
            )}
          </div>
        )}

        {/* Accepted items badges */}
        {acceptedCount > 0 && (
          <div className="flex flex-wrap gap-2 mb-6 w-full">
            {techItems
              .filter((t) => t.accepted)
              .map((t) => (
                <span
                  key={t.id}
                  className="px-3 py-1 rounded-full text-xs font-medium"
                  style={{
                    background: "rgba(201,168,76,0.15)",
                    color: "#C9A84C",
                    border: "1px solid rgba(201,168,76,0.3)",
                  }}
                >
                  {t.item}
                </span>
              ))}
          </div>
        )}

        {/* Question card */}
        {question && previewState !== "ready" && previewState !== "error" && (
          <AnimatePresence mode="wait">
            <motion.div
              key={question.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="w-full"
            >
              <div className="mb-2 text-xs text-[rgba(245,240,232,0.4)] tracking-wider uppercase">
                {currentQ + 1} of {TECH_QUESTIONS.length}
              </div>
              <h1 className="text-2xl font-semibold mb-2 leading-tight">
                {question.question}
              </h1>
              <p className="text-sm text-[rgba(245,240,232,0.55)] mb-6">
                {question.description}
              </p>

              <div className="flex flex-col gap-3">
                {question.options.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleOptionSelect(opt)}
                    disabled={previewState === "generating" || saving}
                    className="w-full text-left py-4 px-5 rounded-xl text-[15px] cursor-pointer transition-all duration-200"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(201,168,76,0.15)",
                      color: "#F5F0E8",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor =
                        "rgba(201,168,76,0.5)";
                      (e.currentTarget as HTMLButtonElement).style.background =
                        "rgba(201,168,76,0.08)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor =
                        "rgba(201,168,76,0.15)";
                      (e.currentTarget as HTMLButtonElement).style.background =
                        "rgba(255,255,255,0.04)";
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {/* CSS for spin animation */}
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

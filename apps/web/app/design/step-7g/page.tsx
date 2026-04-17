"use client";

/**
 * Step 7g — Lifestyle Signals
 *
 * Three direct questions that constrain the Design Director brief:
 *   Q1: Work from this room? → adds desk/task lighting
 *   Q2: Morning or evening person? → affects color temp
 *   Q3: Minimalist or collector? → affects density
 *
 * Writes: personalization_context.lifestyle = {works_from_room, time_preference, density}
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { flowLog } from "@/lib/debug/flow-logger";
import { useArea2Store } from "@/lib/stores/area2Store";
import { createBrowserClient } from "@/lib/supabase/client";
import { useRoomStore } from "@/lib/store/room";

// ── Questions ────────────────────────────────────────────────────────────────

interface LifestyleQuestion {
  id: string;
  question: string;
  subtitle: string;
  options: { label: string; value: string; description: string }[];
}

const LIFESTYLE_QUESTIONS: LifestyleQuestion[] = [
  {
    id: "work",
    question: "Do you work from this room?",
    subtitle: "This helps us plan desk space and task lighting.",
    options: [
      {
        label: "Yes",
        value: "true",
        description: "I need a dedicated work area",
      },
      {
        label: "Sometimes",
        value: "sometimes",
        description: "Occasionally, but not a primary workspace",
      },
      {
        label: "No",
        value: "false",
        description: "This room is purely for relaxation",
      },
    ],
  },
  {
    id: "time",
    question: "Morning person or evening person?",
    subtitle: "We'll optimize the lighting to match your rhythm.",
    options: [
      {
        label: "Morning",
        value: "morning",
        description: "I love bright, natural light",
      },
      {
        label: "Evening",
        value: "evening",
        description: "I prefer warm, ambient glow",
      },
      {
        label: "Both",
        value: "both",
        description: "I need the room to work all day",
      },
    ],
  },
  {
    id: "density",
    question: "Less is more, or more is more?",
    subtitle: "This shapes how full your room will feel.",
    options: [
      {
        label: "Less is more",
        value: "minimalist",
        description: "Clean surfaces, open space, essentials only",
      },
      {
        label: "Balanced",
        value: "balanced",
        description: "Comfortable but not cluttered",
      },
      {
        label: "Collector",
        value: "collector",
        description: "I love layers, objects, and personality",
      },
    ],
  },
];

// ── Types ────────────────────────────────────────────────────────────────────

interface LifestyleAnswers {
  works_from_room: boolean | "sometimes";
  time_preference: "morning" | "evening" | "both";
  density: "minimalist" | "balanced" | "collector";
}

// ── Persist helper ───────────────────────────────────────────────────────────

async function persistLifestyle(roomId: string, lifestyle: LifestyleAnswers) {
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
      personalization_context: { ...existing, lifestyle },
    })
    .eq("id", roomId);
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Step7gLifestyle() {
  const router = useRouter();
  const [isMounted, setIsMounted] = useState(false);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const roomStoreId = useRoomStore((s) => s.roomId);
  const area2RoomId = useArea2Store((s) => s.roomId);
  const effectiveRoomId = area2RoomId ?? roomStoreId;

  useEffect(() => setIsMounted(true), []);
  useEffect(() => {
    if (!isMounted) return;
    flowLog("page:mount", { page: "step-7g" });
  }, [isMounted]);

  const question = LIFESTYLE_QUESTIONS[currentQ];
  const isLastQuestion = currentQ >= LIFESTYLE_QUESTIONS.length - 1;

  const handleAnswer = useCallback(
    async (value: string) => {
      const updated = { ...answers, [question!.id]: value };
      setAnswers(updated);

      if (isLastQuestion) {
        // All questions answered — persist and navigate
        setSaving(true);
        const lifestyle: LifestyleAnswers = {
          works_from_room:
            updated.work === "true"
              ? true
              : updated.work === "sometimes"
                ? "sometimes"
                : false,
          time_preference: (updated.time as LifestyleAnswers["time_preference"]) ?? "both",
          density: (updated.density as LifestyleAnswers["density"]) ?? "balanced",
        };

        if (effectiveRoomId) {
          await persistLifestyle(effectiveRoomId, lifestyle).catch(
            console.warn,
          );
        }
        router.push("/design/step-7h");
        return;
      }

      // Advance to next question with a brief delay for animation
      setTimeout(() => setCurrentQ((q) => q + 1), 150);
    },
    [answers, question, isLastQuestion, effectiveRoomId, router],
  );

  const handleSkip = useCallback(() => {
    router.push("/design/step-7h");
  }, [router]);

  if (!isMounted) return null;

  return (
    <div className="min-h-screen bg-[#091829] font-['DM_Sans',system-ui,sans-serif] text-[#F5F0E8] flex flex-col">
      {/* Progress bar */}
      <div className="fixed top-0 left-0 right-0 h-[3px] bg-[rgba(201,168,76,0.15)] z-[60]">
        <div
          className="h-full bg-[#C9A84C] transition-all duration-[400ms] ease-out"
          style={{ width: `${80 + (currentQ / LIFESTYLE_QUESTIONS.length) * 4}%` }}
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
          onClick={() => router.push("/design/step-7f")}
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
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 max-w-[520px] mx-auto w-full">
        {/* Progress dots */}
        <div className="flex gap-2 mb-8">
          {LIFESTYLE_QUESTIONS.map((_, i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full transition-all duration-300"
              style={{
                background:
                  i < currentQ
                    ? "#C9A84C"
                    : i === currentQ
                      ? "#C9A84C"
                      : "rgba(201,168,76,0.2)",
                transform: i === currentQ ? "scale(1.3)" : "scale(1)",
              }}
            />
          ))}
        </div>

        {question && (
          <AnimatePresence mode="wait">
            <motion.div
              key={question.id}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -24 }}
              transition={{ duration: 0.3 }}
              className="w-full text-center"
            >
              <h1 className="text-[28px] font-semibold mb-3 leading-tight">
                {question.question}
              </h1>
              <p className="text-sm text-[rgba(245,240,232,0.5)] mb-10">
                {question.subtitle}
              </p>

              <div className="flex flex-col gap-3">
                {question.options.map((opt) => (
                  <motion.button
                    key={opt.value}
                    type="button"
                    onClick={() => handleAnswer(opt.value)}
                    disabled={saving}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full text-left rounded-xl cursor-pointer transition-colors duration-200"
                    style={{
                      background:
                        answers[question.id] === opt.value
                          ? "rgba(201,168,76,0.12)"
                          : "rgba(255,255,255,0.04)",
                      border: `1px solid ${answers[question.id] === opt.value ? "rgba(201,168,76,0.5)" : "rgba(201,168,76,0.15)"}`,
                      padding: "18px 20px",
                    }}
                  >
                    <div className="font-semibold text-[15px] mb-1">
                      {opt.label}
                    </div>
                    <div className="text-sm text-[rgba(245,240,232,0.45)]">
                      {opt.description}
                    </div>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

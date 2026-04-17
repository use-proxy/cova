"use client";

/**
 * Step 7h — Required Object Anchor
 *
 * Free-text input for one thing the user definitely wants in the design.
 * This becomes the hero anchor for the entire Design Director brief.
 *
 * Writes: personalization_context.required_object = {description, is_override_anchor}
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { flowLog } from "@/lib/debug/flow-logger";
import { useArea2Store } from "@/lib/stores/area2Store";
import { createBrowserClient } from "@/lib/supabase/client";
import { useRoomStore } from "@/lib/store/room";

// ── Examples ─────────────────────────────────────────────────────────────────

const EXAMPLES = [
  "I need a reading nook",
  "I want a plant wall",
  "I have a guitar to display",
  "I need a meditation corner",
  "I want a bar cart area",
  "I have a vinyl record collection",
];

// ── Persist helper ───────────────────────────────────────────────────────────

async function persistRequiredObject(
  roomId: string,
  requiredObject: { description: string; is_override_anchor: boolean },
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
      personalization_context: { ...existing, required_object: requiredObject },
    })
    .eq("id", roomId);
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Step7hRequiredObject() {
  const router = useRouter();
  const [isMounted, setIsMounted] = useState(false);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const roomStoreId = useRoomStore((s) => s.roomId);
  const area2RoomId = useArea2Store((s) => s.roomId);
  const effectiveRoomId = area2RoomId ?? roomStoreId;

  useEffect(() => setIsMounted(true), []);
  useEffect(() => {
    if (!isMounted) return;
    flowLog("page:mount", { page: "step-7h" });
    // Auto-focus the input
    setTimeout(() => inputRef.current?.focus(), 300);
  }, [isMounted]);

  const handleContinue = useCallback(async () => {
    const description = input.trim();
    if (!description) {
      // Skip — no required object
      router.push("/design/step-7d");
      return;
    }

    setSaving(true);
    if (effectiveRoomId) {
      await persistRequiredObject(effectiveRoomId, {
        description,
        is_override_anchor: true,
      }).catch(console.warn);
    }
    router.push("/design/step-7d");
  }, [input, effectiveRoomId, router]);

  const handleExampleClick = (example: string) => {
    setInput(example);
    inputRef.current?.focus();
  };

  const handleSkip = useCallback(() => {
    router.push("/design/step-7d");
  }, [router]);

  if (!isMounted) return null;

  return (
    <div className="min-h-screen bg-[#091829] font-['DM_Sans',system-ui,sans-serif] text-[#F5F0E8] flex flex-col">
      {/* Progress bar */}
      <div className="fixed top-0 left-0 right-0 h-[3px] bg-[rgba(201,168,76,0.15)] z-[60]">
        <div className="h-full w-[84%] bg-[#C9A84C] transition-all duration-[400ms] ease-out" />
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
          onClick={() => router.push("/design/step-7g")}
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
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full"
        >
          <h1 className="text-[28px] font-semibold mb-3 leading-tight text-center">
            One thing you definitely want
          </h1>
          <p className="text-sm text-[rgba(245,240,232,0.5)] mb-8 text-center">
            Tell us one must-have element and we&apos;ll build the entire design
            around it.
          </p>

          {/* Input field */}
          <div className="mb-6">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && input.trim()) handleContinue();
              }}
              placeholder="e.g. I need a reading nook..."
              className="w-full rounded-xl py-4 px-5 text-[16px] text-[#F5F0E8] outline-none transition-[border-color] duration-150"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(201,168,76,0.2)",
              }}
              onFocus={(e) => {
                (e.target as HTMLInputElement).style.borderColor =
                  "rgba(201,168,76,0.6)";
              }}
              onBlur={(e) => {
                (e.target as HTMLInputElement).style.borderColor =
                  "rgba(201,168,76,0.2)";
              }}
            />
          </div>

          {/* Example chips */}
          <div className="mb-10">
            <p className="text-xs text-[rgba(245,240,232,0.35)] mb-3 uppercase tracking-wider">
              Ideas
            </p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => handleExampleClick(ex)}
                  className="bg-transparent text-[13px] py-[7px] px-3 rounded-full cursor-pointer transition-all duration-200"
                  style={{
                    border: "1px solid rgba(201,168,76,0.15)",
                    color: "rgba(245,240,232,0.6)",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor =
                      "rgba(201,168,76,0.4)";
                    (e.currentTarget as HTMLButtonElement).style.color =
                      "#F5F0E8";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor =
                      "rgba(201,168,76,0.15)";
                    (e.currentTarget as HTMLButtonElement).style.color =
                      "rgba(245,240,232,0.6)";
                  }}
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>

          {/* CTA */}
          <motion.button
            type="button"
            onClick={handleContinue}
            disabled={saving}
            whileHover={input.trim() ? { scale: 1.01 } : {}}
            whileTap={input.trim() ? { scale: 0.98 } : {}}
            className="w-full py-[14px] rounded-lg text-[15px] font-semibold border-none cursor-pointer transition-all duration-200"
            style={{
              background: input.trim()
                ? "#C9A84C"
                : "rgba(201,168,76,0.12)",
              color: input.trim()
                ? "#091829"
                : "rgba(245,240,232,0.45)",
            }}
          >
            {input.trim() ? "Continue" : "Skip this step"}
          </motion.button>

          <p className="mt-3 text-xs text-[rgba(245,240,232,0.3)] text-center">
            This is optional — your design will be great either way.
          </p>
        </motion.div>
      </div>
    </div>
  );
}

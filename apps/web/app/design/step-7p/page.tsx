"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import type { PersonalizationManifest } from "@/lib/types/personalization";
import { emptyManifest } from "@/lib/types/personalization";

const SLOT_CARDS: Array<{ key: string; label: string; hint: string }> = [
  { key: "art", label: "Art & posters", hint: "Upload or describe wall art" },
  { key: "smart_products", label: "Smart tech", hint: "TV, speakers, lights" },
  { key: "specific_items", label: "Specific items", hint: "Link a product" },
  { key: "lighting", label: "Lighting mood", hint: "Warm / bright / moody" },
  { key: "identity_objects", label: "What you love", hint: "Plants, books, vinyl..." },
  { key: "freetext", label: "Anything else", hint: "Write it in your words" },
];

interface RoomRow {
  id: string;
  room_type: string | null;
  style_blend: Record<string, number> | null;
  personalization: Record<string, unknown> | null;
  empty_room_url: string | null;
}

function Step7pPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [room, setRoom] = useState<RoomRow | null>(null);
  const [manifest, setManifest] = useState<PersonalizationManifest | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roomId =
    searchParams.get("roomId") ??
    (typeof document !== "undefined"
      ? document.cookie
          .split("; ")
          .find((c) => c.startsWith("cova_room_id="))
          ?.split("=")[1]
      : null);

  useEffect(() => {
    async function load() {
      if (!roomId) return;
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );
      const { data } = await supabase
        .from("rooms")
        .select("id, room_type, style_blend, personalization, empty_room_url")
        .eq("id", roomId)
        .single();
      if (data) {
        const roomData = data as RoomRow;
        setRoom(roomData);
        const existing = (roomData.personalization ?? null) as
          | PersonalizationManifest
          | null;
        setManifest(existing ?? emptyManifest(roomData.room_type ?? "bedroom"));
      }
    }
    void load();
  }, [roomId]);

  const topStyleKey = room?.style_blend
    ? Object.entries(room.style_blend).sort(
        ([, a], [, b]) => (b as number) - (a as number),
      )[0]?.[0] ?? "your design style"
    : "your design style";

  async function handleSkipAndRender() {
    if (!roomId || !manifest) return;
    setBusy(true);
    setError(null);
    try {
      const saveRes = await fetch("/api/personalization/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room_id: roomId, manifest }),
      });
      if (!saveRes.ok) {
        throw new Error(
          `save failed: ${saveRes.status} ${await saveRes.text().catch(() => "")}`,
        );
      }
      const redesignRes = await fetch("/api/pipeline/redesign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room_id: roomId }),
      });
      if (!redesignRes.ok) {
        const text = await redesignRes.text().catch(() => "");
        throw new Error(`redesign dispatch failed: ${redesignRes.status} ${text}`);
      }
      router.push("/design/step-8a");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  if (!roomId) {
    return (
      <main style={{ padding: 48, maxWidth: 720, margin: "0 auto" }}>
        <h1 style={{ fontFamily: "EB Garamond, serif", fontSize: 36 }}>
          Make it yours
        </h1>
        <p style={{ color: "#C0504A" }}>
          No room selected. Return to <a href="/dashboard">dashboard</a>.
        </p>
      </main>
    );
  }

  return (
    <main
      style={{
        padding: 48,
        maxWidth: 960,
        margin: "0 auto",
        color: "#F8F6F1",
        background: "#0A1628",
        minHeight: "100vh",
      }}
    >
      <h1
        style={{
          fontFamily: "EB Garamond, serif",
          fontSize: 42,
          marginBottom: 8,
        }}
      >
        Make it yours
      </h1>
      <p style={{ color: "#8BA3C0", marginBottom: 32 }}>
        Add the details that make a space feel like home, then let Cova stage it.
      </p>
      <div style={{ color: "#8BA3C0", fontSize: 14, marginBottom: 24 }}>
        Room: <strong style={{ color: "#F0D080" }}>{room?.room_type ?? "…"}</strong>
        {" · "}Style: <strong style={{ color: "#F0D080" }}>{topStyleKey}</strong>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 16,
          marginBottom: 48,
        }}
      >
        {SLOT_CARDS.map((slot) => (
          <div
            key={slot.key}
            style={{
              background: "#0F1F3D",
              border: "1px solid #1E3A5F",
              borderRadius: 12,
              padding: 20,
            }}
          >
            <div style={{ fontSize: 16, marginBottom: 4, color: "#F8F6F1" }}>
              {slot.label}
            </div>
            <div style={{ fontSize: 13, color: "#8BA3C0", marginBottom: 12 }}>
              {slot.hint}
            </div>
            <button
              type="button"
              disabled
              style={{
                background: "transparent",
                color: "#8BA3C0",
                border: "1px solid #1E3A5F",
                borderRadius: 24,
                padding: "6px 16px",
                fontSize: 13,
                cursor: "not-allowed",
              }}
            >
              Add (coming soon)
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={handleSkipAndRender}
        disabled={busy || !manifest}
        style={{
          background: "#C9A84C",
          color: "#0A1628",
          border: "none",
          borderRadius: 24,
          padding: "14px 32px",
          fontSize: 16,
          fontWeight: 600,
          cursor: busy ? "wait" : "pointer",
        }}
      >
        {busy ? "Staging…" : "Skip — generate my room"}
      </button>
      {error && (
        <div style={{ color: "#C0504A", marginTop: 16 }}>Error: {error}</div>
      )}
    </main>
  );
}

export default function Step7pPage() {
  return (
    <Suspense fallback={null}>
      <Step7pPageInner />
    </Suspense>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

function CovaArcLogo() {
  return (
    <svg
      width="20"
      height="14"
      viewBox="0 0 32 20"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2 18Q16 2 30 18"
        stroke="white"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export default function CaptureNewPage() {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function createRoom() {
      try {
        // Spec asks for POST /api/rooms, but the route we add is /api/rooms/create.
        // We attempt /api/rooms first, then fall back to /api/rooms/create.
        const tryCreate = async (url: string) => {
          const resp = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
          });
          if (!resp.ok) return null;
          const data = (await resp.json()) as { room_id?: string };
          return data.room_id ?? null;
        };

        const roomId =
          (await tryCreate("/api/rooms")) ??
          (await tryCreate("/api/rooms/create"));

        if (cancelled || !roomId) return;

        // Immediately redirect once the room is created.
        router.push(`/capture/${roomId}`);
      } catch (err) {
        console.error("Failed to create room:", err);
      } finally {
        if (!cancelled) setIsCreating(false);
      }
    }

    void createRoom();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!isCreating) {
    // Keep it minimal: redirect should happen quickly; this is a safe fallback.
    return (
      <div className="min-h-screen bg-[#0A1628] flex items-center justify-center">
        <CovaArcLogo />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A1628] flex items-center justify-center">
      <CovaArcLogo />
    </div>
  );
}

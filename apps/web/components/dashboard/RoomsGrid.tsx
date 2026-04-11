"use client";

import { useState } from "react";
import { Home } from "lucide-react";
import { CovaCard } from "@/components/cova/CovaCard";
import { CovaButton } from "@/components/cova/CovaButton";
import { RoomCard } from "./RoomCard";
import type { DashboardRoom } from "@/lib/dashboard/queries";

interface RoomsGridProps {
  initialRooms: DashboardRoom[];
}

export function RoomsGrid({ initialRooms }: RoomsGridProps) {
  const [rooms, setRooms] = useState(initialRooms);

  function handleDelete(roomId: string) {
    setRooms((prev) => prev.filter((r) => r.id !== roomId));
  }

  if (rooms.length === 0) {
    return (
      <CovaCard
        variant="default"
        className="flex flex-col items-center gap-6 py-20"
      >
        <Home size={64} className="text-cova-subtle" />
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="font-serif text-xl text-cova-ivory-dim">
            Your first design awaits
          </p>
          <p className="max-w-xs text-sm text-cova-muted">
            Upload a photo of your room and let Cova reimagine it
          </p>
        </div>
        <CovaButton
          variant="primary"
          onClick={() => (window.location.href = "/design/step-1")}
        >
          Design My First Room
        </CovaButton>
      </CovaCard>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {rooms.map((room) => (
        <RoomCard key={room.id} room={room} onDelete={handleDelete} />
      ))}
    </div>
  );
}

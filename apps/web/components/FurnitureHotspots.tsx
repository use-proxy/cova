"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { useCameraStore } from "@/lib/stores/cameraStore";

const DEG2RAD = Math.PI / 180;

interface FurnitureProduct {
  id: string;
  name: string;
  price: number;
  category: string;
  retailer: string;
  affiliate_url: string;
  image_url: string;
  style_tags: string[];
}

interface FurnitureMatch {
  id: string;
  furniture_label: string;
  furniture_description: string;
  azimuth_degrees: number;
  elevation_degrees: number | null;
  rank: number;
  is_unlocked: boolean;
  similarity_score: number;
  products: FurnitureProduct;
}

interface ProjectedHotspot {
  match: FurnitureMatch;
  screenX: number;
  screenY: number;
  opacity: number;
}

interface FurnitureHotspotsProps {
  roomId: string;
  onProductSelect: (label: string) => void;
}

/**
 * Project a furniture piece from spherical (azimuth, elevation) coordinates
 * to screen (x, y) given the current camera orientation.
 *
 * Azimuth convention: 0-360° mapped from panorama left-to-right.
 *   Panorama center (180°) = world forward (angle 0).
 * Elevation: -90° (floor) to +90° (ceiling), 0° = eye level.
 */
function projectToScreen(
  azimuthDeg: number,
  elevationDeg: number,
  cameraYaw: number,
  cameraPitch: number,
  fovRad: number,
  aspect: number,
  viewW: number,
  viewH: number,
): { x: number; y: number; opacity: number } | null {
  // Convert panorama azimuth to world angle (radians)
  // Panorama center (180°) = forward (0 rad)
  const worldAz = (azimuthDeg - 180) * DEG2RAD;
  const elRad = elevationDeg * DEG2RAD;

  // Furniture direction as unit vector in world space
  const fx = Math.cos(elRad) * Math.sin(worldAz);
  const fy = Math.sin(elRad);
  const fz = Math.cos(elRad) * Math.cos(worldAz);

  // Rotate into camera space:
  // Step 1: rotate around Y by -cameraYaw
  const cosY = Math.cos(-cameraYaw);
  const sinY = Math.sin(-cameraYaw);
  const rx = fx * cosY + fz * sinY;
  const ry = fy;
  const rz = -fx * sinY + fz * cosY;

  // Step 2: rotate around X by -cameraPitch
  const cosP = Math.cos(-cameraPitch);
  const sinP = Math.sin(-cameraPitch);
  const lx = rx;
  const ly = ry * cosP - rz * sinP;
  const lz = ry * sinP + rz * cosP;

  // Behind camera — don't render
  if (lz <= 0.01) return null;

  // Perspective projection
  const tanHalfFov = Math.tan(fovRad / 2);
  const ndcX = lx / (lz * tanHalfFov * aspect);
  const ndcY = ly / (lz * tanHalfFov);

  // Angular distance from camera center for edge fade
  const angularDist = Math.acos(Math.max(-1, Math.min(1, lz)));
  const maxAngle = 85 * DEG2RAD;
  let opacity = 1;
  if (angularDist > maxAngle) {
    return null; // too far to the edge
  } else if (angularDist > 70 * DEG2RAD) {
    // Fade between 70° and 85°
    opacity = 1 - (angularDist - 70 * DEG2RAD) / (15 * DEG2RAD);
  }

  // NDC to screen pixels
  const screenX = ((ndcX + 1) / 2) * viewW;
  const screenY = ((-ndcY + 1) / 2) * viewH;

  return { x: screenX, y: screenY, opacity };
}

export default function FurnitureHotspots({
  roomId,
  onProductSelect,
}: FurnitureHotspotsProps) {
  const [matches, setMatches] = useState<FurnitureMatch[]>([]);
  const [projected, setProjected] = useState<ProjectedHotspot[]>([]);
  const rafRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch furniture matches
  useEffect(() => {
    const supabase = createBrowserClient();
    supabase
      .from("room_products")
      .select(
        "id, furniture_label, furniture_description, azimuth_degrees, elevation_degrees, rank, is_unlocked, similarity_score, products (id, name, price, category, retailer, affiliate_url, image_url, style_tags)",
      )
      .eq("room_id", roomId)
      .eq("rank", 1)
      .order("azimuth_degrees")
      .then(({ data }) => {
        setMatches((data as unknown as FurnitureMatch[]) ?? []);
      });
  }, [roomId]);

  // Projection loop — runs on every animation frame to track camera
  const updateProjection = useCallback(() => {
    if (matches.length === 0) return;

    const el = containerRef.current;
    const viewW = el?.clientWidth ?? window.innerWidth;
    const viewH = el?.clientHeight ?? window.innerHeight;
    const { yaw, pitch, fov, aspect } = useCameraStore.getState();

    const results: ProjectedHotspot[] = [];
    for (const match of matches) {
      const elevation = match.elevation_degrees ?? -25; // default mid-floor
      const result = projectToScreen(
        match.azimuth_degrees,
        elevation,
        yaw,
        pitch,
        fov,
        aspect,
        viewW,
        viewH,
      );
      if (result) {
        results.push({
          match,
          screenX: result.x,
          screenY: result.y,
          opacity: result.opacity,
        });
      }
    }
    setProjected(results);
  }, [matches]);

  useEffect(() => {
    if (matches.length === 0) return;

    const loop = () => {
      updateProjection();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(rafRef.current);
  }, [matches, updateProjection]);

  if (matches.length === 0) return null;

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 10,
      }}
    >
      {projected.map(({ match, screenX, screenY, opacity }) => (
        <button
          key={match.id}
          type="button"
          onClick={() => onProductSelect(match.furniture_label)}
          style={{
            position: "absolute",
            left: screenX,
            top: screenY,
            transform: "translate(-50%, -50%)",
            pointerEvents: "auto",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            opacity,
            transition: "opacity 150ms ease-out",
            willChange: "transform, left, top",
          }}
        >
          <div style={{ position: "relative" }}>
            {/* Pulse ring */}
            <div
              style={{
                position: "absolute",
                inset: -4,
                borderRadius: "50%",
                background: "rgba(201, 168, 76, 0.3)",
                animation: "hotspot-pulse 2s ease-in-out infinite",
              }}
            />
            {/* Main dot */}
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.9)",
                border: "2px solid #C9A84C",
                boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
              }}
            >
              {match.is_unlocked ? (
                <span
                  style={{ fontSize: 10, fontWeight: 700, color: "#0A1628" }}
                >
                  ${Math.round(match.products?.price ?? 0)}
                </span>
              ) : (
                <svg width="14" height="14" viewBox="0 0 20 20" fill="#0A1628">
                  <path
                    fillRule="evenodd"
                    d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                  />
                </svg>
              )}
            </div>
            {/* Label */}
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: "50%",
                transform: "translateX(-50%)",
                marginTop: 4,
                padding: "2px 8px",
                background: "rgba(0,0,0,0.75)",
                color: "#fff",
                fontSize: 11,
                borderRadius: 4,
                whiteSpace: "nowrap",
                fontFamily: "Inter, sans-serif",
              }}
            >
              {match.furniture_label}
            </div>
          </div>
        </button>
      ))}
      <style>{`
        @keyframes hotspot-pulse {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.5); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

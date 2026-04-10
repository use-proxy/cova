"use client";

import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
} from "react";
import QRCode from "react-qr-code";
import { useRouter } from "next/navigation";
import "../step-1/step1.css";
import "./step6.css";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  opacity: number;
  speed: number;
  drift: number;
  phase: number;
}

// ─── Gold Particle Field ──────────────────────────────────────────────────────
function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    particlesRef.current = Array.from({ length: 80 }, (_, i) => ({
      id: i,
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      size: Math.random() * 1.8 + 0.4,
      opacity: Math.random() * 0.5 + 0.08,
      speed: Math.random() * 0.3 + 0.08,
      drift: (Math.random() - 0.5) * 0.25,
      phase: Math.random() * Math.PI * 2,
    }));

    let t = 0;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      t += 0.008;
      particlesRef.current.forEach((p) => {
        const flicker = 0.5 + 0.5 * Math.sin(t * 1.2 + p.phase);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(201,168,76,${p.opacity * flicker})`;
        ctx.fill();
        p.y -= p.speed;
        p.x += p.drift;
        if (p.y < -10) {
          p.y = canvas.height + 10;
          p.x = Math.random() * canvas.width;
        }
        if (p.x < -10) p.x = canvas.width + 10;
        if (p.x > canvas.width + 10) p.x = -10;
      });
      animRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }}
    />
  );
}

// ─── 3-D Camera SVG Icon ──────────────────────────────────────────────────────
function CameraIcon({
  scale = 1,
  glow = false,
}: {
  scale?: number;
  glow?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 80 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        width: 80,
        height: 64,
        transform: `scale(${scale})`,
        transition: "transform 0.35s cubic-bezier(0.34,1.56,0.64,1)",
        filter: glow
          ? "drop-shadow(0 0 18px rgba(201,168,76,0.9)) drop-shadow(0 0 6px rgba(201,168,76,0.6))"
          : "drop-shadow(0 0 8px rgba(201,168,76,0.45))",
      }}
    >
            
      <rect
        x="4"
        y="18"
        width="72"
        height="42"
        rx="8"
        stroke="#C9A84C"
        strokeWidth="2.2"
        fill="rgba(201,168,76,0.06)"
      />
            
      <path
        d="M28 18V12a4 4 0 0 1 4-4h16a4 4 0 0 1 4 4v6"
        stroke="#C9A84C"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
            
      <circle
        cx="40"
        cy="38"
        r="13"
        stroke="#C9A84C"
        strokeWidth="2.2"
        fill="rgba(201,168,76,0.05)"
      />
            
      <circle
        cx="40"
        cy="38"
        r="7"
        stroke="#C9A84C"
        strokeWidth="1.6"
        fill="rgba(201,168,76,0.12)"
      />
            
      <circle cx="37" cy="35" r="2" fill="rgba(201,168,76,0.35)" />
            
      <rect
        x="60"
        y="24"
        width="8"
        height="6"
        rx="2"
        stroke="#C9A84C"
        strokeWidth="1.6"
        fill="rgba(201,168,76,0.1)"
      />
            
      <path
        d="M76 22 L80 18 L80 56 L76 60"
        stroke="#C9A84C"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="rgba(201,168,76,0.04)"
        opacity="0.6"
      />
            
      <path
        d="M4 18 L8 14 L76 14 L76 18"
        stroke="#C9A84C"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="rgba(201,168,76,0.04)"
        opacity="0.6"
      />
          
    </svg>
  );
}

// ─── Checkmark Badge ──────────────────────────────────────────────────────────
function CheckBadge({ visible }: { visible: boolean }) {
  return (
    <div
      style={{
        position: "absolute",
        top: 14,
        right: 14,
        width: 32,
        height: 32,
        borderRadius: "50%",
        background: "#C9A84C",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 0 16px rgba(201,168,76,0.7)",
        transform: visible ? "scale(1)" : "scale(0)",
        opacity: visible ? 1 : 0,
        transition:
          "transform 0.45s cubic-bezier(0.34,1.56,0.64,1), opacity 0.3s ease",
        zIndex: 10,
      }}
    >
            
      <svg viewBox="0 0 16 16" width="16" height="16" fill="none">
                
        <path
          d="M3 8.5L6.5 12L13 5"
          stroke="#091829"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
              
      </svg>
          
    </div>
  );
}

// ─── Tip Card ─────────────────────────────────────────────────────────────────
function TipCard({
  icon,
  title,
  desc,
  delay,
  visible,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  delay: number;
  visible: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: 1,
        minWidth: 0,
        background: "rgba(255,255,255,0.04)",
        border: `1px solid ${hovered ? "rgba(201,168,76,0.45)" : "rgba(201,168,76,0.15)"}`,
        borderRadius: 14,
        padding: "18px 16px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        cursor: "default",
        transform: visible
          ? hovered
            ? "translateY(-4px) perspective(600px) rotateX(3deg)"
            : "translateY(0px)"
          : "translateY(24px)",
        opacity: visible ? 1 : 0,
        transition: `transform 0.55s cubic-bezier(0.22,1,0.36,1) ${delay}ms, opacity 0.55s ease ${delay}ms, border-color 0.25s ease, box-shadow 0.25s ease`,
        boxShadow: hovered
          ? "0 12px 32px rgba(201,168,76,0.12)"
          : "0 2px 8px rgba(0,0,0,0.2)",
      }}
    >
            
      <div
        style={{
          color: hovered ? "#E8C46A" : "#C9A84C",
          transition: "color 0.25s ease",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
                {icon}
              
      </div>
            
      <p
        style={{
          margin: 0,
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 12,
          fontWeight: 600,
          color: "#F5F0E8",
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          textAlign: "center",
        }}
      >
                {title}
              
      </p>
            
      <p
        style={{
          margin: 0,
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 12,
          color: "rgba(245,240,232,0.45)",
          textAlign: "center",
          lineHeight: 1.5,
        }}
      >
                {desc}
              
      </p>
          
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────
function SunIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="28"
      height="28"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
            
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2" x2="12" y2="5" />
      <line x1="12" y1="19" x2="12" y2="22" />
            
      <line x1="2" y1="12" x2="5" y2="12" />
      <line x1="19" y1="12" x2="22" y2="12" />
            
      <line x1="4.22" y1="4.22" x2="6.34" y2="6.34" />
      <line x1="17.66" y1="17.66" x2="19.78" y2="19.78" />
            
      <line x1="4.22" y1="19.78" x2="6.34" y2="17.66" />
      <line x1="17.66" y1="6.34" x2="19.78" y2="4.22" />
          
    </svg>
  );
}
function CornersIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="28"
      height="28"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
            
      <path d="M3 9V5a2 2 0 0 1 2-2h4" />
      <path d="M15 3h4a2 2 0 0 1 2 2v4" />
            
      <path d="M21 15v4a2 2 0 0 1-2 2h-4" />
      <path d="M9 21H5a2 2 0 0 1-2-2v-4" />
          
    </svg>
  );
}
function SmallCameraIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="28"
      height="28"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
            
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            
      <circle cx="12" cy="13" r="4" />
          
    </svg>
  );
}
function BackArrow() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="#C9A84C"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
            
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
          
    </svg>
  );
}
function QRIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
            
      <rect x="3" y="3" width="7" height="7" rx="1" />
            
      <rect x="14" y="3" width="7" height="7" rx="1" />
            
      <rect x="3" y="14" width="7" height="7" rx="1" />
            
      <rect
        x="5"
        y="5"
        width="3"
        height="3"
        fill="currentColor"
        stroke="none"
      />
            
      <rect
        x="16"
        y="5"
        width="3"
        height="3"
        fill="currentColor"
        stroke="none"
      />
            
      <rect
        x="5"
        y="16"
        width="3"
        height="3"
        fill="currentColor"
        stroke="none"
      />
            
      <path d="M14 14h3v3h-3z" fill="currentColor" stroke="none" />
            
      <path d="M17 17h4" />
      <path d="M17 14v7" />
      <path d="M21 14v3" />
          
    </svg>
  );
}
function UploadIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
            
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            
      <polyline points="17 8 12 3 7 8" />
            
      <line x1="12" y1="3" x2="12" y2="15" />
          
    </svg>
  );
}

// ─── QR Panel ─────────────────────────────────────────────────────────────────
function QRPanel({
  visible,
  sessionId,
  baseUrl,
  onPhotoReceived,
}: {
  visible: boolean;
  sessionId: string | null;
  baseUrl: string;
  onPhotoReceived: (dataUrl: string) => void;
}) {
  const [waitStatus, setWaitStatus] = useState<"waiting" | "received">(
    "waiting",
  );
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const scanUrl = sessionId ? `${baseUrl}/scan/${sessionId}` : ""; // Start polling when we have a session ID

  useEffect(() => {
    if (!sessionId || !visible) return;
    setWaitStatus("waiting");

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/poll/${sessionId}`);
        const data = await res.json();
        if (data.status === "ready" && data.photo) {
          clearInterval(pollRef.current!);
          setWaitStatus("received");
          onPhotoReceived(data.photo);
        }
      } catch {
        // silent
      }
    }, 1500);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [sessionId, visible, onPhotoReceived]); // Stop polling when hidden

  useEffect(() => {
    if (!visible && pollRef.current) {
      clearInterval(pollRef.current);
    }
  }, [visible]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 20,
        padding: "36px 28px",
        borderRadius: 20,
        background: "rgba(255,255,255,0.04)",
        border: `1px solid ${waitStatus === "received" ? "rgba(201,168,76,0.85)" : "rgba(201,168,76,0.2)"}`,
        position: "relative",
        overflow: "hidden",
        transition: "border-color 0.4s ease",
      }}
    >
            {/* Subtle inner glow */}
            
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.06) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />
            
      {waitStatus === "received" ? (
        /* ── Success state ── */
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 14,
            padding: "12px 0",
          }}
        >
                    
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: "#C9A84C",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 0 32px rgba(201,168,76,0.5)",
              animation: "popIn 0.45s cubic-bezier(0.34,1.56,0.64,1) forwards",
            }}
          >
                        
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none">
                            
              <path
                d="M4 12.5L9 17.5L20 7"
                stroke="#091829"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
                          
            </svg>
                      
          </div>
                    
          <p
            style={{
              margin: 0,
              fontFamily: "'Playfair Display', serif",
              fontSize: 18,
              color: "#F5F0E8",
              textAlign: "center",
            }}
          >
                        Photo received from your phone           
          </p>
                    
          <p
            style={{
              margin: 0,
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13,
              color: "rgba(245,240,232,0.45)",
              textAlign: "center",
            }}
          >
                        Your image has been loaded into the upload zone.
                      
          </p>
                  
        </div>
      ) : (
        /* ── QR waiting state ── */
        <>
                    
          <div style={{ textAlign: "center" }}>
                        
            <p
              style={{
                margin: "0 0 4px",
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 11,
                fontWeight: 600,
                color: "#C9A84C",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
                            Scan with your phone             
            </p>
                        
            <p
              style={{
                margin: 0,
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 13,
                color: "rgba(245,240,232,0.45)",
                lineHeight: 1.6,
              }}
            >
                            Open your camera app and point it at the code below
                          
            </p>
                      
          </div>
                    {/* QR Code */}
                    
          <div
            style={{
              padding: 16,
              background: "#F5F0E8",
              borderRadius: 16,
              boxShadow:
                "0 0 40px rgba(201,168,76,0.2), 0 8px 32px rgba(0,0,0,0.4)",
              position: "relative",
            }}
          >
                        
            {sessionId ? (
              <QRCode
                value={scanUrl}
                size={180}
                bgColor="#F5F0E8"
                fgColor="#091829"
                level="M"
              />
            ) : (
              <div
                style={{
                  width: 180,
                  height: 180,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "rgba(9,24,41,0.4)",
                  fontSize: 13,
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                                Generating…               
              </div>
            )}
                        {/* Corner accents */}
                        
            {[
              {
                top: -2,
                left: -2,
                borderTop: "3px solid #C9A84C",
                borderLeft: "3px solid #C9A84C",
              },
              {
                top: -2,
                right: -2,
                borderTop: "3px solid #C9A84C",
                borderRight: "3px solid #C9A84C",
              },
              {
                bottom: -2,
                left: -2,
                borderBottom: "3px solid #C9A84C",
                borderLeft: "3px solid #C9A84C",
              },
              {
                bottom: -2,
                right: -2,
                borderBottom: "3px solid #C9A84C",
                borderRight: "3px solid #C9A84C",
              },
            ].map((s, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  width: 18,
                  height: 18,
                  borderRadius: 2,
                  ...s,
                }}
              />
            ))}
                      
          </div>
                    {/* Waiting indicator */}
                    
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        
            <div style={{ display: "flex", gap: 5 }}>
                            
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "#C9A84C",
                    opacity: 0.6,
                    animation: `dotPulse 1.4s ease-in-out ${i * 0.2}s infinite`,
                  }}
                />
              ))}
                          
            </div>
                        
            <p
              style={{
                margin: 0,
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 12,
                color: "rgba(245,240,232,0.35)",
                letterSpacing: "0.04em",
              }}
            >
                            Waiting for photo…             
            </p>
                      
          </div>
                    {/* URL fallback */}
                    
          {scanUrl && (
            <div
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: 10,
                background: "rgba(201,168,76,0.06)",
                border: "1px solid rgba(201,168,76,0.12)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
                            
              <p
                style={{
                  margin: 0,
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 11,
                  color: "rgba(245,240,232,0.35)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  flex: 1,
                }}
              >
                                {scanUrl}
                              
              </p>
                            
              <button
                onClick={() => navigator.clipboard?.writeText(scanUrl)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#C9A84C",
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  padding: "2px 6px",
                  borderRadius: 6,
                  flexShrink: 0,
                  opacity: 0.8,
                  transition: "opacity 0.2s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.8")}
              >
                                Copy               
              </button>
                          
            </div>
          )}
                  
        </>
      )}
          
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function RoomPhotoUpload() {
  const router = useRouter();
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progressFill, setProgressFill] = useState(0);
  const [activeTab, setActiveTab] = useState<"upload" | "qr">("upload");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const inputRef = useRef<HTMLInputElement>(null); // Staggered entrance

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(t);
  }, []);

  // Auth gate
  useEffect(() => {
    const checkAuth = async () => {
      const { createBrowserClient } = await import("@/lib/supabase/client");
      const supabase = createBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) router.push("/auth?next=/design/step-6");
    };
    checkAuth();
  }, [router]); // Animate progress bar

  useEffect(() => {
    if (!mounted) return;
    const t = setTimeout(() => setProgressFill(100), 300);
    return () => clearTimeout(t);
  }, [mounted]); // Capture base URL for QR code

  useEffect(() => {
    setBaseUrl(window.location.origin);
  }, []); // Create a session when QR tab is activated

  useEffect(() => {
    if (activeTab !== "qr" || sessionId) return;
    fetch("/api/session", { method: "POST" })
      .then((r) => r.json())
      .then((d) => setSessionId(d.id))
      .catch(() => {});
  }, [activeTab, sessionId]);

  const handleFile = useCallback((f: File) => {
    setFile(f);
    const url = URL.createObjectURL(f);
    setPreview(url);
  }, []);

  const handlePhotoFromPhone = useCallback((dataUrl: string) => {
    setPreview(dataUrl); // Create a synthetic File object so the CTA unlocks
    fetch(dataUrl)
      .then((r) => r.blob())
      .then((blob) => {
        const f = new File([blob], "phone-photo.jpg", { type: blob.type });
        setFile(f);
      }); // Switch to upload tab to show the preview
    setTimeout(() => setActiveTab("upload"), 800);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);
  const onDragLeave = useCallback(() => setDragOver(false), []);
  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) handleFile(f);
    },
    [handleFile],
  );

  const openPicker = () => inputRef.current?.click();

  const uploadZoneBorder = dragOver
    ? "2px solid #C9A84C"
    : file
      ? "2px solid rgba(201,168,76,0.85)"
      : "2px dashed rgba(201,168,76,0.3)";

  const uploadZoneBg = dragOver
    ? "rgba(201,168,76,0.07)"
    : "rgba(255,255,255,0.04)";

  const tipCards = useMemo(
    () => [
      {
        icon: <SunIcon />,
        title: "Good lighting",
        desc: "Natural light works best",
        delay: 600,
      },
      {
        icon: <CornersIcon />,
        title: "Full room view",
        desc: "Capture the whole space",
        delay: 700,
      },
      {
        icon: <SmallCameraIcon />,
        title: "Steady shot",
        desc: "Avoid blur for best results",
        delay: 800,
      },
    ],
    [],
  );

  return (
    <>
            
      
            
      <div
        style={{
          minHeight: "100vh",
          background: "#091829",
          position: "relative",
          overflowX: "hidden",
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
                
        <ParticleField />
                {/* Radial glow */}
                
        <div
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 700,
            height: 500,
            borderRadius: "50%",
            background:
              "radial-gradient(ellipse at center, rgba(201,168,76,0.07) 0%, transparent 70%)",
            pointerEvents: "none",
            zIndex: 1,
          }}
        />
                {/* ── NAV ── */}
                
        <nav
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            height: 64,
            background: "rgba(9,24,41,0.88)",
            backdropFilter: "blur(18px)",
            WebkitBackdropFilter: "blur(18px)",
            borderBottom: "1px solid rgba(201,168,76,0.12)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 28px",
            zIndex: 100,
            opacity: mounted ? 1 : 0,
            transition: "opacity 0.5s ease",
          }}
        >
                    
          <button
            onClick={() => router.push("/design/step-5")}
            aria-label="Back to previous step"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "6px 8px",
              display: "flex",
              alignItems: "center",
              gap: 6,
              color: "#C9A84C",
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13,
              letterSpacing: "0.03em",
              opacity: 0.8,
              transition: "opacity 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.8")}
          >
                        
            <BackArrow /> Back           
          </button>
                    
          <button
            onClick={() => router.push("/")}
            aria-label="Cova — home"
            style={{
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              fontFamily: "'Playfair Display', serif",
              fontSize: 22,
              fontWeight: 600,
              color: "#C9A84C",
              letterSpacing: "0.06em",
              position: "absolute",
              left: "50%",
              transform: "translateX(-50%)",
            }}
          >
            Cova
          </button>
                    
          <span
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 12,
              color: "rgba(245,240,232,0.45)",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
                        Step 4 of 4           
          </span>
                  
        </nav>
                {/* ── PROGRESS BAR ── */}
                
        <div
          style={{
            position: "fixed",
            top: 64,
            left: 0,
            right: 0,
            height: 3,
            background: "rgba(201,168,76,0.12)",
            zIndex: 100,
          }}
        >
                    
          <div
            style={{
              height: "100%",
              width: `${progressFill}%`,
              background: "linear-gradient(90deg, #A07830, #C9A84C, #E8C46A)",
              transition: "width 1.1s cubic-bezier(0.22,1,0.36,1) 0.4s",
              boxShadow: "0 0 12px rgba(201,168,76,0.6)",
            }}
          />
                  
        </div>
                {/* ── MAIN CONTENT ── */}
                
        <main
          style={{
            position: "relative",
            zIndex: 2,
            paddingTop: 96,
            paddingBottom: 60,
            paddingLeft: 20,
            paddingRight: 20,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
                    
          <div style={{ width: "100%", maxWidth: 720 }}>
                        {/* Eyebrow */}
                        
            <p
              style={{
                margin: "0 0 12px",
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 11,
                fontWeight: 600,
                color: "#C9A84C",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                textAlign: "center",
                opacity: mounted ? 1 : 0,
                transform: mounted ? "translateY(0)" : "translateY(20px)",
                transition:
                  "opacity 0.55s ease 0.1s, transform 0.55s cubic-bezier(0.22,1,0.36,1) 0.1s",
              }}
            >
                            Your Space             
            </p>
                        {/* Headline */}
                        
            <h1
              style={{
                margin: "0 0 14px",
                fontFamily: "'Playfair Display', serif",
                fontSize: "clamp(32px, 5vw, 48px)",
                fontWeight: 600,
                color: "#F5F0E8",
                textAlign: "center",
                lineHeight: 1.15,
                letterSpacing: "-0.01em",
                opacity: mounted ? 1 : 0,
                transform: mounted ? "translateY(0)" : "translateY(20px)",
                transition:
                  "opacity 0.55s ease 0.18s, transform 0.55s cubic-bezier(0.22,1,0.36,1) 0.18s",
              }}
            >
                            Show us your room.             
            </h1>
                        {/* Subtext */}
                        
            <p
              style={{
                margin: "0 0 32px",
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 16,
                color: "rgba(245,240,232,0.55)",
                textAlign: "center",
                lineHeight: 1.6,
                opacity: mounted ? 1 : 0,
                transform: mounted ? "translateY(0)" : "translateY(20px)",
                transition:
                  "opacity 0.55s ease 0.26s, transform 0.55s cubic-bezier(0.22,1,0.36,1) 0.26s",
              }}
            >
                            One photo is all we need. We&apos;ll handle the
              rest.             
            </p>
                        {/* ── TAB SWITCHER ── */}
                        
            <div
              style={{
                display: "flex",
                gap: 0,
                marginBottom: 20,
                background: "rgba(255,255,255,0.04)",
                borderRadius: 100,
                padding: 4,
                border: "1px solid rgba(201,168,76,0.12)",
                width: "fit-content",
                alignSelf: "center",
                margin: "0 auto 24px",
                opacity: mounted ? 1 : 0,
                transform: mounted ? "translateY(0)" : "translateY(20px)",
                transition:
                  "opacity 0.55s ease 0.32s, transform 0.55s cubic-bezier(0.22,1,0.36,1) 0.32s",
              }}
            >
                            
              {(["upload", "qr"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    padding: "9px 20px",
                    borderRadius: 100,
                    border: "none",
                    cursor: "pointer",
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 13,
                    fontWeight: 500,
                    letterSpacing: "0.03em",
                    background:
                      activeTab === tab
                        ? "linear-gradient(135deg, #A07830, #C9A84C)"
                        : "transparent",
                    color:
                      activeTab === tab ? "#091829" : "rgba(245,240,232,0.5)",
                    transition: "background 0.3s ease, color 0.3s ease",
                    boxShadow:
                      activeTab === tab
                        ? "0 2px 12px rgba(201,168,76,0.3)"
                        : "none",
                  }}
                >
                                    
                  {tab === "upload" ? <UploadIcon /> : <QRIcon />}
                                    
                  {tab === "upload" ? "Upload File" : "Scan QR Code"}
                                  
                </button>
              ))}
                          
            </div>
                        {/* ── UPLOAD ZONE (tab: upload) ── */}
                        
            {activeTab === "upload" && (
              <div
                onClick={openPicker}
                onDrop={onDrop}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                className={dragOver ? "upload-zone-pulse" : ""}
                style={{
                  position: "relative",
                  width: "100%",
                  minHeight: 300,
                  borderRadius: 20,
                  border: uploadZoneBorder,
                  background: uploadZoneBg,
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 14,
                  padding: "40px 24px",
                  overflow: "hidden",
                  transition: "border 0.3s ease, background 0.3s ease",
                  opacity: mounted ? 1 : 0,
                  transform: mounted ? "translateY(0)" : "translateY(24px)",
                  transitionProperty: "opacity, transform, border, background",
                  transitionDuration: "0.6s, 0.6s, 0.3s, 0.3s",
                  transitionDelay: "0.38s, 0.38s, 0s, 0s",
                  transitionTimingFunction:
                    "ease, cubic-bezier(0.22,1,0.36,1), ease, ease",
                }}
              >
                                
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: 20,
                    background:
                      "radial-gradient(ellipse at 50% 60%, rgba(201,168,76,0.06) 0%, transparent 65%)",
                    pointerEvents: "none",
                  }}
                />
                                
                {preview && (
                  <div
                    className="photo-enter"
                    style={{
                      position: "absolute",
                      inset: 0,
                      borderRadius: 18,
                      overflow: "hidden",
                    }}
                  >
                                        
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                        
                    <img
                      src={preview}
                      alt="Room preview"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                                        
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        background: "rgba(9,24,41,0.35)",
                      }}
                    />
                                      
                  </div>
                )}
                                
                <CheckBadge visible={!!file} />
                                
                {!preview && (
                  <div
                    className="camera-bob"
                    style={{
                      perspective: "400px",
                      transformStyle: "preserve-3d",
                    }}
                  >
                                        
                    <CameraIcon scale={dragOver ? 1.2 : 1} glow={dragOver} />
                                      
                  </div>
                )}
                                
                <div
                  style={{
                    position: "relative",
                    zIndex: 3,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 6,
                    marginTop: preview ? 0 : 4,
                  }}
                >
                                    
                  <p
                    style={{
                      margin: 0,
                      fontFamily: "'Playfair Display', serif",
                      fontSize: preview ? 20 : 22,
                      fontWeight: 500,
                      color: preview ? "rgba(245,240,232,0.9)" : "#F5F0E8",
                      textAlign: "center",
                      letterSpacing: "-0.01em",
                    }}
                  >
                                        
                    {preview ? file?.name : "Drop your photo here"}
                                      
                  </p>
                                    
                  {!preview && (
                    <p
                      style={{
                        margin: 0,
                        fontFamily: "'DM Sans', sans-serif",
                        fontSize: 14,
                        color: "rgba(245,240,232,0.45)",
                      }}
                    >
                                            or click to browse
                                          
                    </p>
                  )}
                                    
                  <p
                    style={{
                      margin: preview ? "4px 0 0" : "8px 0 0",
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 11,
                      color: "rgba(245,240,232,0.3)",
                      letterSpacing: "0.04em",
                    }}
                  >
                                        
                    {preview
                      ? "Click to replace"
                      : "JPG, PNG, HEIC — up to 20MB"}
                                      
                  </p>
                                  
                </div>
                              
              </div>
            )}
                        {/* ── QR PANEL (tab: qr) ── */}
                        
            {activeTab === "qr" && (
              <div
                style={{
                  opacity: mounted ? 1 : 0,
                  transform: mounted ? "translateY(0)" : "translateY(24px)",
                  transition:
                    "opacity 0.5s ease 0.1s, transform 0.5s cubic-bezier(0.22,1,0.36,1) 0.1s",
                }}
              >
                                
                <QRPanel
                  visible={activeTab === "qr"}
                  sessionId={sessionId}
                  baseUrl={baseUrl}
                  onPhotoReceived={handlePhotoFromPhone}
                />
                              
              </div>
            )}
                        {/* Hidden file input */}
                        
            <input
              ref={inputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.heic,.heif,image/jpeg,image/png,image/heic,image/heif"
              capture="environment"
              style={{ display: "none" }}
              onChange={onInputChange}
            />
                        {/* ── TIP CARDS ── */}
                        
            <div
              style={{
                display: "flex",
                gap: 14,
                marginTop: 24,
                flexWrap: "wrap",
              }}
            >
                            
              {tipCards.map((card) => (
                <TipCard
                  key={card.title}
                  icon={card.icon}
                  title={card.title}
                  desc={card.desc}
                  delay={card.delay}
                  visible={mounted}
                />
              ))}
                          
            </div>
                        {/* ── CTA BUTTON ── */}
                        
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 14,
                marginTop: 36,
                opacity: mounted ? 1 : 0,
                transform: mounted ? "translateY(0)" : "translateY(20px)",
                transition:
                  "opacity 0.55s ease 0.9s, transform 0.55s cubic-bezier(0.22,1,0.36,1) 0.9s",
              }}
            >
                            
              <button
                disabled={!file || uploading}
                onClick={async () => {
                  if (!file) return;
                  setUploading(true);
                  try {
                    // Upload photo to Supabase via /api/rooms/capture
                    const fd = new FormData();
                    fd.append("photo", file);
                    const uploadRes = await fetch("/api/rooms/capture", {
                      method: "POST",
                      body: fd,
                    });
                    if (uploadRes.ok) {
                      const uploadData = await uploadRes.json() as { room_id: string; photo_url: string };
                      // Fire pre-detection pipeline (non-blocking)
                      fetch("/api/pipeline/pre-detect", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          room_id: uploadData.room_id,
                          photo_url: uploadData.photo_url,
                        }),
                      }).catch((err) =>
                        console.warn("[step-6] Pre-detection trigger failed:", err)
                      );
                    }
                  } catch (err) {
                    console.warn("[step-6] Photo upload failed:", err);
                  }
                  setUploading(false);
                  router.push("/design/step-7");
                }}
                className={file ? "btn-pulse" : ""}
                style={{
                  padding: "16px 48px",
                  borderRadius: 100,
                  border: "none",
                  cursor: file ? "pointer" : "not-allowed",
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 15,
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  background: file
                    ? "linear-gradient(135deg, #A07830 0%, #C9A84C 50%, #E8C46A 100%)"
                    : "rgba(255,255,255,0.06)",
                  color: file ? "#091829" : "rgba(245,240,232,0.25)",
                  transition:
                    "background 0.4s ease, color 0.4s ease, transform 0.2s ease",
                  transform: "scale(1)",
                }}
                onMouseEnter={(e) => {
                  if (file) e.currentTarget.style.transform = "scale(1.03)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "scale(1)";
                }}
              >
                                Analyze My Room &rarr;               
              </button>
                            
              <p
                style={{
                  margin: 0,
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 12,
                  color: "#C9A84C",
                  letterSpacing: "0.04em",
                  opacity: 0.75,
                }}
              >
                                ✦ AI analysis takes about 30 seconds
                              
              </p>
                          
            </div>
                      
          </div>
                  
        </main>
              
      </div>
          
    </>
  );
}

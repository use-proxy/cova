"use client";

import "./step8b.css";

import { Suspense, useEffect, useRef, useState, type MouseEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

interface DetectResp {
  object_label: string;
  mask_url: string;
  bbox: [number, number, number, number] | null;
  confidence: number | null;
  tap_pixel: { x: number; y: number };
}

interface ApplyResp {
  render_url: string;
  tier_used: string;
  refined_instruction: string;
  suggested_chips: string[];
  version: number;
  soft_cap_reached?: boolean;
}

interface RoomRow {
  id: string;
  room_type: string | null;
  redesign_pano_url: string | null;
  render_context: Record<string, unknown> | null;
}

interface HistoryItem {
  render_url: string;
  version: number;
  instruction?: string;
}

function supabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

function Step8BPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const imgRef = useRef<HTMLImageElement | null>(null);

  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomType, setRoomType] = useState<string>("room");
  const [renderUrl, setRenderUrl] = useState<string | null>(null);
  const [originalRender, setOriginalRender] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [chips, setChips] = useState<string[]>([]);
  const [chatText, setChatText] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showBefore, setShowBefore] = useState(false);

  const [tapMenu, setTapMenu] = useState<{
    x: number;
    y: number;
    object_label: string;
    mask_url: string;
  } | null>(null);

  // Load room on mount
  useEffect(() => {
    async function load() {
      const id =
        searchParams.get("roomId") ??
        (typeof document !== "undefined"
          ? document.cookie
              .split("; ")
              .find((c) => c.startsWith("cova_room_id="))
              ?.split("=")[1] ?? null
          : null);
      if (!id) return;
      setRoomId(id);
      const sb = supabase();
      const { data } = await sb
        .from("rooms")
        .select("id, room_type, redesign_pano_url, render_context")
        .eq("id", id)
        .single<RoomRow>();
      if (!data) return;
      setRoomType(data.room_type ?? "room");
      if (data.redesign_pano_url) {
        setRenderUrl(data.redesign_pano_url);
        setOriginalRender(data.redesign_pano_url);
      }
      const ctx = (data.render_context ?? {}) as Record<string, unknown>;
      const initialChips = (ctx.qa as Record<string, unknown> | undefined)?.suggested_chips;
      if (Array.isArray(initialChips)) {
        setChips(initialChips.map(String).slice(0, 3));
      }
    }
    void load();
  }, [searchParams]);

  async function runApply(
    instruction: string,
    mask_url?: string,
    object_label?: string,
  ) {
    if (!roomId || !renderUrl || !instruction.trim()) return;
    setBusy(true);
    setBusyLabel(mask_url ? `Updating ${object_label ?? "selection"}…` : "Applying…");
    setError(null);
    try {
      const res = await fetch("/api/render/refinement/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room_id: roomId,
          render_url: renderUrl,
          instruction,
          mask_url,
          object_label,
          room_type: roomType,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`apply ${res.status}: ${text.slice(0, 200)}`);
      }
      const data = (await res.json()) as ApplyResp;
      setHistory((h) => [
        ...h,
        { render_url: data.render_url, version: data.version, instruction },
      ]);
      setRenderUrl(data.render_url);
      setChips(data.suggested_chips?.slice(0, 3) ?? []);
      setChatText("");
      setTapMenu(null);
      if (data.soft_cap_reached) {
        setError("You've used 10 refinements — close to the 20 hard cap.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  }

  async function handleImageClick(e: MouseEvent<HTMLImageElement>) {
    if (busy || !renderUrl || !imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const tap_x = (e.clientX - rect.left) / rect.width;
    const tap_y = (e.clientY - rect.top) / rect.height;
    const render_width = imgRef.current.naturalWidth;
    const render_height = imgRef.current.naturalHeight;
    setBusy(true);
    setBusyLabel("Detecting object…");
    setError(null);
    try {
      const res = await fetch("/api/render/refinement/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          render_url: renderUrl,
          tap_x,
          tap_y,
          render_width,
          render_height,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`detect ${res.status}: ${text.slice(0, 200)}`);
      }
      const data = (await res.json()) as DetectResp;
      setTapMenu({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        object_label: data.object_label,
        mask_url: data.mask_url,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  }

  function applyTapAction(action: "replace" | "remove" | "adjust") {
    if (!tapMenu) return;
    const label = tapMenu.object_label;
    let instruction = "";
    if (action === "replace") {
      instruction = `Replace the ${label} with a different one that matches the style`;
    } else if (action === "remove") {
      instruction = `Remove the ${label} cleanly`;
    } else {
      instruction = `Adjust the ${label} — reposition, resize, or restyle it`;
    }
    void runApply(instruction, tapMenu.mask_url, label);
  }

  function submitChat() {
    if (!chatText.trim()) return;
    void runApply(chatText.trim());
  }

  return (
    <div className="step8b-page">
      <header className="step8b-top-nav">
        <button
          type="button"
          className="step8b-top-link"
          onClick={() => router.push("/design/step-8a")}
        >
          ← Back to reveal
        </button>
        <button
          type="button"
          className="step8b-brand"
          onClick={() => router.push("/")}
          style={{ background: "none", border: "none", cursor: "pointer" }}
        >
          Cova
        </button>
        <div className="step8b-nav-status">
          {history.length} refinements · {roomType.replace("_", " ")}
        </div>
      </header>

      <main className="step8b-shell">
        {/* Left: render viewport */}
        <section
          className="step8b-context-column"
          style={{ position: "relative" }}
        >
          <div
            className="step8b-render-frame"
            style={{ padding: 0, background: "#0A1628" }}
          >
            {renderUrl ? (
              <div style={{ position: "relative", lineHeight: 0 }}>
                <img
                  ref={imgRef}
                  src={showBefore ? (originalRender ?? renderUrl) : renderUrl}
                  alt="Current render"
                  onClick={handleImageClick}
                  style={{
                    display: "block",
                    width: "100%",
                    height: "auto",
                    maxHeight: "calc(100vh - 240px)",
                    objectFit: "contain",
                    cursor: busy ? "wait" : "crosshair",
                    borderRadius: 12,
                  }}
                />
                {tapMenu && (
                  <div
                    style={{
                      position: "absolute",
                      left: tapMenu.x,
                      top: tapMenu.y,
                      transform: "translate(-50%, -100%)",
                      background: "#0F1F3D",
                      border: "1px solid #1E3A5F",
                      borderRadius: 12,
                      padding: 12,
                      boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                      color: "#F8F6F1",
                      zIndex: 20,
                      minWidth: 200,
                    }}
                  >
                    <div style={{ fontSize: 12, color: "#8BA3C0", marginBottom: 8 }}>
                      Detected:{" "}
                      <strong style={{ color: "#F0D080" }}>
                        {tapMenu.object_label}
                      </strong>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => applyTapAction("replace")}
                        style={actionBtn}
                      >
                        Replace
                      </button>
                      <button
                        type="button"
                        onClick={() => applyTapAction("remove")}
                        style={actionBtn}
                      >
                        Remove
                      </button>
                      <button
                        type="button"
                        onClick={() => applyTapAction("adjust")}
                        style={actionBtn}
                      >
                        Adjust
                      </button>
                      <button
                        type="button"
                        onClick={() => setTapMenu(null)}
                        style={{ ...actionBtn, background: "transparent", color: "#8BA3C0" }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                {busy && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "rgba(10,22,40,0.65)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#F0D080",
                      borderRadius: 12,
                    }}
                  >
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 18, marginBottom: 8 }}>{busyLabel || "Working…"}</div>
                      <div className="step8b-button-spinner" />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ padding: 48, color: "#8BA3C0", textAlign: "center" }}>
                No render yet. Return to <a href="/design/step-8a" style={{ color: "#F0D080" }}>reveal</a>.
              </div>
            )}
          </div>

          {originalRender && originalRender !== renderUrl && (
            <button
              type="button"
              onClick={() => setShowBefore((b) => !b)}
              onMouseDown={() => setShowBefore(true)}
              onMouseUp={() => setShowBefore(false)}
              onMouseLeave={() => setShowBefore(false)}
              style={{
                marginTop: 12,
                background: "transparent",
                color: "#8BA3C0",
                border: "1px solid #1E3A5F",
                borderRadius: 24,
                padding: "8px 20px",
                cursor: "pointer",
              }}
            >
              {showBefore ? "Showing original" : "Hold to see original"}
            </button>
          )}

          {history.length > 0 && (
            <div style={{ marginTop: 16, display: "flex", gap: 8, overflowX: "auto" }}>
              {originalRender && (
                <button
                  type="button"
                  onClick={() => setRenderUrl(originalRender)}
                  style={thumbBtn(renderUrl === originalRender)}
                >
                  <img src={originalRender} alt="v0" style={thumbImg} />
                  <span style={{ fontSize: 11, color: "#8BA3C0" }}>v0</span>
                </button>
              )}
              {history.map((h) => (
                <button
                  key={h.version}
                  type="button"
                  onClick={() => setRenderUrl(h.render_url)}
                  style={thumbBtn(renderUrl === h.render_url)}
                >
                  <img src={h.render_url} alt={`v${h.version}`} style={thumbImg} />
                  <span style={{ fontSize: 11, color: "#8BA3C0" }}>v{h.version}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Right: chips + chat */}
        <section className="step8b-panel-column">
          <div className="step8b-panel-shell" style={{ padding: 24 }}>
            <div className="step8b-heading-block">
              <p className="step8b-eyebrow">REFINE YOUR ROOM</p>
              <h1 className="step8b-title" style={{ fontSize: 28 }}>
                Tap anywhere on the render, or describe a change.
              </h1>
              <p className="step8b-subtitle">
                Click an object on the left to replace, remove, or adjust it. Or use the chat to describe something general.
              </p>
            </div>

            {chips.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: "#8BA3C0", marginBottom: 8 }}>
                  Suggested refinements
                </div>
                <div className="step8b-chip-row">
                  {chips.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      className="step8b-chip"
                      disabled={busy}
                      onClick={() => void runApply(chip)}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginTop: 12 }}>
              <label className="step8b-textarea-shell" htmlFor="step8b-chat">
                <textarea
                  id="step8b-chat"
                  className="step8b-textarea"
                  placeholder="e.g. 'make the lighting warmer', 'swap the rug for something lighter', 'add more plants'"
                  value={chatText}
                  disabled={busy}
                  onChange={(e) => setChatText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      submitChat();
                    }
                  }}
                />
              </label>
              <div className="step8b-cta-row" style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className="step8b-main-cta"
                  disabled={busy || !chatText.trim()}
                  onClick={submitChat}
                >
                  {busy ? "Working…" : "Apply change"}
                </button>
              </div>
            </div>

            {error && (
              <div style={{ color: "#C0504A", marginTop: 16, fontSize: 13 }}>
                {error}
              </div>
            )}
          </div>

          <div style={{ padding: "12px 24px", borderTop: "1px solid #1E3A5F", marginTop: "auto" }}>
            <button
              type="button"
              onClick={() => router.push("/design/step-9")}
              style={{
                background: "#C9A84C",
                color: "#0A1628",
                border: "none",
                borderRadius: 24,
                padding: "10px 24px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Shop this render →
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

export default function Step8BPage() {
  return (
    <Suspense fallback={null}>
      <Step8BPageInner />
    </Suspense>
  );
}

const actionBtn: React.CSSProperties = {
  background: "#C9A84C",
  color: "#0A1628",
  border: "none",
  borderRadius: 20,
  padding: "6px 14px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

function thumbBtn(active: boolean): React.CSSProperties {
  return {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
    background: "transparent",
    border: active ? "2px solid #C9A84C" : "1px solid #1E3A5F",
    borderRadius: 8,
    padding: 4,
    cursor: "pointer",
    flexShrink: 0,
  };
}

const thumbImg: React.CSSProperties = {
  width: 64,
  height: 48,
  objectFit: "cover",
  borderRadius: 4,
  display: "block",
};

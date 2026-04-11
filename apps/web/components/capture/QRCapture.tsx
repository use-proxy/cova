"use client";

import { useEffect, useState, useCallback } from "react";
import QRCode from "react-qr-code";
import { createBrowserClient } from "@/lib/supabase/client";

interface QRCaptureProps {
  roomId: string;
  onPhotoReceived: (photoUrl: string) => void;
  onError: (error: string) => void;
}

type QRStatus = "generating" | "waiting" | "received" | "error";

export function QRCapture({
  roomId,
  onPhotoReceived,
  onError,
}: QRCaptureProps) {
  const [status, setStatus] = useState<QRStatus>("generating");
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [timeoutId, setTimeoutId] = useState<ReturnType<
    typeof setTimeout
  > | null>(null);

  const generateToken = useCallback(async () => {
    setStatus("generating");
    try {
      const response = await fetch("/api/capture/generate-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room_id: roomId }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate QR token");
      }

      const data = (await response.json()) as { token?: string; url?: string };

      // Support both { token } (new) and { url } (legacy) response shapes
      let token = data.token;
      if (!token && data.url) {
        const urlObj = new URL(data.url, window.location.origin);
        token = urlObj.searchParams.get("token") ?? undefined;
      }

      if (!token) throw new Error("No token in response");

      setQrToken(token);
      const mobileUrl = `${window.location.origin}/capture/mobile/${token}`;
      setQrUrl(mobileUrl);
      setStatus("waiting");

      // Expire after 10 minutes
      const tid = setTimeout(
        () => {
          setStatus("error");
          onError("QR code expired. Please refresh to try again.");
        },
        10 * 60 * 1000,
      );
      setTimeoutId(tid);
    } catch {
      setStatus("error");
      onError("Could not generate QR code. Please try again.");
    }
  }, [roomId, onError]);

  useEffect(() => {
    generateToken();
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Subscribe to Supabase realtime for photo delivery
  useEffect(() => {
    if (!qrToken || status !== "waiting") return;

    const supabase = createBrowserClient();

    const channel = supabase
      .channel(`capture:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "rooms",
          filter: `id=eq.${roomId}`,
        },
        (payload) => {
          const newRecord = payload.new as { original_photo_url?: string };
          if (newRecord.original_photo_url) {
            setStatus("received");
            if (timeoutId) clearTimeout(timeoutId);
            onPhotoReceived(newRecord.original_photo_url);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qrToken, roomId, status, onPhotoReceived, timeoutId]);

  if (status === "generating") {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "16px",
        }}
      >
        <div
          style={{
            width: 200,
            height: 200,
            background: "var(--color-navy-card)",
            borderRadius: "12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "1px solid var(--color-navy-border)",
          }}
        >
          <div
            style={{
              width: 24,
              height: 24,
              border: "2px solid #C9A84C",
              borderTopColor: "transparent",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
            }}
          />
        </div>
      </div>
    );
  }

  if (status === "waiting" && qrUrl) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "24px",
        }}
      >
        <div
          style={{
            background: "white",
            padding: "16px",
            borderRadius: "12px",
            boxShadow: "0 0 20px rgba(201,168,76,0.2)",
          }}
        >
          <QRCode value={qrUrl} size={200} level="M" />
        </div>

        <div style={{ textAlign: "center" }}>
          <p
            style={{ fontSize: "14px", color: "#F8F6F1", marginBottom: "8px" }}
          >
            Scan with your phone camera
          </p>
          <p style={{ fontSize: "12px", color: "#8BA3C0" }}>
            Waiting for photo...
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#C9A84C",
              animation: "pulse 2s infinite",
            }}
          />
          <span style={{ fontSize: "12px", color: "#8BA3C0" }}>
            Listening for your photo
          </span>
        </div>

        <button
          onClick={generateToken}
          style={{
            background: "transparent",
            border: "none",
            color: "#8BA3C0",
            fontSize: "12px",
            cursor: "pointer",
            textDecoration: "underline",
          }}
        >
          Generate new QR code
        </button>
      </div>
    );
  }

  if (status === "received") {
    return (
      <div style={{ textAlign: "center" }}>
        <p style={{ color: "#C9A84C", fontSize: "18px" }}>
          ✓ Photo received from your phone
        </p>
      </div>
    );
  }

  return (
    <div style={{ textAlign: "center" }}>
      <p style={{ color: "#C0504A", marginBottom: "12px" }}>QR code expired</p>
      <button
        onClick={generateToken}
        style={{
          background: "#C9A84C",
          border: "none",
          borderRadius: "8px",
          padding: "8px 16px",
          color: "#0A1628",
          cursor: "pointer",
          fontWeight: 600,
        }}
      >
        Try again
      </button>
    </div>
  );
}

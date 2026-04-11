"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase/client";
import { MobileCapture } from "@/components/capture/MobileCapture";
import { CaptureResult } from "@/components/capture/CaptureResult";

type PageState =
  | "validating"
  | "ready"
  | "previewing"
  | "uploading"
  | "done"
  | "error";

export default function MobileCaptureTokenPage() {
  const params = useParams();
  const token = params.token as string;

  const [state, setState] = useState<PageState>("validating");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Step 1: Validate the token
  useEffect(() => {
    if (!token) {
      setState("error");
      setErrorMessage("Invalid capture link. Please scan the QR code again.");
      return;
    }

    const validate = async () => {
      try {
        // Set Supabase session from access_token in query if present (legacy compat)
        const searchParams = new URLSearchParams(window.location.search);
        const accessToken = searchParams.get("access_token");
        if (accessToken) {
          const supabase = createBrowserClient();
          await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: "",
          });
        }

        const response = await fetch("/api/capture/validate-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        if (!response.ok) {
          setState("error");
          setErrorMessage(
            "This QR code has expired. Please ask the desktop to generate a new one.",
          );
          return;
        }

        const data = (await response.json()) as {
          valid: boolean;
          roomId: string;
        };
        if (!data.valid || !data.roomId) {
          setState("error");
          setErrorMessage("Invalid QR code. Please scan the QR code again.");
          return;
        }

        setRoomId(data.roomId);
        setState("ready");
      } catch {
        setState("error");
        setErrorMessage(
          "Could not validate QR code. Check your connection and try again.",
        );
      }
    };

    validate();
  }, [token]);

  const handleFileSelected = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setSelectedFile(file);
    setState("previewing");
  }, []);

  const handleError = useCallback((message: string) => {
    setErrorMessage(message);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!selectedFile || !roomId) return;
    setState("uploading");

    try {
      const formData = new FormData();
      formData.append("photo", selectedFile);
      formData.append("room_id", roomId);

      const response = await fetch("/api/rooms/capture", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      // Clean up blob URL
      if (previewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }

      setState("done");
    } catch {
      setState("error");
      setErrorMessage(
        "Upload failed. Please check your connection and try again.",
      );
    }
  }, [selectedFile, roomId, previewUrl]);

  const handleRetake = useCallback(() => {
    if (previewUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setSelectedFile(null);
    setErrorMessage(null);
    setState("ready");
  }, [previewUrl]);

  if (state === "validating") {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#0A1628",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: 32,
              height: 32,
              border: "2px solid #C9A84C",
              borderTopColor: "transparent",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
              margin: "0 auto 16px",
            }}
          />
          <p style={{ color: "#8BA3C0", fontSize: "14px" }}>
            Checking QR code...
          </p>
        </div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#0A1628",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 320 }}>
          <p
            style={{ color: "#C0504A", fontSize: "16px", marginBottom: "12px" }}
          >
            {errorMessage ?? "Something went wrong."}
          </p>
          <p style={{ color: "#8BA3C0", fontSize: "14px" }}>
            Go back to your desktop and scan the QR code again.
          </p>
        </div>
      </div>
    );
  }

  if (state === "done") {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#0A1628",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: 64,
              height: 64,
              background: "#C9A84C",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 24px",
            }}
          >
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <polyline
                points="6,16 13,23 26,9"
                stroke="#0A1628"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h2
            style={{
              fontFamily: "EB Garamond, Georgia, serif",
              fontSize: "24px",
              color: "#F8F6F1",
              marginBottom: "8px",
              fontWeight: 400,
            }}
          >
            All done!
          </h2>
          <p style={{ color: "#8BA3C0", fontSize: "14px" }}>
            Your photo was sent. You can put your phone down.
          </p>
        </div>
      </div>
    );
  }

  if (state === "ready") {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#0A1628",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          gap: "24px",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <h1
            style={{
              fontFamily: "EB Garamond, Georgia, serif",
              fontSize: "24px",
              color: "#F8F6F1",
              marginBottom: "8px",
              fontWeight: 400,
            }}
          >
            Capture your room
          </h1>
          <p style={{ color: "#8BA3C0", fontSize: "14px" }}>
            Stand in the corner and take one photo
          </p>
        </div>

        {errorMessage && (
          <div
            style={{
              background: "rgba(192,80,74,0.1)",
              border: "1px solid #C0504A",
              borderRadius: "8px",
              padding: "12px 16px",
              maxWidth: 340,
            }}
          >
            <p style={{ color: "#C0504A", fontSize: "14px", margin: 0 }}>
              {errorMessage}
            </p>
          </div>
        )}

        <MobileCapture
          hasLiDAR={false}
          onFileSelected={handleFileSelected}
          onError={handleError}
        />
      </div>
    );
  }

  if ((state === "previewing" || state === "uploading") && previewUrl) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#0A1628",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
        }}
      >
        <CaptureResult
          photoUrl={previewUrl}
          onConfirm={handleConfirm}
          onRetake={handleRetake}
          isUploading={state === "uploading"}
        />
      </div>
    );
  }

  return null;
}

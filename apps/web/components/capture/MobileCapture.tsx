"use client";

import { useRef, useState, useCallback } from "react";
import { checkImageQuality } from "./QualityChecker";
import type { QualityResult } from "./QualityChecker";

interface MobileCaptureProps {
  hasLiDAR: boolean;
  onFileSelected: (file: File) => void;
  onError: (error: string) => void;
}

export function MobileCapture({
  hasLiDAR,
  onFileSelected,
  onError,
}: MobileCaptureProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [qualityResult, setQualityResult] = useState<QualityResult | null>(
    null,
  );

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setIsChecking(true);
      setQualityResult(null);

      try {
        const url = URL.createObjectURL(file);
        const img = new Image();

        img.onload = async () => {
          const result = await checkImageQuality(file, img);
          URL.revokeObjectURL(url);
          setQualityResult(result);
          setIsChecking(false);

          if (result.passed) {
            onFileSelected(file);
          } else {
            const errorIssue = result.issues.find(
              (i) => i.severity === "error",
            );
            if (errorIssue) {
              onError(errorIssue.message);
            }
          }
        };

        img.onerror = () => {
          URL.revokeObjectURL(url);
          setIsChecking(false);
          onError("Could not read photo. Please try another.");
        };

        img.src = url;
      } catch {
        setIsChecking(false);
        onError("Photo check failed. Please try again.");
      }
    },
    [onFileSelected, onError],
  );

  const openCamera = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleLiDAR = useCallback(() => {
    alert("LiDAR room scanning coming soon for Pro iPhones.");
  }, []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "24px",
      }}
    >
      {/* Hidden file input — rear camera */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        style={{ display: "none" }}
        aria-label="Take photo with rear camera"
      />

      {/* Framing guide */}
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 340,
          aspectRatio: "4/3",
          border: "2px dashed #C9A84C",
          borderRadius: "12px",
          background: "#0F1F3D",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {/* Rule of thirds grid */}
        <svg
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            opacity: 0.2,
          }}
          viewBox="0 0 3 3"
          preserveAspectRatio="none"
        >
          <line
            x1="1"
            y1="0"
            x2="1"
            y2="3"
            stroke="#C9A84C"
            strokeWidth="0.02"
          />
          <line
            x1="2"
            y1="0"
            x2="2"
            y2="3"
            stroke="#C9A84C"
            strokeWidth="0.02"
          />
          <line
            x1="0"
            y1="1"
            x2="3"
            y2="1"
            stroke="#C9A84C"
            strokeWidth="0.02"
          />
          <line
            x1="0"
            y1="2"
            x2="3"
            y2="2"
            stroke="#C9A84C"
            strokeWidth="0.02"
          />
        </svg>

        {/* Center crosshair */}
        <svg
          style={{ position: "absolute", width: 32, height: 32, opacity: 0.6 }}
          viewBox="0 0 32 32"
        >
          <line
            x1="16"
            y1="4"
            x2="16"
            y2="12"
            stroke="#C9A84C"
            strokeWidth="2"
          />
          <line
            x1="16"
            y1="20"
            x2="16"
            y2="28"
            stroke="#C9A84C"
            strokeWidth="2"
          />
          <line
            x1="4"
            y1="16"
            x2="12"
            y2="16"
            stroke="#C9A84C"
            strokeWidth="2"
          />
          <line
            x1="20"
            y1="16"
            x2="28"
            y2="16"
            stroke="#C9A84C"
            strokeWidth="2"
          />
        </svg>

        <p
          style={{
            position: "absolute",
            bottom: "12px",
            fontSize: "12px",
            color: "#8BA3C0",
            textAlign: "center",
            padding: "0 16px",
          }}
        >
          Stand in the corner opposite your main wall
        </p>
      </div>

      {/* Quality check status */}
      {isChecking && (
        <p style={{ fontSize: "14px", color: "#8BA3C0" }}>
          Checking photo quality...
        </p>
      )}

      {qualityResult && !qualityResult.passed && (
        <div
          style={{
            background: "rgba(192,80,74,0.1)",
            border: "1px solid #C0504A",
            borderRadius: "8px",
            padding: "12px 16px",
            maxWidth: 340,
          }}
        >
          {qualityResult.issues
            .filter((i) => i.severity === "error")
            .map((issue, idx) => (
              <p
                key={idx}
                style={{ color: "#C0504A", fontSize: "14px", margin: 0 }}
              >
                {issue.message}
              </p>
            ))}
        </div>
      )}

      {/* Action buttons */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          width: "100%",
          maxWidth: 340,
        }}
      >
        <button
          onClick={openCamera}
          disabled={isChecking}
          style={{
            background: "#C9A84C",
            color: "#0A1628",
            border: "none",
            borderRadius: "12px",
            padding: "16px 24px",
            fontSize: "16px",
            fontWeight: 600,
            cursor: isChecking ? "not-allowed" : "pointer",
            opacity: isChecking ? 0.7 : 1,
            width: "100%",
          }}
        >
          📷 Take Photo
        </button>

        {hasLiDAR && (
          <button
            onClick={handleLiDAR}
            style={{
              background: "transparent",
              color: "#F8F6F1",
              border: "1px solid #1E3A5F",
              borderRadius: "12px",
              padding: "16px 24px",
              fontSize: "16px",
              cursor: "pointer",
              width: "100%",
            }}
          >
            Scan Room (Pro iPhone)
          </button>
        )}
      </div>
    </div>
  );
}

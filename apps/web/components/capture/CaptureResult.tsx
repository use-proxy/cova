"use client";

import Image from "next/image";

interface CaptureResultProps {
  photoUrl: string;
  onConfirm: () => void;
  onRetake: () => void;
  isUploading: boolean;
}

export function CaptureResult({
  photoUrl,
  onConfirm,
  onRetake,
  isUploading,
}: CaptureResultProps) {
  const isBlob = photoUrl.startsWith("blob:") || photoUrl.startsWith("data:");

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "24px",
        width: "100%",
        maxWidth: 400,
      }}
    >
      {/* Photo preview */}
      <div
        style={{
          width: "100%",
          borderRadius: "16px",
          overflow: "hidden",
          border: "2px solid #C9A84C",
          boxShadow: "0 0 20px rgba(201,168,76,0.2)",
        }}
      >
        {isBlob ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt="Your room"
            style={{ width: "100%", height: "auto", display: "block" }}
          />
        ) : (
          <Image
            src={photoUrl}
            alt="Your room"
            width={400}
            height={300}
            style={{ width: "100%", height: "auto", display: "block" }}
            unoptimized
          />
        )}
      </div>

      {/* Upload progress */}
      {isUploading && (
        <div style={{ width: "100%" }}>
          <div
            style={{
              height: 2,
              background: "#1E3A5F",
              borderRadius: "999px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                background: "#C9A84C",
                width: "60%",
                animation: "indeterminate 1.5s infinite ease-in-out",
              }}
            />
          </div>
          <p
            style={{
              fontSize: "12px",
              color: "#8BA3C0",
              textAlign: "center",
              marginTop: "8px",
            }}
          >
            Uploading your photo...
          </p>
        </div>
      )}

      {/* Actions */}
      {!isUploading && (
        <div style={{ display: "flex", gap: "12px", width: "100%" }}>
          <button
            onClick={onRetake}
            style={{
              flex: 1,
              background: "transparent",
              border: "1px solid #1E3A5F",
              borderRadius: "12px",
              padding: "12px",
              color: "#F8F6F1",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            Retake
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 2,
              background: "#C9A84C",
              border: "none",
              borderRadius: "12px",
              padding: "12px",
              color: "#0A1628",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "14px",
            }}
          >
            Use This Photo →
          </button>
        </div>
      )}
    </div>
  );
}

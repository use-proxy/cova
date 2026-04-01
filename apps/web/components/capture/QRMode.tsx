"use client"

import { useState, useEffect } from "react"
import QRCode from "react-qr-code"
import { createBrowserClient } from "@/lib/supabase/client"

interface QRModeProps {
  roomId: string
  onSwitchToUpload: () => void
}

// Arch Logo SVG
function ArchLogo() {
  return (
    <svg width="48" height="32" viewBox="0 0 32 20" fill="none" className="mx-auto mb-6">
      <path
        d="M2 18Q16 2 30 18"
        stroke="var(--gold)"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}

export function QRMode({ roomId, onSwitchToUpload }: QRModeProps) {
  const [token, setToken] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)

  // Generate token on mount
  useEffect(() => {
    const generateToken = async () => {
      try {
        const res = await fetch("/api/capture/generate-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomId }),
        })
        if (res.ok) {
          const data = await res.json()
          setToken(data.token)
        }
      } catch (err) {
        console.error("Token generation failed:", err)
      }
    }
    generateToken()
  }, [roomId])

  // Poll for upload from mobile
  useEffect(() => {
    if (!token) return
    const supabase = createBrowserClient()
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from("rooms")
        .select("status")
        .eq("id", roomId)
        .single()

      if (data?.status === "processing" || data?.status === "complete") {
        setConnected(true)
        clearInterval(interval)
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [roomId, token])

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://covainterior.com"
  const qrValue = token ? `${appUrl}/capture/${roomId}?token=${token}` : ""

  return (
    <div className="flex flex-col items-center animate-[slideUp_300ms_ease-out]">
      {/* Card */}
      <div
        className="w-full max-w-md rounded-2xl p-8 flex flex-col items-center"
        style={{
          background: "var(--navy-card)",
          border: "1px solid var(--gold-dim)",
          boxShadow: "0 25px 60px -15px rgba(0, 0, 0, 0.5)",
        }}
      >
        <ArchLogo />

        <h2 className="font-serif text-2xl text-[var(--ivory)] text-center mb-2">
          Capture your <span className="italic text-[var(--gold)]">room</span>.
        </h2>
        <p className="text-sm font-sans text-[var(--ivory)]/50 text-center mb-8">
          Scan the QR code with your phone to begin
        </p>

        {/* QR Code */}
        <div
          className="p-4 rounded-lg mb-6"
          style={{ border: "2px solid var(--gold-dim)", background: "white" }}
        >
          {qrValue ? (
            <QRCode value={qrValue} size={200} level="M" />
          ) : (
            <div className="w-[200px] h-[200px] flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-[var(--gold)] border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Connection status */}
        <div className="flex items-center gap-2 mb-6">
          <div className={`w-2 h-2 rounded-full ${connected ? "bg-green-500" : "bg-[var(--gold)] animate-pulse"}`} />
          <span className="text-xs font-sans uppercase tracking-[0.15em] text-[var(--ivory)]/50">
            {connected ? "Connected" : "Waiting for connection..."}
          </span>
        </div>

        {/* Divider */}
        <div className="flex items-center w-full py-2">
          <div className="flex-1 h-px bg-[var(--gold)]/15" />
          <span className="px-4 text-xs font-sans uppercase tracking-widest text-[var(--ivory)]/40">
            OR
          </span>
          <div className="flex-1 h-px bg-[var(--gold)]/15" />
        </div>

        {/* Upload link */}
        <button
          onClick={onSwitchToUpload}
          className="mt-2 text-sm font-sans text-[var(--gold)]/70 hover:text-[var(--gold)] transition-colors uppercase tracking-wider"
        >
          Upload photos instead
        </button>
      </div>
    </div>
  )
}

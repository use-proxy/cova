"use client"

export type CaptureMode = "phone" | "webcam" | "upload"

interface ModeSwitcherProps {
  mode: CaptureMode
  onModeChange: (mode: CaptureMode) => void
}

const modes: { value: CaptureMode; label: string }[] = [
  { value: "phone", label: "Use Phone" },
  { value: "webcam", label: "Use Webcam" },
  { value: "upload", label: "Upload Files" },
]

export function ModeSwitcher({ mode, onModeChange }: ModeSwitcherProps) {
  return (
    <div className="inline-flex rounded-full p-1" style={{ background: "var(--navy-card)", border: "1px solid var(--gold-dim)" }}>
      {modes.map((m) => (
        <button
          key={m.value}
          onClick={() => onModeChange(m.value)}
          className={`px-5 py-2 rounded-full text-xs font-sans uppercase tracking-[0.15em] transition-all duration-200 ${
            mode === m.value
              ? "bg-[var(--gold)] text-[var(--navy-deep)] font-semibold"
              : "text-[var(--ivory)]/60 hover:text-[var(--ivory)]"
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  )
}

"use client"

import { Check, X } from "lucide-react"

interface ShotStripProps {
  shots: (string | null)[]
  currentIndex: number
  onRemove?: (index: number) => void
}

export function ShotStrip({ shots, currentIndex, onRemove }: ShotStripProps) {
  return (
    <div className="flex gap-2 overflow-x-auto py-2 px-1 scrollbar-hide">
      {shots.map((shot, i) => (
        <div
          key={i}
          className={`relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden transition-all duration-200 ${
            i === currentIndex && !shot
              ? "ring-2 ring-[var(--gold)] ring-offset-1 ring-offset-[var(--navy-deep)]"
              : ""
          }`}
          style={{
            border: shot ? "1px solid var(--gold-dim)" : "2px dashed var(--gold-dim)",
            background: shot ? undefined : "var(--navy-card)",
          }}
        >
          {shot ? (
            <>
              <img src={shot} alt={`Shot ${i + 1}`} className="w-full h-full object-cover" />
              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                <Check className="w-4 h-4 text-[var(--gold)]" />
              </div>
              {onRemove && (
                <button
                  onClick={() => onRemove(i)}
                  className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 flex items-center justify-center hover:bg-black/80 transition-colors"
                >
                  <X className="w-3 h-3 text-white/80" />
                </button>
              )}
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-[10px] font-sans text-[var(--ivory)]/30 uppercase tracking-wider">
                {i + 1}
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

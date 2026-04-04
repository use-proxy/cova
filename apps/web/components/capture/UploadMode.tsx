"use client"

import { useState, useCallback, useRef } from "react"
import { Upload, X } from "lucide-react"

const TOTAL_SLOTS = 8
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/heic", "image/webp"]

interface UploadModeProps {
  onComplete: (files: File[]) => void
}

export function UploadMode({ onComplete }: UploadModeProps) {
  const [slots, setSlots] = useState<(File | null)[]>(Array(TOTAL_SLOTS).fill(null))
  const [previews, setPreviews] = useState<(string | null)[]>(Array(TOTAL_SLOTS).fill(null))
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const filledCount = slots.filter(Boolean).length
  const allFilled = filledCount === TOTAL_SLOTS

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const fileArray = Array.from(files).filter((f) => ACCEPTED_TYPES.includes(f.type))

      setSlots((prevSlots) => {
        const nextSlots = [...prevSlots]
        const nextPreviews = [...previews]
        let added = 0
        for (const file of fileArray) {
          const emptyIdx = nextSlots.findIndex((s) => s === null)
          if (emptyIdx === -1) break
          nextSlots[emptyIdx] = file
          nextPreviews[emptyIdx] = URL.createObjectURL(file)
          added++
        }
        if (added > 0) setPreviews(nextPreviews)
        return nextSlots
      })
    },
    [previews]
  )

  const removeSlot = useCallback(
    (index: number) => {
      setSlots((prev) => {
        const next = [...prev]
        next[index] = null
        return next
      })
      setPreviews((prev) => {
        const next = [...prev]
        if (next[index]) URL.revokeObjectURL(next[index]!)
        next[index] = null
        return next
      })
    },
    []
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      addFiles(e.dataTransfer.files)
    },
    [addFiles]
  )

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) addFiles(e.target.files)
      e.target.value = ""
    },
    [addFiles]
  )

  const handleProcess = () => {
    const files = slots.filter(Boolean) as File[]
    onComplete(files)
  }

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-2xl mx-auto animate-[slideUp_300ms_ease-out]">
      {/* Drop zone */}
      <div
        className={`w-full rounded-2xl p-12 flex flex-col items-center justify-center cursor-pointer transition-all duration-200 ${
          dragOver ? "scale-[1.01]" : ""
        }`}
        style={{
          border: `2px dashed ${dragOver ? "var(--gold)" : "var(--gold-dim)"}`,
          background: dragOver ? "var(--gold-glow)" : "var(--navy-card)",
          minHeight: "240px",
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="w-10 h-10 text-[var(--gold)]/60 mb-4" />
        <p className="font-serif text-lg text-[var(--ivory)] mb-2">
          Drop {TOTAL_SLOTS} room photos here
        </p>
        <p className="text-sm font-sans text-[var(--gold)]/50 uppercase tracking-wider">
          or click to browse files
        </p>
        <p className="text-xs font-sans text-[var(--ivory)]/30 mt-3 uppercase tracking-wider">
          JPG, PNG, HEIC, WebP
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.heic,.webp"
          multiple
          className="hidden"
          onChange={handleFileInput}
        />
      </div>

      {/* Grid of slots */}
      {filledCount > 0 && (
        <div className="grid grid-cols-4 gap-3 w-full">
          {slots.map((slot, i) => (
            <div
              key={i}
              className="relative aspect-square rounded-lg overflow-hidden cursor-pointer"
              style={{
                border: slot ? "1px solid var(--gold-dim)" : "2px dashed var(--gold-dim)",
                background: slot ? undefined : "var(--navy-card)",
              }}
              onClick={() => {
                if (!slot) inputRef.current?.click()
              }}
            >
              {previews[i] ? (
                <>
                  <img src={previews[i]!} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      removeSlot(i)
                    }}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center hover:bg-black/80 transition-colors"
                  >
                    <X className="w-4 h-4 text-white/80" />
                  </button>
                </>
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-xs font-sans text-[var(--ivory)]/30 uppercase tracking-wider">
                    {i + 1}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Process button */}
      {allFilled && (
        <button
          onClick={handleProcess}
          className="w-full max-w-xs py-3.5 rounded-lg bg-[var(--gold)] text-[var(--navy-deep)] font-sans text-sm font-semibold uppercase tracking-widest transition-all duration-200 hover:bg-[var(--gold-light)] hover:shadow-[0_0_30px_var(--gold-glow)] animate-[slideUp_300ms_ease-out]"
        >
          Process My Room
        </button>
      )}
    </div>
  )
}

'use client'

import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Upload } from 'lucide-react'

// ─── Animation Variants ──────────────────────────────────────────────────────

const container = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.08 },
  },
}

const item = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] } },
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function Step6Page() {
  const router = useRouter()

  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // ─── File handlers ─────────────────────────────────────────────────────────

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadedFile(file)
    setPreviewUrl(URL.createObjectURL(file))
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    setUploadedFile(file)
    setPreviewUrl(URL.createObjectURL(file))
  }, [])

  // ─── CTA handler ───────────────────────────────────────────────────────────

  const handleAnalyze = useCallback(() => {
    if (!uploadedFile) return
    router.push('/design/step-7')
  }, [uploadedFile, router])

  return (
    <div className="min-h-screen bg-[#091829] font-dm-sans">

      {/* Gold progress bar */}
      <div
        className="fixed top-0 left-0 right-0 z-[60]"
        style={{ height: 3, background: 'rgba(201,168,76,0.15)' }}
      >
        <div
          className="h-full bg-cova-gold transition-[width] duration-[400ms] ease-out"
          style={{ width: '71%' }}
        />
      </div>

      {/* Frosted glass top bar */}
      <div
        className="sticky top-0 h-14 z-[50] flex items-center justify-between px-6 border-b border-[rgba(201,168,76,0.1)]"
        style={{
          background: 'rgba(9,24,41,0.8)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
        }}
      >
        <span className="font-playfair italic text-xl text-cova-gold tracking-[0.05em]">
          Cova
        </span>
        <span className="font-dm-sans font-semibold text-[15px] text-cova-ivory">
          Upload Your Room
        </span>
        <span className="font-dm-sans text-[13px] text-cova-muted">
          Step 5 of 7
        </span>
      </div>

      {/* Main content */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="pt-12 pb-[120px] px-6 max-w-[680px] mx-auto text-center"
      >

        {/* Section heading */}
        <motion.h1
          variants={item}
          className="font-playfair text-[40px] font-normal text-cova-ivory mb-2 mt-0"
        >
          Upload your room
        </motion.h1>

        {/* Subtext */}
        <motion.p
          variants={item}
          className="font-dm-sans text-[15px] text-cova-muted mb-8"
        >
          We&apos;ll analyze every detail.
        </motion.p>

        {/* Upload zone */}
        <motion.div variants={item}>
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className="relative overflow-hidden flex flex-col items-center justify-center rounded-xl cursor-pointer transition-all duration-200 ease-out"
            style={{
              minHeight: 400,
              border: isDragOver
                ? '2px solid rgba(201,168,76,0.8)'
                : '2px dashed rgba(201,168,76,0.35)',
              background: isDragOver
                ? 'rgba(201,168,76,0.06)'
                : previewUrl ? 'transparent' : 'rgba(255,255,255,0.04)',
            }}
          >
            {previewUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt="Room preview"
                  className="w-full h-full object-cover absolute inset-0"
                />
                {/* Dark gradient overlay at bottom */}
                <div
                  className="absolute bottom-0 left-0 right-0"
                  style={{
                    height: 80,
                    background: 'linear-gradient(transparent, rgba(9,24,41,0.8))',
                  }}
                />
                <p className="font-dm-sans text-sm text-cova-ivory absolute bottom-4 text-center w-full">
                  Looking good. Ready to analyze.
                </p>
              </>
            ) : (
              <>
                <Upload size={48} color="#C9A84C" />
                <p className="font-dm-sans text-base text-cova-ivory mt-4 mb-0">
                  Drag &amp; drop your photo here
                </p>
                <p className="font-dm-sans text-sm text-cova-muted my-2">
                  or
                </p>
                <p className="font-dm-sans text-sm text-cova-gold cursor-pointer">
                  Browse files
                </p>
              </>
            )}
          </div>

          {/* Hidden file input */}
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*,.heic"
            className="hidden"
            onChange={handleFileChange}
          />

          {/* File format note */}
          <p className="font-dm-sans text-[13px] text-cova-muted mt-3 text-center">
            JPG, PNG or HEIC — max 25MB
          </p>
        </motion.div>

        {/* CTA */}
        <motion.div
          variants={item}
          className="mt-8 flex justify-center"
        >
          <motion.button
            onClick={handleAnalyze}
            disabled={!uploadedFile}
            whileHover={uploadedFile ? { scale: 1.02, backgroundColor: '#D4B460' } : {}}
            whileTap={uploadedFile ? { scale: 0.97 } : {}}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="bg-cova-gold text-[#091829] font-dm-sans font-semibold text-[15px] rounded-lg border-none"
            style={{
              padding: '12px 24px',
              cursor: uploadedFile ? 'pointer' : 'not-allowed',
              opacity: uploadedFile ? 1 : 0.4,
              pointerEvents: uploadedFile ? 'auto' : 'none',
              transition: 'opacity 300ms ease',
            }}
          >
            Analyze My Room →
          </motion.button>
        </motion.div>

      </motion.div>
    </div>
  )
}

'use client'

import { useRef, useCallback } from 'react'
import { checkImageQuality } from './QualityChecker'

interface UploadFallbackProps {
  onFileSelected: (file: File) => void
  onError: (error: string) => void
}

export function UploadFallback({ onFileSelected, onError }: UploadFallbackProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      const url = URL.createObjectURL(file)
      const img = new Image()

      img.onload = async () => {
        const result = await checkImageQuality(file, img)
        URL.revokeObjectURL(url)

        if (result.passed) {
          onFileSelected(file)
        } else {
          const errorIssue = result.issues.find((i) => i.severity === 'error')
          onError(
            errorIssue?.message ?? 'Photo does not meet quality requirements.'
          )
        }
      }

      img.onerror = () => {
        URL.revokeObjectURL(url)
        onError('Could not read photo.')
      }

      img.src = url
    },
    [onFileSelected, onError]
  )

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        style={{ display: 'none' }}
        aria-label="Upload from camera roll"
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        style={{
          background: 'transparent',
          border: 'none',
          color: '#8BA3C0',
          fontSize: '14px',
          cursor: 'pointer',
          textDecoration: 'underline',
          padding: 0,
        }}
      >
        or upload from camera roll
      </button>
    </>
  )
}

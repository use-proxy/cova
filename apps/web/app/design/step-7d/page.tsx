'use client'

/**
 * Screen D — Tabbed chatbot.
 *
 * Six tabs share a single chat UI and a single /api/design-chat
 * endpoint. Each tab keeps its own message history, starter chips,
 * and completion status. The "Design My Room" CTA unlocks when
 * budget is complete AND at least one other tab is complete.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase/client'
import { useArea2Store } from '@/lib/stores/area2Store'
import { persistRenderContext } from '@/lib/ai/renderContext/persist'
import type { TabId } from '@/lib/types/area2'

// ─── Tokens ────────────────────────────────────────────────────────────────

const bg = 'var(--cova-bg)'
const surface = 'var(--cova-surface)'
const surface2 = 'var(--cova-surface-2)'
const border = 'var(--cova-border)'
const gold = 'var(--cova-gold)'
const goldDim = 'var(--cova-gold-dim)'
const ivory = 'var(--cova-ivory)'
const muted = 'var(--cova-muted)'
const success = 'var(--cova-success)'

// ─── Tab labels + starters ─────────────────────────────────────────────────

const TABS: { id: TabId; label: string }[] = [
  { id: 'budget', label: 'Budget' },
  { id: 'products', label: 'Products' },
  { id: 'art', label: 'Art' },
  { id: 'tech', label: 'Tech' },
  { id: 'sensory', label: 'Feel' },
  { id: 'identity', label: 'You' },
]

const STARTERS: Record<TabId, string[]> = {
  budget: [
    "I'm working with around $3,000",
    'Budget is flexible, quality matters more',
    'I want to keep it under $1,500',
  ],
  products: [
    'I have a specific sofa in mind',
    'Nothing specific, let the AI decide',
    'Let me paste a link',
  ],
  art: [
    'I want something related to a specific artist',
    "Show me some directions and I'll pick",
    "I'll upload a picture I love",
  ],
  tech: [
    'I definitely want a TV',
    'Keep it minimal, no TV',
    "I'm into audio — suggest something",
  ],
  sensory: [
    'I love plants everywhere',
    'Keep it clean and minimal',
    'Lots of cozy textures',
  ],
  identity: [
    'I have a cultural aesthetic in mind',
    'I just want it to feel like home',
    'Let me tell you about my interests',
  ],
}

// ─── URL detection ──────────────────────────────────────────────────────────

const URL_RE = /https?:\/\/[^\s]+/i

// ─── Page ──────────────────────────────────────────────────────────────────

interface InlineArt {
  messageIndex: number
  urls: string[]
  selectedUrl?: string
}

export default function Step7DPage() {
  const router = useRouter()
  const {
    roomId,
    activeTab,
    tabStates,
    minimumThresholdMet,
    setActiveTab,
    appendTabMessage,
    updateTabExtractedData,
    markTabComplete,
    setArtBrief,
    assembleRenderContext,
  } = useArea2Store()

  const [hydrated, setHydrated] = useState(false)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [ctaError, setCtaError] = useState<string | null>(null)
  const [inlineArt, setInlineArt] = useState<Record<string, InlineArt[]>>({})
  const [artPolling, setArtPolling] = useState<{ roomId: string; tabKey: TabId; messageIndex: number } | null>(null)
  // Pending image for the Identity tab (Tab 6). Computed client-side before sending.
  const [pendingImage, setPendingImage] = useState<{ base64: string; contentHash: string } | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => setHydrated(true), [])

  // Poll for art generation results every 3s when triggered.
  useEffect(() => {
    if (!artPolling) return
    const { roomId: pollingRoomId, tabKey, messageIndex } = artPolling
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/generate-art?roomId=${pollingRoomId}`)
        if (!res.ok) return
        const data = (await res.json()) as { status: string; urls: string[] }
        if (data.status === 'complete' && data.urls.length > 0) {
          setInlineArt((prev) => ({
            ...prev,
            [tabKey]: (prev[tabKey] ?? []).map((b) =>
              b.messageIndex === messageIndex ? { ...b, urls: data.urls } : b
            ),
          }))
          const current = useArea2Store.getState().artBrief
          setArtBrief({
            hasArtDirection: true,
            visualDirection: current?.visualDirection ?? '',
            colorPalette: [],
            mood: '',
            abstractionLevel: 'semi-abstract',
            subjectMatter: '',
            frameStyle: 'gallery-wrap',
            placement: 'ai-decides',
            galleryWall: false,
            generatedOptions: data.urls,
            includesPersonalPhotos: false,
            hasBookCollection: false,
            hasVinylCollection: false,
            copyrightSafe: true,
          })
          setArtPolling(null)
        }
      } catch {
        // non-fatal, keep polling
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [artPolling, setArtBrief])

  const activeHistory = useMemo(
    () => tabStates.find((t) => t.tabId === activeTab)?.messages ?? [],
    [tabStates, activeTab]
  )
  const activeExtracted = useMemo(
    () =>
      (tabStates.find((t) => t.tabId === activeTab)?.extractedData ??
        {}) as Record<string, unknown>,
    [tabStates, activeTab]
  )

  // Auto-scroll chat to bottom on new messages.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [activeHistory.length, activeTab])

  const tabStatus = (id: TabId) => {
    const t = tabStates.find((ts) => ts.tabId === id)
    if (!t) return 'empty'
    if (t.isComplete) return 'complete'
    if (t.messages.length > 0) return 'in-progress'
    return 'empty'
  }

  // Handles image selection for the Identity tab. Computes a SHA-256 hash
  // client-side via SubtleCrypto so the server can detect duplicate uploads.
  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const arrayBuffer = await file.arrayBuffer()
      // Compute SHA-256 content hash for dedup
      const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const contentHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
      // Convert to base64 for the API
      const bytes = new Uint8Array(arrayBuffer)
      let binary = ''
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
      const base64 = btoa(binary)
      setPendingImage({ base64, contentHash })
      if (!input) setInput('I want to share this image for inspiration.')
    } catch {
      // Ignore — user can still type without image
    }
    // Reset input so the same file can be re-selected if needed
    e.target.value = ''
  }, [input])

  const sendMessage = async (override?: string) => {
    const text = (override ?? input).trim()
    // Allow sending with only an image (empty text)
    if (!text && !pendingImage || sending) return
    const effectiveText = text || 'I shared an image.'
    const detectedUrl = effectiveText.match(URL_RE)?.[0]

    const imgData = pendingImage
    setInput('')
    setPendingImage(null)

    // Embed hash marker in stored message for server-side dedup on future uploads
    const storedText = imgData
      ? `${effectiveText} [img-hash:${imgData.contentHash.slice(0, 8)}]`
      : effectiveText
    appendTabMessage(activeTab, 'user', storedText)
    setSending(true)

    try {
      const res = await fetch('/api/design-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: effectiveText,
          activeTab,
          roomId,
          tabHistory: tabStates,
          currentExtracted: activeExtracted,
          urlInput: detectedUrl,
          ...(imgData
            ? { imageAttachment: imgData.base64, contentHash: imgData.contentHash }
            : {}),
        }),
      })
      if (!res.ok) throw new Error('chat request failed')
      const data = (await res.json()) as {
        reply: string
        extractedData: Record<string, unknown>
        tabComplete: boolean
        scrapedProduct: unknown
        shouldGenerateArt: boolean
        artPrompt: string | null
      }

      appendTabMessage(activeTab, 'assistant', data.reply)
      updateTabExtractedData(activeTab, data.extractedData as never)

      if (data.tabComplete) {
        markTabComplete(activeTab)
      }

      if (data.shouldGenerateArt && roomId) {
        // Attach a pending art block to the assistant message — will fill when polling completes.
        const nextIndex = activeHistory.length + 1 // user appended, assistant appended
        const tabKey = activeTab
        setInlineArt((prev) => ({
          ...prev,
          [tabKey]: [
            ...(prev[tabKey] ?? []),
            { messageIndex: nextIndex, urls: [] },
          ],
        }))
        setArtPolling({ roomId, tabKey, messageIndex: nextIndex })
      }
    } catch {
      appendTabMessage(
        activeTab,
        'assistant',
        "Something went wrong on my end. Want to try that again?"
      )
    } finally {
      setSending(false)
    }
  }

  const selectArt = (tabKey: TabId, messageIndex: number, url: string) => {
    setInlineArt((prev) => ({
      ...prev,
      [tabKey]: (prev[tabKey] ?? []).map((block) =>
        block.messageIndex === messageIndex
          ? { ...block, selectedUrl: url }
          : block
      ),
    }))
    // Persist the chosen art image.
    const current = useArea2Store.getState().artBrief
    if (current) {
      setArtBrief({ ...current, chosenArtImageUrl: url })
    }
  }

  const handleDesignMyRoom = async () => {
    setCtaError(null)
    if (!minimumThresholdMet || !roomId) return
    // Gather a user id from Supabase for assembly.
    const supabase = createBrowserClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return
    const ctx = assembleRenderContext(user.id)
    if (!ctx) {
      setCtaError('Complete the Budget tab to continue.')
      return
    }
    const result = await persistRenderContext(roomId, ctx, user.id)
    if (!result.success) {
      console.error('[Step 7d] persistRenderContext failed:', result.error)
      setCtaError('Something went wrong saving your preferences. Please try again.')
      return
    }
    router.push('/design/step-8')
  }

  if (!hydrated) return null

  // ─── Layout ─────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        minHeight: '100vh',
        background: bg,
        color: ivory,
        fontFamily: 'var(--font-sans)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <header
        style={{
          padding: 'var(--space-5) var(--space-5) var(--space-3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <button
          type="button"
          onClick={() => router.back()}
          style={{
            background: 'transparent',
            border: `1px solid ${border}`,
            color: muted,
            borderRadius: 'var(--radius-md)',
            padding: '6px 12px',
            cursor: 'pointer',
            fontSize: 'var(--text-sm)',
          }}
        >
          ← Back
        </button>
        <div style={{ color: muted, fontSize: 'var(--text-xs)' }}>
          Step 4 of 4
        </div>
      </header>

      <div
        style={{
          margin: '0 var(--space-5) var(--space-4)',
          height: 3,
          background: border,
          borderRadius: 'var(--radius-full)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            background: gold,
          }}
        />
      </div>

      <div style={{ padding: '0 var(--space-5)', maxWidth: 720, margin: '0 auto', width: '100%' }}>
        <h1
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 'var(--text-3xl)',
            marginBottom: 'var(--space-3)',
          }}
        >
          Make it yours
        </h1>

        {/* Tab bar */}
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-2)',
            overflowX: 'auto',
            paddingBottom: 'var(--space-2)',
            marginBottom: 'var(--space-3)',
            borderBottom: `1px solid ${border}`,
          }}
        >
          {TABS.map((t) => {
            const status = tabStatus(t.id)
            const isActive = t.id === activeTab
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderBottom: `2px solid ${isActive ? gold : 'transparent'}`,
                  color: isActive ? gold : ivory,
                  padding: '8px 12px',
                  cursor: 'pointer',
                  fontSize: 'var(--text-sm)',
                  fontWeight: isActive ? 600 : 400,
                  whiteSpace: 'nowrap',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontFamily: 'var(--font-sans)',
                }}
              >
                {t.label}
                {status === 'complete' && (
                  <span style={{ color: success, fontSize: 12 }}>✓</span>
                )}
                {status === 'in-progress' && (
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: gold,
                      display: 'inline-block',
                    }}
                  />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Chat body */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '0 var(--space-5)',
          maxWidth: 720,
          margin: '0 auto',
          width: '100%',
        }}
      >
        {activeHistory.length === 0 ? (
          <div style={{ color: muted, fontSize: 'var(--text-sm)', padding: 'var(--space-4) 0' }}>
            Tap a prompt below to begin, or type something yourself.
          </div>
        ) : (
          activeHistory.map((m, i) => {
            const isUser = m.role === 'user'
            const art = (inlineArt[activeTab] ?? []).find(
              (b) => b.messageIndex === i
            )
            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: isUser ? 'flex-end' : 'flex-start',
                  marginBottom: 'var(--space-3)',
                }}
              >
                <div
                  style={{
                    maxWidth: '82%',
                    background: isUser ? surface2 : surface,
                    border: `1px solid ${border}`,
                    borderRadius: 'var(--radius-lg)',
                    padding: '10px 14px',
                    color: ivory,
                    fontSize: 'var(--text-sm)',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {m.content}
                  {art && art.urls.length === 0 && (
                    <div
                      style={{
                        color: muted,
                        fontSize: 'var(--text-xs)',
                        marginTop: 'var(--space-2)',
                      }}
                    >
                      Creating art options...
                    </div>
                  )}
                  {art && art.urls.length > 0 && (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 'var(--space-2)',
                        marginTop: 'var(--space-3)',
                      }}
                    >
                      {art.urls.map((url) => {
                        const selected = art.selectedUrl === url
                        return (
                          <button
                            key={url}
                            type="button"
                            onClick={() => selectArt(activeTab, i, url)}
                            style={{
                              background: 'transparent',
                              border: `2px solid ${selected ? gold : border}`,
                              borderRadius: 'var(--radius-md)',
                              padding: 0,
                              cursor: 'pointer',
                              overflow: 'hidden',
                            }}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={url}
                              alt="Art option"
                              style={{
                                width: '100%',
                                height: 160,
                                objectFit: 'cover',
                                display: 'block',
                              }}
                            />
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
        {sending && (
          <div
            style={{
              color: muted,
              fontSize: 'var(--text-xs)',
              marginBottom: 'var(--space-3)',
            }}
          >
            Thinking…
          </div>
        )}
      </div>

      {/* Starter chips */}
      {activeHistory.length === 0 && (
        <div
          style={{
            padding: '0 var(--space-5) var(--space-3)',
            maxWidth: 720,
            margin: '0 auto',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-2)',
          }}
        >
          {STARTERS[activeTab].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => sendMessage(s)}
              disabled={sending}
              style={{
                background: 'transparent',
                border: `1px solid ${border}`,
                color: ivory,
                padding: '10px 14px',
                borderRadius: 'var(--radius-pill)',
                cursor: sending ? 'not-allowed' : 'pointer',
                fontSize: 'var(--text-sm)',
                textAlign: 'left',
                fontFamily: 'var(--font-sans)',
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input bar */}
      <div
        style={{
          padding: 'var(--space-3) var(--space-5)',
          borderTop: `1px solid ${border}`,
          background: bg,
          maxWidth: 720,
          margin: '0 auto',
          width: '100%',
        }}
      >
        {/* Hidden file input — triggered by the attach button for Identity tab */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          style={{ display: 'none' }}
        />

        {/* Image attachment indicator for Identity tab */}
        {pendingImage && (
          <div
            style={{
              marginBottom: 'var(--space-2)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              fontSize: 'var(--text-xs)',
              color: gold,
            }}
          >
            <span>Image ready to send</span>
            <button
              type="button"
              onClick={() => setPendingImage(null)}
              style={{ background: 'transparent', border: 'none', color: muted, cursor: 'pointer', fontSize: 'var(--text-xs)' }}
            >
              Remove
            </button>
          </div>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
          }}
        >
          {/* Image attach button — only shown for the Identity tab */}
          {activeTab === 'identity' && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={sending}
              title="Attach image (sentimental objects, inspiration photos)"
              style={{
                background: 'transparent',
                border: `1px solid ${pendingImage ? gold : border}`,
                color: pendingImage ? gold : muted,
                borderRadius: 'var(--radius-pill)',
                padding: '11px 13px',
                cursor: sending ? 'not-allowed' : 'pointer',
                fontSize: 'var(--text-sm)',
                lineHeight: 1,
                fontFamily: 'var(--font-sans)',
              }}
            >
              +img
            </button>
          )}
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') sendMessage()
            }}
            placeholder="Type a message…"
            style={{
              flex: 1,
              background: surface,
              border: `1px solid ${border}`,
              borderRadius: 'var(--radius-pill)',
              color: ivory,
              padding: '12px 16px',
              fontSize: 'var(--text-sm)',
              outline: 'none',
              fontFamily: 'var(--font-sans)',
            }}
          />
          <button
            type="button"
            onClick={() => sendMessage()}
            disabled={sending || (!input.trim() && !pendingImage)}
            style={{
              background: (input.trim() || pendingImage) ? gold : border,
              color: (input.trim() || pendingImage) ? 'var(--cova-bg)' : muted,
              border: 'none',
              borderRadius: 'var(--radius-pill)',
              padding: '12px 20px',
              cursor: sending || (!input.trim() && !pendingImage) ? 'not-allowed' : 'pointer',
              fontWeight: 600,
              fontSize: 'var(--text-sm)',
              fontFamily: 'var(--font-sans)',
            }}
          >
            Send
          </button>
        </div>

        {/* Completion status + CTA */}
        <div
          style={{
            marginTop: 'var(--space-3)',
            color: muted,
            fontSize: 'var(--text-xs)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--space-2)',
          }}
        >
          {TABS.map((t) => {
            const done = tabStatus(t.id) === 'complete'
            return (
              <span key={t.id} style={{ color: done ? success : muted }}>
                {t.label}
                {done ? ' ✓' : ''}
              </span>
            )
          })}
        </div>

        {ctaError && (
          <div
            style={{
              marginTop: 'var(--space-3)',
              color: 'var(--cova-error)',
              fontSize: 'var(--text-sm)',
              textAlign: 'center',
            }}
          >
            {ctaError}
          </div>
        )}
        <button
          type="button"
          onClick={handleDesignMyRoom}
          disabled={!minimumThresholdMet}
          style={{
            marginTop: 'var(--space-3)',
            width: '100%',
            background: minimumThresholdMet ? gold : goldDim,
            color: minimumThresholdMet ? 'var(--cova-bg)' : muted,
            border: 'none',
            borderRadius: 'var(--radius-md)',
            padding: '14px 20px',
            fontSize: 'var(--text-base)',
            fontWeight: 600,
            cursor: minimumThresholdMet ? 'pointer' : 'not-allowed',
            transition: 'all var(--transition-base)',
            fontFamily: 'var(--font-sans)',
          }}
        >
          {minimumThresholdMet
            ? 'Design My Room →'
            : 'Complete Budget + one more tab to continue'}
        </button>
      </div>
    </div>
  )
}

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
import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { createBrowserClient } from '@/lib/supabase/client'
import { useArea2Store } from '@/lib/stores/area2Store'
import { persistRenderContext } from '@/lib/ai/renderContext/persist'
import type { TabId } from '@/lib/types/area2'

// ─── Tab labels + starters ────────────────────────────────────────────────────

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

const URL_RE = /https?:\/\/[^\s]+/i

// ─── Typing indicator component ───────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex gap-[6px] items-center p-3 px-4">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
          className="w-[7px] h-[7px] rounded-full bg-cova-gold"
        />
      ))}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

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
  const [pendingImage, setPendingImage] = useState<{ base64: string; contentHash: string } | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => setHydrated(true), [])

  // Poll for art generation results.
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

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const arrayBuffer = await file.arrayBuffer()
      const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const contentHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
      const bytes = new Uint8Array(arrayBuffer)
      let binary = ''
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
      const base64 = btoa(binary)
      setPendingImage({ base64, contentHash })
      if (!input) setInput('I want to share this image for inspiration.')
    } catch {
      // Ignore
    }
    e.target.value = ''
  }, [input])

  const sendMessage = async (override?: string) => {
    const text = (override ?? input).trim()
    if (!text && !pendingImage || sending) return
    const effectiveText = text || 'I shared an image.'
    const detectedUrl = effectiveText.match(URL_RE)?.[0]

    const imgData = pendingImage
    setInput('')
    setPendingImage(null)

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
        const nextIndex = activeHistory.length + 1
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
    const current = useArea2Store.getState().artBrief
    if (current) {
      setArtBrief({ ...current, chosenArtImageUrl: url })
    }
  }

  const handleDesignMyRoom = async () => {
    setCtaError(null)
    if (!minimumThresholdMet || !roomId) return
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

  return (
    <div className="min-h-screen bg-cova-bg font-dm-sans flex flex-col">
      {/* Gold progress bar — fixed top */}
      <div className="fixed top-0 left-0 right-0 h-[3px] bg-[rgba(201,168,76,0.15)] z-[60]">
        <div className="h-full w-[86%] bg-cova-gold transition-all duration-[400ms] ease-out" />
      </div>

      {/* Frosted glass top bar */}
      <nav
        className="sticky top-0 z-50 h-14 flex items-center justify-between px-6"
        style={{
          background: 'rgba(9,24,41,0.8)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(201,168,76,0.1)',
        }}
      >
        <span className="font-playfair italic text-xl text-cova-gold tracking-[0.05em]">Cova</span>
        <span className="font-semibold text-[15px] text-cova-ivory">Personalize</span>
        <span className="text-[13px] text-cova-muted">Step 7 of 7</span>
      </nav>

      {/* Tab bar */}
      <div
        className="flex overflow-x-auto flex-shrink-0 px-6"
        style={{ borderBottom: '1px solid rgba(201,168,76,0.1)' }}
      >
        {TABS.map((t) => {
          const status = tabStatus(t.id)
          const isActive = t.id === activeTab
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={[
                'bg-transparent border-none whitespace-nowrap flex items-center gap-[6px] transition-all duration-200 ease-out cursor-pointer text-sm py-3 px-4',
                isActive ? 'text-cova-ivory font-semibold' : 'text-cova-muted font-normal',
              ].join(' ')}
              style={{
                borderBottom: `2px solid ${isActive ? '#C9A84C' : 'transparent'}`,
              }}
            >
              {t.label}
              {status === 'complete' && (
                <span className="text-cova-gold text-xs">✓</span>
              )}
              {status === 'in-progress' && (
                <span className="w-[6px] h-[6px] rounded-full bg-cova-gold inline-block" />
              )}
            </button>
          )
        })}
      </div>

      {/* Chat area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto py-4 px-6 max-w-[720px] mx-auto w-full"
      >
        {activeHistory.length === 0 ? (
          <div className="text-cova-muted text-sm font-dm-sans py-4">
            Tap a prompt below to begin, or type something yourself.
          </div>
        ) : (
          activeHistory.map((m, i) => {
            const isUser = m.role === 'user'
            const art = (inlineArt[activeTab] ?? []).find((b) => b.messageIndex === i)
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={['flex mb-3', isUser ? 'justify-end' : 'justify-start'].join(' ')}
              >
                <div
                  className="max-w-[82%] rounded-xl p-3 px-4 text-cova-ivory text-[15px] whitespace-pre-wrap"
                  style={{
                    background: isUser ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${isUser ? 'transparent' : 'rgba(201,168,76,0.15)'}`,
                    borderLeft: isUser ? '2px solid #C9A84C' : '1px solid rgba(201,168,76,0.15)',
                  }}
                >
                  {m.content}
                  {art && art.urls.length === 0 && (
                    <div className="text-cova-muted text-xs mt-2">
                      Creating art options...
                    </div>
                  )}
                  {art && art.urls.length > 0 && (
                    <div className="grid grid-cols-2 gap-2 mt-3">
                      {art.urls.map((url) => {
                        const selected = art.selectedUrl === url
                        return (
                          <button
                            key={url}
                            type="button"
                            onClick={() => selectArt(activeTab, i, url)}
                            className="bg-transparent rounded-lg p-0 cursor-pointer overflow-hidden"
                            style={{
                              border: `2px solid ${selected ? '#C9A84C' : 'rgba(201,168,76,0.15)'}`,
                            }}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={url}
                              alt="Art option"
                              className="w-full h-[160px] object-cover block"
                            />
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </motion.div>
            )
          })
        )}

        {/* Typing indicator */}
        {sending && (
          <div className="flex justify-start mb-3">
            <div
              className="rounded-xl"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(201,168,76,0.15)',
              }}
            >
              <TypingIndicator />
            </div>
          </div>
        )}
      </div>

      {/* Starter chips */}
      {activeHistory.length === 0 && (
        <div className="px-6 pb-3 max-w-[720px] mx-auto w-full flex flex-col gap-2">
          {STARTERS[activeTab].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => sendMessage(s)}
              disabled={sending}
              className={[
                'bg-transparent text-cova-ivory py-[10px] px-[14px] rounded-full text-sm text-left transition-all duration-200 ease-out',
                sending ? 'cursor-not-allowed' : 'cursor-pointer',
              ].join(' ')}
              style={{ border: '1px solid rgba(201,168,76,0.15)' }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input bar */}
      <div
        className="py-3 px-6 max-w-[720px] mx-auto w-full flex-shrink-0 bg-cova-bg"
        style={{ borderTop: '1px solid rgba(201,168,76,0.15)' }}
      >
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          className="hidden"
        />

        {/* Image attachment indicator */}
        {pendingImage && (
          <div className="mb-2 flex items-center gap-2 text-xs text-cova-gold">
            <span>Image ready to send</span>
            <button
              type="button"
              onClick={() => setPendingImage(null)}
              className="bg-transparent border-none text-cova-muted cursor-pointer text-xs"
            >
              Remove
            </button>
          </div>
        )}

        <div className="flex items-center gap-2">
          {/* Image attach for Identity tab */}
          {activeTab === 'identity' && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={sending}
              title="Attach image (sentimental objects, inspiration photos)"
              className={[
                'bg-transparent rounded-full py-[11px] px-[13px] text-[13px] leading-none',
                sending ? 'cursor-not-allowed' : 'cursor-pointer',
                pendingImage ? 'text-cova-gold' : 'text-cova-muted',
              ].join(' ')}
              style={{
                border: `1px solid ${pendingImage ? '#C9A84C' : 'rgba(201,168,76,0.15)'}`,
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
            className="flex-1 rounded-lg text-cova-ivory py-3 px-4 text-[15px] outline-none transition-[border-color] duration-[150ms] ease-out"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(201,168,76,0.15)',
            }}
            onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = 'rgba(201,168,76,0.6)' }}
            onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = 'rgba(201,168,76,0.15)' }}
          />
          <button
            type="button"
            onClick={() => sendMessage()}
            disabled={sending || (!input.trim() && !pendingImage)}
            className={[
              'border-none rounded-lg py-3 px-[14px] flex items-center justify-center',
              (sending || (!input.trim() && !pendingImage)) ? 'cursor-not-allowed' : 'cursor-pointer',
            ].join(' ')}
            style={{
              background: (input.trim() || pendingImage) ? '#C9A84C' : 'rgba(201,168,76,0.15)',
              color: (input.trim() || pendingImage) ? '#091829' : 'rgba(245,240,232,0.45)',
            }}
          >
            <ArrowRight size={18} />
          </button>
        </div>

        {/* Completion status row */}
        <div className="mt-3 text-cova-muted text-xs flex flex-wrap gap-2">
          {TABS.map((t) => {
            const done = tabStatus(t.id) === 'complete'
            return (
              <span key={t.id} style={{ color: done ? '#6FCF97' : undefined }} className={done ? '' : 'text-cova-muted'}>
                {t.label}
                {done ? ' ✓' : ''}
              </span>
            )
          })}
        </div>

        {/* CTA error */}
        {ctaError && (
          <div className="mt-3 text-[#E87070] text-sm text-center">
            {ctaError}
          </div>
        )}

        {/* Design My Room CTA */}
        <motion.button
          type="button"
          onClick={handleDesignMyRoom}
          disabled={!minimumThresholdMet}
          whileHover={minimumThresholdMet ? { scale: 1.02, backgroundColor: '#D4B460' } : {}}
          whileTap={minimumThresholdMet ? { scale: 0.97 } : {}}
          transition={{ duration: 0.15 }}
          className={[
            'mt-3 w-full border-none rounded-lg py-[14px] px-5 text-[15px] font-semibold transition-all duration-200 ease-out',
            minimumThresholdMet ? 'cursor-pointer' : 'cursor-not-allowed',
          ].join(' ')}
          style={{
            background: minimumThresholdMet ? '#C9A84C' : 'rgba(201,168,76,0.12)',
            color: minimumThresholdMet ? '#091829' : 'rgba(245,240,232,0.45)',
          }}
        >
          {minimumThresholdMet
            ? 'Design My Room →'
            : 'Complete Budget + one more tab to continue'}
        </motion.button>

        {/* Helper text */}
        <p className="mt-2 text-[13px] text-cova-muted text-center">
          Your personalized redesign takes about 60 seconds.
        </p>
      </div>
    </div>
  )
}

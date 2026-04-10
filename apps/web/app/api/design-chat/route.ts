/**
 * POST /api/design-chat
 *
 * Single shared chatbot endpoint for Screen D's 6 tabs.
 *
 * Input:
 *   message          user's message (may be empty on first turn)
 *   activeTab        TabId — which system prompt to use
 *   roomId           for loading room_context / constraints / keep_mask
 *   tabHistory       full TabConversationState[] so we can resume any tab
 *   currentExtracted accumulated extractedData for this tab so far
 *   imageAttachment  optional base64 image
 *   urlInput         optional product URL — triggers scraping
 *
 * Output:
 *   reply            assistant text (sentinels stripped for display)
 *   extractedData    merged tab data
 *   tabComplete      true if [TAB_COMPLETE] was emitted
 *   scrapedProduct   ScrapedProduct | null
 *   artGenerationUrls string[] | null — resolved URLs from /api/generate-art when art was triggered
 */

import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { buildSystemPrompt } from '@/lib/ai/chat/systemPrompts'
import {
  extractStructuredData,
  type LooseTabExtracted,
} from '@/lib/ai/chat/extractStructuredData'
import { scrapeProductUrl } from '@/lib/ai/scraping/productScraper'
import type {
  KeepMask,
  RoomContext,
  RoomConstraints,
  TabConversationState,
  TabId,
} from '@/lib/types/area2'
import type { StyleFingerprint } from '@/types/fingerprint'

export const maxDuration = 90

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

interface Body {
  message: string
  activeTab: TabId
  roomId: string
  tabHistory: TabConversationState[]
  currentExtracted: LooseTabExtracted
  imageAttachment?: string
  // SHA-256 hex hash of the image bytes, computed client-side via SubtleCrypto.
  // Used to skip duplicate Vision calls when the same image is uploaded twice.
  contentHash?: string
  urlInput?: string
}

interface RoomRow {
  room_context: RoomContext | null
  room_constraints: RoomConstraints | null
  keep_mask: KeepMask | null
  render_context: { fingerprint?: StyleFingerprint } | null
}

function stripSentinels(text: string): string {
  return text
    .replace(/\[TAB_COMPLETE\]/gi, '')
    .replace(/\[GENERATE_ART:[^\]]+\]/gi, '')
    .trim()
}

export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await req.json()) as Body
  const {
    message,
    activeTab,
    roomId,
    tabHistory,
    currentExtracted,
    imageAttachment,
    contentHash,
    urlInput,
  } = body

  if (!activeTab || !roomId) {
    return NextResponse.json(
      { error: 'activeTab and roomId required' },
      { status: 400 }
    )
  }

  // Load room context for system prompt.
  const { data: roomData } = await supabase
    .from('rooms')
    .select('room_context, room_constraints, keep_mask, render_context')
    .eq('id', roomId)
    .eq('user_id', user.id)
    .maybeSingle()
  const room = (roomData ?? null) as RoomRow | null

  // Image deduplication: if the client sent a contentHash and an imageAttachment,
  // scan the conversation history for a prior user message containing the same
  // hash marker. If found, return the cached assistant response to avoid paying
  // for a duplicate Vision call on identical content.
  if (imageAttachment && contentHash) {
    const activeTabMessages =
      tabHistory.find((t) => t.tabId === activeTab)?.messages ?? []
    const hashMarker = `[img-hash:${contentHash.slice(0, 8)}]`
    const priorIdx = activeTabMessages.findIndex(
      (m) =>
        m.role === 'user' &&
        typeof m.content === 'string' &&
        (m.content as string).includes(hashMarker)
    )
    if (priorIdx !== -1) {
      const cachedReply = activeTabMessages[priorIdx + 1]
      console.log(`[design-chat] Skipping duplicate image hash: ${contentHash.slice(0, 8)}`)
      return NextResponse.json({
        reply:
          cachedReply?.role === 'assistant' && typeof cachedReply.content === 'string'
            ? (cachedReply.content as string)
            : 'I already analyzed this image earlier — feel free to ask more about it.',
        extractedData: currentExtracted,
        tabComplete: false,
        scrapedProduct: null,
        shouldGenerateArt: false,
        artPrompt: null,
        cached: true,
      })
    }
  }

  // If user pasted a URL, scrape it now so we can inject the result
  // into the user turn as context.
  const scrapedProduct = urlInput ? await scrapeProductUrl(urlInput) : null

  const fingerprint = room?.render_context?.fingerprint ?? null
  const baseSystemPrompt = buildSystemPrompt(activeTab, room, currentExtracted, fingerprint)

  const tabScoping: Partial<Record<TabId, string>> = {
    products: '\n\nSCOPING: Focus only on furniture and physical products — sofas, tables, rugs, lighting fixtures, decor objects. If the user mentions tech or art, acknowledge briefly and redirect to the Products conversation.',
    tech: '\n\nSCOPING: Focus only on technology and electronics — TVs, sound systems, smart lighting, hidden wiring, mounting solutions. If the user mentions furniture or art, acknowledge briefly and redirect to the Tech conversation.',
    art: '\n\nSCOPING: Focus only on wall art, posters, gallery walls, framing, and artistic decor. If the user mentions furniture or tech, acknowledge briefly and redirect to the Art conversation.',
  }
  const systemPrompt = baseSystemPrompt + (tabScoping[activeTab] ?? '')

  const activeTabMessages =
    tabHistory.find((t) => t.tabId === activeTab)?.messages ?? []

  // Build the current user turn. Claude's content array supports
  // mixed text + image; when we have a scraped product or URL input we
  // append a structured note to the text.
  const textParts: string[] = []
  if (message) textParts.push(message)
  if (urlInput) {
    textParts.push(`[The user pasted this URL: ${urlInput}]`)
  }
  if (scrapedProduct) {
    textParts.push(
      `[Scraped product: ${JSON.stringify(scrapedProduct)}]`
    )
  } else if (urlInput) {
    textParts.push(
      '[Scraping failed — ask the user to describe the product instead.]'
    )
  }

  const content: Anthropic.MessageParam['content'] =
    imageAttachment !== undefined
      ? [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: imageAttachment,
            },
          },
          { type: 'text', text: textParts.join('\n') || 'I uploaded this image.' },
        ]
      : textParts.join('\n') || '(opening)'

  const historyMessages: Anthropic.MessageParam[] = activeTabMessages.map(
    (m) => ({ role: m.role, content: m.content })
  )

  const messages: Anthropic.MessageParam[] = [
    ...historyMessages,
    { role: 'user', content },
  ]

  let rawReply = ''
  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    })
    rawReply =
      response.content[0]?.type === 'text' ? response.content[0].text : ''
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { error: 'chat_failed', detail: msg },
      { status: 502 }
    )
  }

  const extraction = await extractStructuredData(
    activeTab,
    rawReply,
    message,
    currentExtracted
  )

  // Fire art generation as fire-and-forget — do not await, return immediately.
  if (extraction.shouldGenerateArt && extraction.extractedData?.visualDirection) {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    const cookie = req.headers.get('cookie') ?? ''
    fetch(`${base}/api/generate-art`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({
        visualDirection: extraction.extractedData.visualDirection,
        roomId,
      }),
    }).catch((e) => console.error('[generate-art fire-and-forget]', e))
  }

  return NextResponse.json({
    reply: stripSentinels(rawReply),
    rawReply,
    extractedData: extraction.extractedData,
    tabComplete: extraction.tabComplete,
    scrapedProduct,
    shouldGenerateArt: extraction.shouldGenerateArt,
    artPrompt: extraction.artPrompt,
  })
}

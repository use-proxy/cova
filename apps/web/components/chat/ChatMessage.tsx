"use client"

import { useState, useEffect } from "react"
import { ProductSearchResult } from "./ProductSearchResult"

interface ChatMessageProps {
  role: "user" | "assistant"
  content: string
  isStreaming?: boolean
  isFirst?: boolean
}

function parseProducts(text: string) {
  const match = text.match(/<products>([\s\S]*?)<\/products>/)
  if (!match) return { cleanText: text, products: [] }
  try {
    const products = JSON.parse(match[1])
    const cleanText = text.replace(/<products>[\s\S]*?<\/products>/, "").trim()
    return { cleanText, products }
  } catch {
    return { cleanText: text, products: [] }
  }
}

export function ChatMessage({ role, content, isStreaming = false, isFirst = false }: ChatMessageProps) {
  const [displayedText, setDisplayedText] = useState(isStreaming ? "" : content)

  // Typewriter effect for streaming
  useEffect(() => {
    if (!isStreaming) {
      setDisplayedText(content)
      return
    }
    let i = 0
    const interval = setInterval(() => {
      i++
      setDisplayedText(content.slice(0, i))
      if (i >= content.length) clearInterval(interval)
    }, 12)
    return () => clearInterval(interval)
  }, [content, isStreaming])

  const { cleanText, products } = parseProducts(displayedText)

  if (role === "user") {
    return (
      <div className="flex justify-end animate-[msgRight_200ms_ease-out]">
        <div
          className="max-w-[80%] px-4 py-3 rounded-2xl rounded-br text-sm font-sans text-white leading-relaxed"
          style={{ background: "#0d1f3c", borderLeft: "2px solid #C9A84C" }}
        >
          {content}
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-2 max-w-[85%] animate-[msgLeft_200ms_ease-out]">
      <div>
        {/* Arch mark on first assistant message */}
        {isFirst && (
          <svg width="16" height="12" viewBox="0 0 32 20" fill="none" className="mt-3 flex-shrink-0">
            <path d="M2 18Q16 2 30 18" stroke="#C9A84C" strokeWidth="3" strokeLinecap="round" fill="none" />
          </svg>
        )}
      </div>
      <div
        className="px-4 py-3 rounded-2xl rounded-bl"
        style={{ background: "rgba(201,168,76,0.04)", border: "1px solid rgba(201,168,76,0.12)" }}
      >
        <p className="text-sm font-sans text-white leading-relaxed whitespace-pre-wrap">
          {cleanText}
          {isStreaming && <span className="animate-pulse text-[#C9A84C]">{"\u2588"}</span>}
        </p>
        {products.length > 0 && <ProductSearchResult products={products} />}
      </div>
    </div>
  )
}

"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { X, Minus } from "lucide-react"
import { ChatMessage } from "./ChatMessage"
import { ChatInput } from "./ChatInput"
import { TypingIndicator } from "./TypingIndicator"
import { SuggestionChips } from "./SuggestionChips"

export interface Message {
  id: string
  role: "user" | "assistant"
  content: string
}

interface RoomContext {
  styleFingerprint: Record<string, string | null>
  budgetTier: number
  budgetRange: string
  roomType: string
  furniture: string[]
  totalCost: number
}

interface ChatPanelProps {
  isOpen: boolean
  onClose: () => void
  onMinimize: () => void
  initialMessages?: Message[]
  context?: RoomContext
}

export function ChatPanel({ isOpen, onClose, onMinimize, initialMessages = [], context }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [isTyping, setIsTyping] = useState(false)
  const [streamingId, setStreamingId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isTyping])

  const sendMessage = useCallback(async (text: string) => {
    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: text }
    const updatedMessages = [...messages, userMsg]
    setMessages(updatedMessages)
    setIsTyping(true)

    const assistantId = crypto.randomUUID()

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updatedMessages.slice(-10).map((m) => ({ role: m.role, content: m.content })),
          context,
        }),
      })

      if (!res.ok || !res.body) {
        throw new Error("Chat API failed")
      }

      setIsTyping(false)
      setStreamingId(assistantId)

      // Stream tokens
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let fullText = ""

      // Add empty assistant message to start streaming into
      setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "" }])

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        fullText += decoder.decode(value, { stream: true })
        const currentText = fullText
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: currentText } : m))
        )
      }

      setStreamingId(null)
    } catch (err) {
      console.error("Chat error:", err)
      setIsTyping(false)
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: "assistant", content: "I'm having trouble connecting right now. Please try again." },
      ])
    }
  }, [messages, context])

  const isEmpty = messages.length === 0

  return (
    <div
      className="fixed z-50 flex flex-col overflow-hidden
        md:bottom-7 md:left-7 md:w-[400px] md:h-[600px] md:rounded-2xl
        max-md:bottom-0 max-md:left-0 max-md:right-0 max-md:h-[85vh] max-md:rounded-t-2xl"
      style={{
        background: "#0a1628",
        border: "1px solid rgba(201,168,76,0.2)",
        boxShadow: "0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(201,168,76,0.1)",
        transform: isOpen ? "translateY(0) scale(1)" : "translateY(20px) scale(0.95)",
        opacity: isOpen ? 1 : 0,
        pointerEvents: isOpen ? "auto" : "none",
        transition: "transform 400ms cubic-bezier(0.32, 0.72, 0, 1), opacity 300ms ease",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 h-16 flex-shrink-0"
        style={{ background: "#0d1f3c", borderBottom: "1px solid rgba(201,168,76,0.15)" }}
      >
        <div className="flex items-center gap-2.5">
          <svg width="20" height="14" viewBox="0 0 32 20" fill="none">
            <path d="M2 18Q16 2 30 18" stroke="#C9A84C" strokeWidth="3" strokeLinecap="round" fill="none" />
          </svg>
          <div>
            <p className="font-serif text-sm text-white">Cova AI</p>
            <p className="text-[10px] font-sans uppercase tracking-[0.1em] text-[#C9A84C]/60">Interior Design Assistant</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1 mr-2">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-[10px] font-sans text-white/40">Online</span>
          </div>
          <button onClick={onMinimize} className="w-8 h-8 rounded-full flex items-center justify-center text-white/40 hover:text-white/70 transition-colors" aria-label="Minimize">
            <Minus className="w-4 h-4" />
          </button>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-white/40 hover:text-white/70 transition-colors" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3 chat-scrollbar">
        {isEmpty && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <svg width="40" height="28" viewBox="0 0 32 20" fill="none" className="animate-[archBreathe_3s_ease-in-out_infinite]">
              <path d="M2 18Q16 2 30 18" stroke="#C9A84C" strokeWidth="2.5" strokeLinecap="round" fill="none" />
            </svg>
            <p className="font-serif text-lg text-white italic text-center">How can I help with your space?</p>
            <p className="text-xs font-sans text-white/40 text-center">Ask me anything about your redesign</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <ChatMessage
            key={msg.id}
            role={msg.role}
            content={msg.content}
            isStreaming={msg.id === streamingId}
            isFirst={msg.role === "assistant" && i === messages.findIndex((m) => m.role === "assistant")}
          />
        ))}

        {isTyping && <TypingIndicator />}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggestion chips */}
      {(isEmpty || (!isTyping && !streamingId && messages.length > 0)) && (
        <div className="px-4 pb-2">
          <SuggestionChips onSelect={sendMessage} />
        </div>
      )}

      {/* Input */}
      <ChatInput onSend={sendMessage} disabled={isTyping || streamingId !== null} />
    </div>
  )
}

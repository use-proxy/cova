"use client"

import { useState } from "react"
import { ChatBubble } from "@/components/chat/ChatBubble"
import { ChatPanel, type Message } from "@/components/chat/ChatPanel"

const MOCK_CONTEXT = {
  styleFingerprint: { primary: "warm-serene", secondary: "retro-organic", tertiary: "clean-essential" },
  budgetTier: 3,
  budgetRange: "$2,000 \u2013 $5,000",
  roomType: "living room",
  furniture: ["linen sofa", "oak coffee table", "floor lamp", "area rug", "side chair"],
  totalCost: 3240,
}

const PRELOADED_MESSAGES: Message[] = [
  { id: "m1", role: "user", content: "What's my total room cost?" },
  {
    id: "m2",
    role: "assistant",
    content:
      "Your current selection comes to $3,240. The linen sofa at $1,299 is your biggest investment, followed by the oak coffee table at $649. You're well within your $2,000\u20135,000 budget with room to add accent pieces.",
  },
  { id: "m3", role: "user", content: "Find me a floor lamp under $400" },
  {
    id: "m4",
    role: "assistant",
    content:
      'Here are three floor lamps that would complement your space perfectly.\n\n<products>\n[{"name":"Oda Floor Lamp","price":349,"retailer":"Article","image":"https://images.unsplash.com/photo-1507473885765-e6ed057ab3fe?w=300","url":"#"},{"name":"Arc Brass Lamp","price":289,"retailer":"CB2","image":"https://images.unsplash.com/photo-1543198126-a8ad8e47fb22?w=300","url":"#"},{"name":"Stick Floor Light","price":199,"retailer":"West Elm","image":"https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?w=300","url":"#"}]\n</products>',
  },
]

export default function ChatbotTestPage() {
  const [chatOpen, setChatOpen] = useState(false)

  return (
    <div className="fixed inset-0 bg-[#0a1628]">
      {/* Room background */}
      <div className="absolute inset-0">
        <img
          src="https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=1600"
          alt="Room"
          className="w-full h-full object-cover opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a1628] via-transparent to-[#0a1628]/50" />
      </div>

      {/* Chat bubble (visible when panel closed) */}
      {!chatOpen && (
        <ChatBubble onClick={() => setChatOpen(true)} hasUnread={false} />
      )}

      {/* Chat panel */}
      <ChatPanel
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
        onMinimize={() => setChatOpen(false)}
        initialMessages={PRELOADED_MESSAGES}
        context={MOCK_CONTEXT}
      />
    </div>
  )
}

"use client"

import { useState } from "react"
import { ChatBubble } from "@/components/chat/ChatBubble"
import { ChatPanel } from "@/components/chat/ChatPanel"

interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const [chatOpen, setChatOpen] = useState(false)

  return (
    <>
      {children}
      {!chatOpen && (
        <ChatBubble onClick={() => setChatOpen(true)} hasUnread={false} />
      )}
      <ChatPanel
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
        onMinimize={() => setChatOpen(false)}
      />
    </>
  )
}

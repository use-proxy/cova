"use client"

interface ChatBubbleProps {
  onClick: () => void
  hasUnread: boolean
}

export function ChatBubble({ onClick, hasUnread }: ChatBubbleProps) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-7 left-7 z-50 w-14 h-14 rounded-full flex items-center justify-center transition-transform duration-200 hover:scale-[1.08]"
      style={{
        background: "#C9A84C",
        animation: "bubblePulse 2.5s ease-out infinite",
      }}
      aria-label="Open chat"
    >
      {/* Cova arch mark */}
      <svg width="20" height="14" viewBox="0 0 32 20" fill="none">
        <path d="M2 18Q16 2 30 18" stroke="white" strokeWidth="3" strokeLinecap="round" fill="none" />
      </svg>

      {/* Unread badge */}
      {hasUnread && (
        <div
          className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-red-500 animate-[scaleIn_200ms_ease-out]"
          style={{ border: "2px solid #0a1628" }}
        />
      )}
    </button>
  )
}

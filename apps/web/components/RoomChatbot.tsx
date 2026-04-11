"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ---------- Types ----------

interface ChatProduct {
  product_url: string;
  image_url?: string;
  name: string;
  retailer?: string;
  price?: number;
}

interface StyleUpdateData {
  updated?: Record<string, number>;
  [key: string]: unknown;
}

interface CostItem {
  name: string;
  price?: number;
}

interface CostsData {
  category?: string;
  items?: CostItem[];
  total?: number;
  [key: string]: unknown;
}

type ToolResultData = ChatProduct[] | StyleUpdateData | CostsData;

interface ToolResult {
  type: "products" | "style_update" | "costs" | "filtered_products";
  data: ToolResultData;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolResults?: ToolResult[];
  createdAt: Date;
}

interface RoomChatbotProps {
  roomId: string;
}

interface HistoryMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  tool_results?: ToolResult[];
  created_at: string;
}

// ---------- Product Card ----------
function ProductCard({ product }: { product: ChatProduct }) {
  return (
    <a
      href={product.product_url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "flex",
        gap: 10,
        padding: 10,
        background: "#0A1628",
        borderRadius: 8,
        border: "1px solid #1E3A5F",
        textDecoration: "none",
        color: "#F8F6F1",
        marginTop: 6,
        transition: "border-color 200ms ease-out",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#C9A84C")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#1E3A5F")}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {product.image_url && (
        <img
          src={product.image_url}
          alt={product.name}
          style={{
            width: 56,
            height: 56,
            borderRadius: 6,
            objectFit: "cover",
            flexShrink: 0,
          }}
        />
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            lineHeight: "18px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {product.name}
        </div>
        <div style={{ fontSize: 12, color: "#8BA3C0", marginTop: 2 }}>
          {product.retailer}
        </div>
        {product.price && (
          <div
            style={{
              fontSize: 13,
              color: "#C9A84C",
              fontWeight: 600,
              marginTop: 2,
            }}
          >
            ${product.price.toLocaleString()}
          </div>
        )}
      </div>
    </a>
  );
}

// ---------- Style Update Card ----------
function StyleUpdateCard({ data }: { data: StyleUpdateData }) {
  const styles = data.updated || {};
  return (
    <div
      style={{
        padding: 10,
        background: "#0A1628",
        borderRadius: 8,
        border: "1px solid #1E3A5F",
        marginTop: 6,
        fontSize: 12,
      }}
    >
      <div style={{ color: "#C9A84C", fontWeight: 600, marginBottom: 6 }}>
        Style Updated
      </div>
      {Object.entries(styles).map(([key, val]) => (
        <div
          key={key}
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 3,
          }}
        >
          <span style={{ color: "#8BA3C0", textTransform: "capitalize" }}>
            {key.replace("_", " ")}
          </span>
          <span style={{ color: "#F8F6F1" }}>
            {Math.round((val as number) * 100)}%
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------- Costs Card ----------
function CostsCard({ data }: { data: CostsData }) {
  return (
    <div
      style={{
        padding: 10,
        background: "#0A1628",
        borderRadius: 8,
        border: "1px solid #1E3A5F",
        marginTop: 6,
        fontSize: 12,
      }}
    >
      <div style={{ color: "#C9A84C", fontWeight: 600, marginBottom: 6 }}>
        Room Costs {data.category !== "all" ? `(${data.category})` : ""}
      </div>
      {data.items?.map((item: CostItem, i: number) => (
        <div
          key={i}
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 2,
          }}
        >
          <span
            style={{
              color: "#8BA3C0",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: "70%",
            }}
          >
            {item.name}
          </span>
          <span style={{ color: "#F8F6F1" }}>
            ${item.price?.toLocaleString()}
          </span>
        </div>
      ))}
      <div
        style={{
          borderTop: "1px solid #1E3A5F",
          marginTop: 6,
          paddingTop: 6,
          display: "flex",
          justifyContent: "space-between",
          fontWeight: 600,
        }}
      >
        <span style={{ color: "#F8F6F1" }}>Total</span>
        <span style={{ color: "#C9A84C" }}>
          ${data.total?.toLocaleString()}
        </span>
      </div>
    </div>
  );
}

// ---------- Tool Results Renderer ----------
function ToolResultsRenderer({ results }: { results: ToolResult[] }) {
  return (
    <>
      {results.map((result, i) => {
        switch (result.type) {
          case "products":
          case "filtered_products":
            return (
              <div key={i}>
                {Array.isArray(result.data) &&
                  result.data.map((product: ChatProduct, j: number) => (
                    <ProductCard key={j} product={product} />
                  ))}
                {(!result.data ||
                  (Array.isArray(result.data) && result.data.length === 0)) && (
                  <div
                    style={{
                      fontSize: 12,
                      color: "#8BA3C0",
                      marginTop: 6,
                      fontStyle: "italic",
                    }}
                  >
                    No matching products found.
                  </div>
                )}
              </div>
            );
          case "style_update":
            return (
              <StyleUpdateCard key={i} data={result.data as StyleUpdateData} />
            );
          case "costs":
            return <CostsCard key={i} data={result.data as CostsData} />;
          default:
            return null;
        }
      })}
    </>
  );
}

// ---------- Typing Indicator ----------
function TypingIndicator() {
  return (
    <div style={{ display: "flex", gap: 4, padding: "8px 0" }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "#8BA3C0",
            animation: `chatBounce 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

// ---------- Main Component ----------
export default function RoomChatbot({ roomId }: RoomChatbotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Load history on first open
  useEffect(() => {
    if (isOpen && !historyLoaded) {
      loadHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, historyLoaded]);

  // Scroll when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isOpen]);

  async function loadHistory() {
    try {
      const res = await fetch(`/api/chat/history?roomId=${roomId}`);
      if (res.ok) {
        const { messages: history } = (await res.json()) as {
          messages: HistoryMessage[];
        };
        setMessages(
          (history || []).map((m: HistoryMessage) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            toolResults: m.tool_results || undefined,
            createdAt: new Date(m.created_at),
          })),
        );
      }
    } catch {
      // Silently fail — user can still send new messages
    }
    setHistoryLoaded(true);
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || isLoading) return;

    setInput("");

    // Optimistic user message
    const userMsg: Message = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: text,
      createdAt: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, message: text }),
      });

      if (!res.ok) {
        throw new Error(`Chat API error: ${res.status}`);
      }

      const data = await res.json();

      const assistantMsg: Message = {
        id: `resp-${Date.now()}`,
        role: "assistant",
        content: data.response,
        toolResults:
          data.toolResults?.length > 0 ? data.toolResults : undefined,
        createdAt: new Date(),
      };
      setMessages((prev) => [...prev, assistantMsg]);

      // Emit style update event if applicable
      if (data.updatedStyleBlend) {
        window.dispatchEvent(
          new CustomEvent("cova:styleUpdated", {
            detail: data.updatedStyleBlend,
          }),
        );
      }
    } catch {
      const errorMsg: Message = {
        id: `err-${Date.now()}`,
        role: "assistant",
        content: "Sorry, I couldn't process that. Please try again.",
        createdAt: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <>
      {/* CSS keyframes */}
      <style>{`
        @keyframes chatBounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-4px); }
        }
        @keyframes chatSlideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes chatSlideOut {
          from { transform: translateX(0); opacity: 1; }
          to { transform: translateX(100%); opacity: 0; }
        }
      `}</style>

      {/* Floating toggle button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          style={{
            position: "fixed",
            bottom: 80,
            left: 20,
            width: 52,
            height: 52,
            borderRadius: "50%",
            background: "#C9A84C",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 4px 20px rgba(201, 168, 76, 0.3)",
            zIndex: 1000,
            transition: "transform 200ms ease-out, box-shadow 200ms ease-out",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "scale(1.08)";
            e.currentTarget.style.boxShadow =
              "0 6px 24px rgba(201, 168, 76, 0.45)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "scale(1)";
            e.currentTarget.style.boxShadow =
              "0 4px 20px rgba(201, 168, 76, 0.3)";
          }}
          aria-label="Open chat assistant"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
              fill="#0A1628"
              stroke="#0A1628"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}

      {/* Chat panel */}
      {isOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            width: 380,
            maxWidth: "100vw",
            height: "100vh",
            background: "#0F1F3D",
            borderLeft: "1px solid #1E3A5F",
            display: "flex",
            flexDirection: "column",
            zIndex: 1001,
            animation: "chatSlideIn 200ms ease-out forwards",
            fontFamily: "Inter, sans-serif",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "16px 20px",
              borderBottom: "1px solid #1E3A5F",
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "#4A9B7F",
                }}
              />
              <span style={{ color: "#F8F6F1", fontSize: 15, fontWeight: 600 }}>
                Cova Assistant
              </span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              style={{
                background: "none",
                border: "none",
                color: "#8BA3C0",
                cursor: "pointer",
                padding: 4,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "color 200ms ease-out",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#F8F6F1")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#8BA3C0")}
              aria-label="Close chat"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path
                  d="M18 6L6 18M6 6l12 12"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "16px 16px 8px",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            {messages.length === 0 && !isLoading && (
              <div
                style={{
                  textAlign: "center",
                  color: "#8BA3C0",
                  fontSize: 13,
                  padding: "40px 20px",
                  lineHeight: "20px",
                }}
              >
                Ask me anything about your room — I can adjust your style, find
                products, calculate costs, and give design advice.
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: msg.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: "88%",
                  alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                }}
              >
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: 20,
                    fontSize: 14,
                    lineHeight: "20px",
                    ...(msg.role === "user"
                      ? {
                          background: "#C9A84C",
                          color: "#0A1628",
                          borderBottomRightRadius: 6,
                        }
                      : {
                          background: "#0A1628",
                          color: "#F8F6F1",
                          border: "1px solid #1E3A5F",
                          borderBottomLeftRadius: 6,
                        }),
                  }}
                >
                  {msg.content}
                </div>
                {msg.toolResults && (
                  <ToolResultsRenderer results={msg.toolResults} />
                )}
              </div>
            ))}

            {isLoading && (
              <div style={{ alignSelf: "flex-start" }}>
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: 20,
                    borderBottomLeftRadius: 6,
                    background: "#0A1628",
                    border: "1px solid #1E3A5F",
                  }}
                >
                  <TypingIndicator />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div
            style={{
              padding: "12px 16px",
              borderTop: "1px solid #1E3A5F",
              display: "flex",
              gap: 8,
              flexShrink: 0,
            }}
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your room..."
              style={{
                flex: 1,
                padding: "10px 14px",
                borderRadius: 8,
                border: "1px solid #1E3A5F",
                background: "#0A1628",
                color: "#F8F6F1",
                fontSize: 14,
                fontFamily: "Inter, sans-serif",
                outline: "none",
                transition: "border-color 200ms ease-out",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#C9A84C")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "#1E3A5F")}
              disabled={isLoading}
            />
            <button
              onClick={sendMessage}
              disabled={isLoading || !input.trim()}
              style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                border: "none",
                background: input.trim() && !isLoading ? "#C9A84C" : "#1E3A5F",
                cursor: input.trim() && !isLoading ? "pointer" : "default",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "background 200ms ease-out",
                flexShrink: 0,
              }}
              aria-label="Send message"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path
                  d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"
                  stroke={input.trim() && !isLoading ? "#0A1628" : "#8BA3C0"}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}

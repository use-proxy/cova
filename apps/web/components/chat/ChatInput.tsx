"use client";

import { useState, useRef, useCallback } from "react";
import { ArrowUp } from "lucide-react";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled = false }: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [value, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleInput = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 96) + "px"; // max 4 lines ~96px
  }, []);

  const hasContent = value.trim().length > 0;

  return (
    <div
      className="px-4 py-3 flex-shrink-0"
      style={{
        background: "#0d1f3c",
        borderTop: "1px solid rgba(201,168,76,0.15)",
      }}
    >
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            handleInput();
          }}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your room..."
          rows={1}
          className="w-full resize-none text-sm font-sans text-white placeholder:text-white/40 pr-12 pl-4 py-2.5 rounded-xl outline-none transition-all duration-200"
          style={{
            background: "rgba(10,22,40,0.8)",
            border: "1px solid rgba(201,168,76,0.2)",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "rgba(201,168,76,0.5)";
            e.currentTarget.style.boxShadow = "0 0 0 3px rgba(201,168,76,0.08)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "rgba(201,168,76,0.2)";
            e.currentTarget.style.boxShadow = "none";
          }}
        />
        <button
          onClick={handleSend}
          disabled={!hasContent || disabled}
          className="absolute right-2 bottom-2 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 disabled:opacity-30 hover:scale-110 active:scale-90"
          style={{
            background:
              hasContent && !disabled ? "#C9A84C" : "rgba(201,168,76,0.3)",
          }}
          aria-label="Send message"
        >
          <ArrowUp className="w-4 h-4 text-[#0a1628]" />
        </button>
      </div>
      {value.length > 200 && (
        <p className="text-[10px] text-white/30 text-right mt-1 font-sans">
          {value.length}
        </p>
      )}
    </div>
  );
}

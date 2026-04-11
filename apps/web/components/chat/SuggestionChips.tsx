"use client";

const SUGGESTIONS = [
  "What's my total room cost?",
  "Make it more minimalist",
  "Find sofas under $1,000",
  "Change the color palette to warm tones",
  "What style is this room?",
  "Find similar items in black",
  "How do I style this sofa?",
  "Show me lighting options",
];

interface SuggestionChipsProps {
  onSelect: (text: string) => void;
}

export function SuggestionChips({ onSelect }: SuggestionChipsProps) {
  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2 px-1">
      {SUGGESTIONS.map((text, i) => (
        <button
          key={text}
          onClick={() => onSelect(text)}
          className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-sans text-[#C9A84C]/80 transition-all duration-200 hover:bg-[rgba(201,168,76,0.12)] hover:border-[#C9A84C]/50"
          style={{
            border: "1px solid rgba(201,168,76,0.3)",
            background: "rgba(201,168,76,0.06)",
            animation: `fadeIn 200ms ease-out ${i * 50}ms both`,
          }}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

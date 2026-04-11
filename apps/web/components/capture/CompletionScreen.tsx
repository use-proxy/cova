"use client";

import { Check } from "lucide-react";

export function CompletionScreen() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[var(--navy-deep)] animate-[fadeIn_500ms_ease-out]">
      {/* Gold checkmark */}
      <div className="w-20 h-20 rounded-full bg-[var(--gold)] flex items-center justify-center mb-8 animate-[scaleIn_400ms_ease-out]">
        <Check className="w-10 h-10 text-[var(--navy-deep)]" strokeWidth={3} />
      </div>

      <h2 className="font-serif text-3xl text-[var(--ivory)] mb-3">
        Room captured.
      </h2>

      <p className="font-sans text-sm text-[var(--gold)]/60 uppercase tracking-[0.2em]">
        Building your style quiz...
      </p>
    </div>
  );
}

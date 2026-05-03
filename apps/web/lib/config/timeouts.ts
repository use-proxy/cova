// Single source of truth for timeout values (ms).
// Hardcoded numerals 180000/290000/300000/320000/420000 outside this file are blocked by ESLint.

export const TIMEOUTS = {
  /** Vercel route maximum execution time before the platform kills the function. */
  VERCEL_ROUTE: 290_000,
  /** Modal app web endpoint timeout. */
  MODAL_APP: 300_000,
  /** fal.ai client timeout (longer than Modal so we don't error on a Modal-side success that's slow). */
  FAL_CLIENT: 320_000,
  /** Anthropic Sonnet vision call (planner / classifier / detector). */
  ANTHROPIC_VISION: 60_000,
  /** Anthropic Sonnet director (text-only prompt assembly). */
  ANTHROPIC_DIRECTOR: 30_000,
  /** Anthropic Haiku classifier. */
  HAIKU_CLASSIFIER: 15_000,
  /** Long client-side polling window (step-7 / step-8a render-status polling). */
  CLIENT_POLL_LONG: 180_000,
  /** Redesign Modal call upper bound (~7 min; V9 path runs longer than MODAL_APP). */
  REDESIGN_MODAL: 420_000,
} as const;

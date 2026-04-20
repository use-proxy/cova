import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { StyleFingerprint } from "@/types/fingerprint";

export type { StyleFingerprint };

export interface PairwiseResponse {
  /** Single id from quiz_comparison_pairs.id (Session C). */
  pairId: string;
  /** Which side of the pair the user chose. 'skip' is reserved for a future
   *  UI session — the current step-3 quiz only emits 'A' or 'B'. */
  chosenSide: "A" | "B" | "skip";
  responseTimeMs: number;
}

export interface ShowcasePrediction {
  predictionId: string;
  label: string;
}

type BudgetTier = "budget" | "mid" | "premium" | "luxury";

export interface GridSelection {
  styleIndex: number;
  styleName: string;
  round: number;
}

interface FingerprintState {
  roomType: string | null;
  budgetTier: BudgetTier | null;
  budgetRange: [number, number] | null;
  isGiftMode: boolean;
  phaseASelections: string[];
  gridSelections: GridSelection[];
  phaseBResponses: PairwiseResponse[];
  fingerprint: StyleFingerprint | null;
  styleName: string | null;
  styleTags: string[];
  styleExplanation: string | null;
  showcasePredictionIds: ShowcasePrediction[];
  // Step-5 space details — persisted so render route receives them
  inclusions: string[];
  constraints: string[];
  roomDimension: "small" | "medium" | "large" | null;
  /** Direct V2 6-dim adjustments from tie-breaker Q1. Null if no tie was detected. */
  tiebreakerDeltas: number[] | null;
  /** Top-2 style names competing after step-2, used to target pairwise in step-3. */
  competingStyles: string[];
  /** Primary style blend ratio from step-2 softmax. <0.65 = ambiguous, run pairwise. */
  blendRatio: number;
  /** V3 anchor question results from step-2. Null if user took V2 quiz. */
  anchorPrior: Record<string, number> | null;

  setRoomType: (roomType: string) => void;
  setBudget: (tier: BudgetTier, range: [number, number]) => void;
  setGiftMode: (enabled: boolean) => void;
  addPhaseASelection: (imageId: string) => void;
  removePhaseASelection: (imageId: string) => void;
  addGridSelection: (selection: GridSelection) => void;
  clearGridSelections: () => void;
  addPhaseBResponse: (response: PairwiseResponse) => void;
  setFingerprint: (
    fingerprint: StyleFingerprint,
    styleName: string,
    styleTags: string[],
  ) => void;
  setStyleExplanation: (explanation: string) => void;
  setShowcasePredictionIds: (ids: ShowcasePrediction[]) => void;
  setInclusions: (inclusions: string[]) => void;
  setConstraints: (constraints: string[]) => void;
  setRoomDimension: (dimension: "small" | "medium" | "large") => void;
  setTiebreakerDeltas: (deltas: number[] | null) => void;
  setCompetingStyles: (styles: string[], blendRatio: number) => void;
  setAnchorPrior: (prior: Record<string, number>) => void;
  resetFingerprint: () => void;
}

/**
 * Cookie name used to persist fingerprint state across OAuth redirects.
 *
 * Two-layer persistence strategy:
 *   PRIMARY   — cookie `cova_anon_fingerprint` (Path=/, SameSite=Lax, Max-Age=3600).
 *               Survives cross-origin OAuth redirects where sessionStorage is wiped.
 *               Base64url-encoded JSON. If the encoded value exceeds 3800 bytes
 *               (cookie size headroom), falls back to sessionStorage with a warning.
 *   SECONDARY — sessionStorage, read-only fallback for same-tab reads before any
 *               redirect occurs. Never written to directly (except the size overflow case).
 *
 * The OAuth callback route (app/auth/callback/route.ts) reads this cookie after
 * successful session establishment and persists the fingerprint to Supabase
 * style_fingerprints under the newly authenticated user, then clears the cookie.
 */
const COOKIE_NAME = "cova_anon_fingerprint";

/**
 * Custom storage adapter that writes fingerprint state to a cookie so it
 * survives OAuth redirects. All cookie operations are wrapped in try/catch
 * because cookie access can fail in certain iframe / privacy-restricted contexts
 * and must never crash the app.
 */
const fingerprintCookieStorage = {
  getItem: (_name: string): string | null => {
    try {
      if (typeof document === "undefined") return null;
      // Primary: read from cookie
      const cookies = document.cookie.split("; ");
      for (const cookie of cookies) {
        const eqIdx = cookie.indexOf("=");
        if (eqIdx === -1) continue;
        const key = cookie.slice(0, eqIdx);
        if (key === COOKIE_NAME) {
          const encoded = cookie.slice(eqIdx + 1);
          try {
            return decodeURIComponent(atob(encoded));
          } catch {
            return null;
          }
        }
      }
      // No secondary fallback — sessionStorage removed per CLAUDE.md Rule 1
      return null;
    } catch {
      return null;
    }
  },

  setItem: (_name: string, value: string): void => {
    try {
      if (typeof document === "undefined") return;
      const encoded = btoa(encodeURIComponent(value));
      if (encoded.length > 3800) {
        console.warn(
          "[fingerprint-store] Cookie value exceeds 3800 bytes — data will not persist across redirects",
        );
        // No sessionStorage fallback per CLAUDE.md Rule 1. The covariance
        // matrix is stripped from the cookie payload (partialize) to stay
        // under 3000 bytes, so this branch should rarely fire.
        return;
      }
      const isProduction =
        typeof process !== "undefined" && process.env.NODE_ENV === "production";
      const secure = isProduction ? "; Secure" : "";
      document.cookie = `${COOKIE_NAME}=${encoded}; Path=/; SameSite=Lax; Max-Age=3600${secure}`;
    } catch {
      // Cookie access can fail in restrictive iframe / privacy contexts — ignore silently
    }
  },

  removeItem: (_name: string): void => {
    try {
      if (typeof document === "undefined") return;
      document.cookie = `${COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`;
    } catch {
      /* ignore */
    }
  },
};

const INITIAL_STATE = {
  roomType: null,
  budgetTier: null,
  budgetRange: null,
  isGiftMode: false,
  phaseASelections: [],
  gridSelections: [] as GridSelection[],
  phaseBResponses: [],
  fingerprint: null,
  styleName: null,
  styleTags: [],
  styleExplanation: null,
  showcasePredictionIds: [],
  inclusions: [] as string[],
  constraints: [] as string[],
  roomDimension: null as "small" | "medium" | "large" | null,
  tiebreakerDeltas: null as number[] | null,
  competingStyles: [] as string[],
  blendRatio: 1.0,
  anchorPrior: null as Record<string, number> | null,
};

export const useFingerprintStore = create<FingerprintState>()(
  persist(
    (set) => ({
      ...INITIAL_STATE,
      setRoomType: (roomType) => set({ roomType }),
      setBudget: (tier, range) => set({ budgetTier: tier, budgetRange: range }),
      setGiftMode: (isGiftMode) => set({ isGiftMode }),
      addPhaseASelection: (imageId) =>
        set((state) => ({
          phaseASelections: [...state.phaseASelections, imageId],
        })),
      removePhaseASelection: (imageId) =>
        set((state) => ({
          phaseASelections: state.phaseASelections.filter(
            (id) => id !== imageId,
          ),
        })),
      addGridSelection: (selection) =>
        set((state) => ({
          gridSelections: [...state.gridSelections, selection],
        })),
      clearGridSelections: () => set({ gridSelections: [] }),
      addPhaseBResponse: (response) =>
        set((state) => ({
          phaseBResponses: [...state.phaseBResponses, response],
        })),
      setFingerprint: (fingerprint, styleName, styleTags) =>
        set({ fingerprint, styleName, styleTags }),
      setStyleExplanation: (styleExplanation) => set({ styleExplanation }),
      setShowcasePredictionIds: (showcasePredictionIds) =>
        set({ showcasePredictionIds }),
      setInclusions: (inclusions) => set({ inclusions }),
      setConstraints: (constraints) => set({ constraints }),
      setRoomDimension: (roomDimension) => set({ roomDimension }),
      setTiebreakerDeltas: (tiebreakerDeltas) => set({ tiebreakerDeltas }),
      setCompetingStyles: (competingStyles, blendRatio) => set({ competingStyles, blendRatio }),
      setAnchorPrior: (anchorPrior) => set({ anchorPrior }),
      resetFingerprint: () => set(INITIAL_STATE),
    }),
    {
      name: "cova-fingerprint-v1",
      // createJSONStorage wraps our cookie adapter so Zustand gets the
      // PersistStorage<T> interface it expects (parse/stringify handled for us).
      storage: createJSONStorage(() => fingerprintCookieStorage),
      partialize: (state) => ({
        roomType: state.roomType,
        budgetTier: state.budgetTier,
        budgetRange: state.budgetRange,
        isGiftMode: state.isGiftMode,
        phaseASelections: state.phaseASelections,
        gridSelections: state.gridSelections.map(s => ({
          styleIndex: s.styleIndex,
          round: s.round,
          styleName: '',
        })),
        // phaseBResponses: omitted — transient, rebuilt each session
        fingerprint: state.fingerprint ? {
          ...state.fingerprint,
          covariance: undefined,
        } : null,
        styleName: state.styleName,
        styleTags: state.styleTags,
        styleExplanation: state.styleExplanation,
        // showcasePredictionIds: omitted — not needed in quiz flow
        inclusions: state.inclusions,
        constraints: state.constraints,
        roomDimension: state.roomDimension,
        // tiebreakerDeltas: omitted — in-session only, step-2 is single page load
        competingStyles: state.competingStyles,
        blendRatio: state.blendRatio,
        anchorPrior: state.anchorPrior,
      }),
    },
  ),
);

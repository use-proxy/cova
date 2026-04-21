/**
 * Area 2 — RenderContext assembler.
 *
 * Pure helper that takes all accumulated Screen A→D data and assembles
 * the unified RenderContext, including the FLUX prompt. The canonical
 * path for UI code is `useArea2Store.getState().assembleRenderContext(userId)`,
 * which delegates to this helper's logic. This module exists so server
 * code (API routes, tests) can assemble a context without loading the
 * client store.
 */

import { buildFluxPromptFromContext } from "@/lib/ai/flux";
import type {
  RenderContext,
  RoomContext,
  RoomConstraints,
  KeepMask,
  BudgetProfile,
  RequestedProduct,
  ArtBrief,
  TechSpec,
  SensoryProfile,
  IdentityBrief,
  TabConversationState,
} from "@/lib/types/area2";
import type { StyleFingerprint, AnyFingerprint } from "@/types/fingerprint";
import {
  fingerprintToStyleBlend,
  type DimensionName,
} from "@/lib/quiz/style-archetypes";

export interface AssembleInput {
  roomId: string;
  userId: string;
  roomContext: RoomContext;
  roomConstraints: RoomConstraints;
  keepMask: KeepMask;
  budget: BudgetProfile;
  requestedProducts: RequestedProduct[];
  artBrief: ArtBrief | null;
  techSpec: TechSpec | null;
  sensoryProfile: SensoryProfile | null;
  identityBrief: IdentityBrief | null;
  tabStates: TabConversationState[];
  fingerprint?: StyleFingerprint;
}

function defaultTechSpec(): TechSpec {
  return {
    hasTV: false,
    audioSetup: "none",
    smartLighting: false,
    hasWorkFromHome: false,
    hasGamingSetup: false,
  };
}

function defaultSensoryProfile(): SensoryProfile {
  return {
    throwCushionDensity: 2,
    plantPresence: "none",
    hasCandles: false,
    hasRug: false,
    windowTreatments: "none",
    hasDiffuser: false,
    overallDensity: "balanced",
  };
}

function defaultArtBrief(): ArtBrief {
  return {
    hasArtDirection: false,
    visualDirection: "",
    colorPalette: [],
    mood: "",
    abstractionLevel: "semi-abstract",
    subjectMatter: "",
    frameStyle: "gallery-wrap",
    placement: "ai-decides",
    galleryWall: false,
    includesPersonalPhotos: false,
    hasBookCollection: false,
    hasVinylCollection: false,
    copyrightSafe: true,
  };
}

function defaultIdentityBrief(): IdentityBrief {
  return { moodTarget: "", moodKeywords: [], personalityTags: [] };
}

/**
 * F3-BLEND-CTX.1 — compute the archetype distribution (`style_blend`) from a
 * V3 fingerprint. Returns `undefined` for v1/v2 fingerprints (their dims don't
 * align with the 12-dim archetype space) so the Director falls back to single-
 * primary LoRA selection. The Director then consumes this via
 * `buildLorasFromBlend` in `design-director.ts`.
 */
function deriveStyleBlend(
  fingerprint: StyleFingerprint | undefined,
): Record<string, number> | undefined {
  if (!fingerprint) return undefined;
  const version = (fingerprint as AnyFingerprint).fingerprint_version;
  if (version !== "v3") return undefined;
  const dims = fingerprint.dimensions as unknown as Record<DimensionName, number>;
  return fingerprintToStyleBlend(dims);
}

export function assembleRenderContext(input: AssembleInput): RenderContext {
  const tabsComplete = input.tabStates
    .filter((t) => t.isComplete)
    .map((t) => t.tabId);

  const budgetDone = tabsComplete.includes("budget");
  const otherDone = tabsComplete.some((id) => id !== "budget");

  const styleBlend = deriveStyleBlend(input.fingerprint);

  const context: RenderContext = {
    schemaVersion: "2.0",
    roomId: input.roomId,
    userId: input.userId,
    assembledAt: new Date().toISOString(),
    roomContext: input.roomContext,
    roomConstraints: input.roomConstraints,
    keepMask: input.keepMask,
    budget: input.budget,
    requestedProducts: input.requestedProducts,
    artBrief: input.artBrief ?? defaultArtBrief(),
    techSpec: input.techSpec ?? defaultTechSpec(),
    sensoryProfile: input.sensoryProfile ?? defaultSensoryProfile(),
    identityBrief: input.identityBrief ?? defaultIdentityBrief(),
    tabStates: input.tabStates,
    minimumThresholdMet: budgetDone && otherDone,
    tabsComplete,
    fingerprint: input.fingerprint,
    style_blend: styleBlend,
    styleBlend: styleBlend,
  };

  context.fluxPrompt = buildFluxPromptFromContext(context);
  context.fluxPromptVersion = "2.0.0";

  return context;
}

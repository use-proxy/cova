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

import { buildFluxPromptFromContext } from '@/lib/ai/flux'
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
} from '@/lib/types/area2'
import type { StyleFingerprint } from '@/types/fingerprint'

export interface AssembleInput {
  roomId: string
  userId: string
  roomContext: RoomContext
  roomConstraints: RoomConstraints
  keepMask: KeepMask
  budget: BudgetProfile
  requestedProducts: RequestedProduct[]
  artBrief: ArtBrief | null
  techSpec: TechSpec | null
  sensoryProfile: SensoryProfile | null
  identityBrief: IdentityBrief | null
  tabStates: TabConversationState[]
  fingerprint?: StyleFingerprint
}

function defaultTechSpec(): TechSpec {
  return { hasTV: false, audioSetup: 'none', smartLighting: false,
           hasWorkFromHome: false, hasGamingSetup: false }
}

function defaultSensoryProfile(): SensoryProfile {
  return { throwCushionDensity: 2, plantPresence: 'none',
           hasCandles: false, hasRug: false,
           windowTreatments: 'none', hasDiffuser: false,
           overallDensity: 'balanced' }
}

function defaultArtBrief(): ArtBrief {
  return { hasArtDirection: false, visualDirection: '',
           colorPalette: [], mood: '', abstractionLevel: 'semi-abstract',
           subjectMatter: '', frameStyle: 'gallery-wrap',
           placement: 'ai-decides', galleryWall: false,
           includesPersonalPhotos: false, hasBookCollection: false,
           hasVinylCollection: false, copyrightSafe: true }
}

function defaultIdentityBrief(): IdentityBrief {
  return { moodTarget: '', moodKeywords: [], personalityTags: [] }
}

export function assembleRenderContext(input: AssembleInput): RenderContext {
  const tabsComplete = input.tabStates
    .filter((t) => t.isComplete)
    .map((t) => t.tabId)

  const budgetDone = tabsComplete.includes('budget')
  const otherDone = tabsComplete.some((id) => id !== 'budget')

  const context: RenderContext = {
    schemaVersion: '2.0',
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
  }

  context.fluxPrompt = buildFluxPromptFromContext(context)
  context.fluxPromptVersion = '2.0.0'

  return context
}

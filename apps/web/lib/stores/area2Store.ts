/**
 * Area 2 — Zustand store for screens A → D.
 *
 * Single source of truth for detection pipeline output, user overrides
 * on every screen, and the assembled render context. Persisted so users
 * can navigate away mid-session without losing progress.
 *
 * NOTE: persist middleware uses the browser storage layer for UI state
 * only. Rule 1 (no localStorage) concerns Supabase *auth* state, not
 * zustand UI state — the existing lib/store/room.ts uses the same
 * pattern.
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { buildFluxPromptFromContext } from '@/lib/ai/flux'
import { useFingerprintStore } from '@/lib/store/fingerprint'
import type {
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
  TabId,
  TabExtractedData,
  RenderContext,
} from '@/lib/types/area2'

// ─── Defaults for optional tabs ────────────────────────────────────────────
// These are used when a user completes budget + one other tab but skips the
// remaining optional tabs. assembleRenderContext never returns null due to
// missing optional tabs — it fills in safe defaults instead.

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

type DesignStep = 0 | 1 | 2 | 3 | 4

interface Area2State {
  roomId: string | null
  imageUrl: string | null
  currentStep: DesignStep

  // Screen A
  roomContext: RoomContext | null
  roomContextLoading: boolean

  // Screen B
  roomConstraints: RoomConstraints | null

  // Screen C
  keepMask: KeepMask | null
  detectionStatus: 'pending' | 'running' | 'complete' | 'failed'
  selectedObjectId: string | null

  // Screen D
  activeTab: TabId
  tabStates: TabConversationState[]
  budget: BudgetProfile | null
  requestedProducts: RequestedProduct[]
  artBrief: ArtBrief | null
  techSpec: TechSpec | null
  sensoryProfile: SensoryProfile | null
  identityBrief: IdentityBrief | null

  // Assembled
  renderContext: RenderContext | null
  minimumThresholdMet: boolean
}

interface Area2Actions {
  // Session
  setRoom: (roomId: string, imageUrl: string) => void
  setCurrentStep: (step: DesignStep) => void

  // Screen A
  setRoomContextLoading: (loading: boolean) => void
  setRoomContext: (ctx: RoomContext) => void
  updateRoomContextField: <K extends keyof RoomContext>(
    key: K,
    value: RoomContext[K]
  ) => void

  // Screen B
  setRoomConstraints: (constraints: RoomConstraints) => void

  // Screen C
  setKeepMask: (mask: KeepMask) => void
  setDetectionStatus: (status: Area2State['detectionStatus']) => void
  toggleObjectKeep: (objectId: string) => void
  toggleObjectImmovable: (objectId: string) => void
  setObjectNote: (objectId: string, note: string) => void
  setSelectedObject: (id: string | null) => void
  setZoneOfInterest: (zone: KeepMask['zoneOfInterest']) => void

  // Screen D
  setActiveTab: (tab: TabId) => void
  appendTabMessage: (
    tabId: TabId,
    role: 'user' | 'assistant',
    content: string
  ) => void
  updateTabExtractedData: (tabId: TabId, data: TabExtractedData) => void
  markTabComplete: (tabId: TabId, reason?: string) => void
  setBudget: (budget: BudgetProfile) => void
  addRequestedProduct: (product: RequestedProduct) => void
  removeRequestedProduct: (productId: string) => void
  setArtBrief: (brief: ArtBrief) => void
  setTechSpec: (spec: TechSpec) => void
  setSensoryProfile: (profile: SensoryProfile) => void
  setIdentityBrief: (brief: IdentityBrief) => void

  // Assembly
  assembleRenderContext: (userId: string) => RenderContext | null
  reset: () => void
}

type Area2Store = Area2State & Area2Actions

const initialState: Area2State = {
  roomId: null,
  imageUrl: null,
  currentStep: 0,
  roomContext: null,
  roomContextLoading: false,
  roomConstraints: null,
  keepMask: null,
  detectionStatus: 'pending',
  selectedObjectId: null,
  activeTab: 'all',
  tabStates: [],
  budget: null,
  requestedProducts: [],
  artBrief: null,
  techSpec: null,
  sensoryProfile: null,
  identityBrief: null,
  renderContext: null,
  minimumThresholdMet: false,
}

function getOrCreateTab(
  tabStates: TabConversationState[],
  tabId: TabId
): { state: TabConversationState; index: number } {
  let index = tabStates.findIndex((t) => t.tabId === tabId)
  if (index === -1) {
    const fresh: TabConversationState = {
      tabId,
      messages: [],
      isComplete: false,
      extractedData: {},
    }
    tabStates.push(fresh)
    index = tabStates.length - 1
  }
  const state = tabStates[index]!
  return { state, index }
}

export const useArea2Store = create<Area2Store>()(
  persist(
    (set, get) => ({
      ...initialState,

      setRoom: (roomId, imageUrl) => set({ roomId, imageUrl }),
      setCurrentStep: (step) => set({ currentStep: step }),

      // Screen A
      setRoomContextLoading: (loading) =>
        set({ roomContextLoading: loading }),
      setRoomContext: (ctx) => set({ roomContext: ctx }),
      updateRoomContextField: (key, value) => {
        const ctx = get().roomContext
        if (!ctx) return
        set({ roomContext: { ...ctx, [key]: value } })
      },

      // Screen B
      setRoomConstraints: (constraints) =>
        set({ roomConstraints: constraints }),

      // Screen C
      setKeepMask: (mask) => set({ keepMask: mask }),
      setDetectionStatus: (status) => set({ detectionStatus: status }),
      toggleObjectKeep: (objectId) => {
        const mask = get().keepMask
        if (!mask) return
        set({
          keepMask: {
            ...mask,
            objects: mask.objects.map((o) =>
              o.id === objectId ? { ...o, keep: !o.keep } : o
            ),
          },
        })
      },
      toggleObjectImmovable: (objectId) => {
        const mask = get().keepMask
        if (!mask) return
        set({
          keepMask: {
            ...mask,
            objects: mask.objects.map((o) =>
              o.id === objectId ? { ...o, immovable: !o.immovable } : o
            ),
          },
        })
      },
      setObjectNote: (objectId, note) => {
        const mask = get().keepMask
        if (!mask) return
        set({
          keepMask: {
            ...mask,
            objects: mask.objects.map((o) =>
              o.id === objectId ? { ...o, userNote: note } : o
            ),
          },
        })
      },
      setSelectedObject: (id) => set({ selectedObjectId: id }),
      setZoneOfInterest: (zone) => {
        const mask = get().keepMask
        if (!mask) return
        set({ keepMask: { ...mask, zoneOfInterest: zone } })
      },

      // Screen D
      setActiveTab: (tab) => set({ activeTab: tab }),
      appendTabMessage: (tabId, role, content) => {
        const tabStates = [...get().tabStates]
        const { state, index } = getOrCreateTab(tabStates, tabId)
        const nextState: TabConversationState = {
          ...state,
          messages: [...state.messages, { role, content }],
        }
        tabStates[index] = nextState
        set({ tabStates })
      },
      updateTabExtractedData: (tabId, data) => {
        const tabStates = [...get().tabStates]
        const { state, index } = getOrCreateTab(tabStates, tabId)
        tabStates[index] = { ...state, extractedData: data }
        set({ tabStates })
      },
      markTabComplete: (tabId, reason) => {
        const tabStates = [...get().tabStates]
        const { state, index } = getOrCreateTab(tabStates, tabId)
        tabStates[index] = {
          ...state,
          isComplete: true,
          ...(reason !== undefined && { completionReason: reason }),
        }
        const completeTabs = tabStates.filter((t) => t.isComplete)
        // Budget comes from step-5, not from chat. Primary tab is 'all'.
        const primaryDone = completeTabs.some((t) => t.tabId === 'all')
        const otherDone = completeTabs.some((t) => t.tabId !== 'all' && t.tabId !== 'budget')
        // Budget must also be set (from step-5)
        const budgetSet = get().budget !== null

        // Promote extracted data to top-level store fields so the assembler
        // can read them. Without this, chat extraction results stay buried
        // in tabStates[n].extractedData and never reach the FLUX prompt.
        const extracted = state.extractedData as Record<string, unknown>
        const promotion: Partial<Area2State> = {}
        // Budget is no longer extracted from chat — it comes from step-5 via setBudget()
        if ((tabId === 'all') && extracted) {
          const currentTech = get().techSpec ?? defaultTechSpec()
          promotion.techSpec = { ...currentTech, ...extracted } as typeof currentTech
          const currentSensory = get().sensoryProfile ?? defaultSensoryProfile()
          promotion.sensoryProfile = { ...currentSensory, ...extracted } as typeof currentSensory
          const currentArt = get().artBrief ?? defaultArtBrief()
          promotion.artBrief = {
            ...currentArt,
            ...extracted,
            hasArtDirection: (extracted.hasArtDirection as boolean) ?? (extracted.visualDirection ? true : currentArt.hasArtDirection),
          } as typeof currentArt
          const currentIdentity = get().identityBrief ?? defaultIdentityBrief()
          promotion.identityBrief = { ...currentIdentity, ...extracted } as typeof currentIdentity
        }
        if (tabId === 'tech' && extracted) {
          const current = get().techSpec ?? defaultTechSpec()
          promotion.techSpec = { ...current, ...extracted } as typeof current
        }
        if (tabId === 'sensory' && extracted) {
          const current = get().sensoryProfile ?? defaultSensoryProfile()
          promotion.sensoryProfile = { ...current, ...extracted } as typeof current
        }
        if (tabId === 'art' && extracted) {
          const current = get().artBrief ?? defaultArtBrief()
          promotion.artBrief = {
            ...current,
            ...extracted,
            hasArtDirection: (extracted.hasArtDirection as boolean) ?? (extracted.visualDirection ? true : current.hasArtDirection),
          } as typeof current
        }
        if (tabId === 'identity' && extracted) {
          const current = get().identityBrief ?? defaultIdentityBrief()
          promotion.identityBrief = { ...current, ...extracted } as typeof current
        }

        set({
          tabStates,
          minimumThresholdMet: primaryDone && otherDone && budgetSet,
          ...promotion,
        })
      },
      setBudget: (budget) => set({ budget }),
      addRequestedProduct: (product) =>
        set({ requestedProducts: [...get().requestedProducts, product] }),
      removeRequestedProduct: (productId) =>
        set({
          requestedProducts: get().requestedProducts.filter(
            (p) => p.id !== productId
          ),
        }),
      setArtBrief: (brief) => set({ artBrief: brief }),
      setTechSpec: (spec) => set({ techSpec: spec }),
      setSensoryProfile: (profile) => set({ sensoryProfile: profile }),
      setIdentityBrief: (brief) => set({ identityBrief: brief }),

      // Assembly
      assembleRenderContext: (userId) => {
        const s = get()
        if (
          !s.roomId ||
          !s.roomContext ||
          !s.roomConstraints ||
          !s.keepMask ||
          !s.budget
        ) {
          return null
        }
        const tabsComplete = s.tabStates
          .filter((t) => t.isComplete)
          .map((t) => t.tabId)
        // Budget is set from step-5, not from tab completion
        const budgetDone = s.budget !== null
        const allDone = tabsComplete.includes('all')
        const otherDone = tabsComplete.some((id) => id !== 'all' && id !== 'budget')
        const fingerprint = useFingerprintStore.getState().fingerprint ?? undefined
        const ctx: RenderContext = {
          schemaVersion: '2.0',
          roomId: s.roomId,
          userId,
          assembledAt: new Date().toISOString(),
          roomContext: s.roomContext,
          roomConstraints: s.roomConstraints,
          keepMask: s.keepMask,
          budget: s.budget,
          requestedProducts: s.requestedProducts,
          artBrief: s.artBrief ?? defaultArtBrief(),
          techSpec: s.techSpec ?? defaultTechSpec(),
          sensoryProfile: s.sensoryProfile ?? defaultSensoryProfile(),
          identityBrief: s.identityBrief ?? defaultIdentityBrief(),
          tabStates: s.tabStates,
          minimumThresholdMet: budgetDone && allDone && otherDone,
          tabsComplete,
          fingerprint,
        }
        // Build the FLUX prompt from the assembled context.
        ctx.fluxPrompt = buildFluxPromptFromContext(ctx)
        ctx.fluxPromptVersion = '2.0.0'
        set({
          renderContext: ctx,
          minimumThresholdMet: budgetDone && allDone && otherDone,
        })
        return ctx
      },
      reset: () => set(initialState),
    }),
    {
      name: 'cova-area2',
      storage: createJSONStorage(() => sessionStorage),
    }
  )
)

import { create } from 'zustand'

type BudgetTier = 'budget' | 'mid' | 'premium' | 'luxury'
type EntryPath = 'pairs' | 'natural_language' | 'inspo_photo'
type Dimensions = 'small' | 'medium' | 'large'

export type WallLayout = {
  top: Array<{ type: 'window' | 'door'; position: number }>
  bottom: Array<{ type: 'window' | 'door'; position: number }>
  left: Array<{ type: 'window' | 'door'; position: number }>
  right: Array<{ type: 'window' | 'door'; position: number }>
}

interface QuizResponse {
  pairId: string
  chosen: string
  superLiked: boolean
}

interface FingerprintState {
  roomType: string | null
  budgetTier: BudgetTier | null
  budgetRange: [number, number] | null
  quizResponses: QuizResponse[]
  fingerprint: number[] | null
  styleName: string | null
  entryPath: EntryPath | null
  dimensions: Dimensions | null
  constraints: string[]
  inclusions: string[]
  // Room physical details (step 4)
  roomLength: number | null
  roomWidth: number | null
  ceilingHeight: number | null
  naturalLight: string | null
  wallLayout: WallLayout | null
  fixedElements: string[]
  floorType: string | null
  wallFinish: string | null
  hasCloset: boolean
  closetWall: string | null
  setRoomType: (roomType: string) => void
  setBudget: (tier: BudgetTier, range: [number, number]) => void
  addQuizResponse: (response: QuizResponse) => void
  setFingerprint: (fingerprint: number[], styleName: string) => void
  setEntryPath: (path: EntryPath) => void
  setDimensions: (dimensions: Dimensions) => void
  toggleConstraint: (constraint: string) => void
  toggleInclusion: (inclusion: string) => void
  setRoomDimensions: (dims: {
    length: number | null
    width: number | null
    ceilingHeight: number | null
    naturalLight: string | null
  }) => void
  setWallLayout: (layout: WallLayout) => void
  setFixedElements: (elements: string[]) => void
  setSurfaces: (floor: string, wall: string) => void
  setCloset: (hasCloset: boolean, wall: string | null) => void
  setConstraints: (constraints: string[]) => void
  setInclusions: (inclusions: string[]) => void
  resetFingerprint: () => void
}

const BUDGET_RANGES: Record<BudgetTier, [number, number]> = {
  budget: [200, 500],
  mid: [500, 2000],
  premium: [2000, 5000],
  luxury: [5000, 25000],
}

const INITIAL_STATE = {
  roomType: null,
  budgetTier: null,
  budgetRange: null,
  quizResponses: [],
  fingerprint: null,
  styleName: null,
  entryPath: null,
  dimensions: null,
  constraints: [],
  inclusions: [],
  roomLength: null,
  roomWidth: null,
  ceilingHeight: null,
  naturalLight: null,
  wallLayout: null,
  fixedElements: [],
  floorType: null,
  wallFinish: null,
  hasCloset: false,
  closetWall: null,
}

export const useFingerprintStore = create<FingerprintState>()(
  (set) => ({
    ...INITIAL_STATE,
    setRoomType: (roomType) => set({ roomType }),
    setBudget: (budgetTier) => set({
      budgetTier,
      budgetRange: BUDGET_RANGES[budgetTier],
    }),
    addQuizResponse: (response) => set((state) => ({
      quizResponses: [...state.quizResponses, response],
    })),
    setFingerprint: (fingerprint, styleName) => set({
      fingerprint,
      styleName,
    }),
    setEntryPath: (entryPath) => set({ entryPath }),
    setDimensions: (dimensions) => set({ dimensions }),
    toggleConstraint: (constraint) => set((state) => ({
      constraints: state.constraints.includes(constraint)
        ? state.constraints.filter((c) => c !== constraint)
        : [...state.constraints, constraint],
    })),
    toggleInclusion: (inclusion) => set((state) => ({
      inclusions: state.inclusions.includes(inclusion)
        ? state.inclusions.filter((i) => i !== inclusion)
        : [...state.inclusions, inclusion],
    })),
    setRoomDimensions: (dims) => set({
      roomLength: dims.length,
      roomWidth: dims.width,
      ceilingHeight: dims.ceilingHeight,
      naturalLight: dims.naturalLight,
    }),
    setWallLayout: (layout) => set({ wallLayout: layout }),
    setFixedElements: (elements) => set({ fixedElements: elements }),
    setSurfaces: (floor, wall) => set({ floorType: floor, wallFinish: wall }),
    setCloset: (hasCloset, wall) => set({ hasCloset, closetWall: wall }),
    setConstraints: (constraints) => set({ constraints }),
    setInclusions: (inclusions) => set({ inclusions }),
    resetFingerprint: () => set(INITIAL_STATE),
  })
)

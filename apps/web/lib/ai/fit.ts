// apps/web/lib/ai/fit.ts
// Product dimension extraction and room fit scoring

export interface ProductDimensions {
  widthInches: number | null
  depthInches: number | null
  heightInches: number | null
  source: 'schema_org' | 'regex' | 'default' | 'unknown'
  confidence: 'confirmed' | 'estimated' | 'unknown'
}

export type FitLabel =
  | 'Perfect Fit'
  | 'Good Fit'
  | 'Tight Fit'
  | 'Dimensions Unconfirmed'

export interface FitScore {
  label: FitLabel
  score: number        // 0-1
  passes: boolean      // false = hard reject, never show to user
  reason: string       // human explanation e.g. "84in sofa fits your 108in wall with 12in clearance"
}

// Minimum clearance rules by furniture category (inches)
interface ClearanceRule {
  minWallClearance: number   // each side from wall
  minFrontClearance: number  // in front of piece
  maxWidthRatio: number      // max fraction of usable wall width
}

const CLEARANCE_RULES: Record<string, ClearanceRule> = {
  sofa: { minWallClearance: 3, minFrontClearance: 36, maxWidthRatio: 0.85 },
  sectional: { minWallClearance: 3, minFrontClearance: 36, maxWidthRatio: 0.90 },
  'coffee table': { minWallClearance: 0, minFrontClearance: 16, maxWidthRatio: 0.67 },
  bed: { minWallClearance: 24, minFrontClearance: 36, maxWidthRatio: 0.80 },
  'dining table': { minWallClearance: 36, minFrontClearance: 36, maxWidthRatio: 0.70 },
  desk: { minWallClearance: 0, minFrontClearance: 48, maxWidthRatio: 0.60 },
  dresser: { minWallClearance: 0, minFrontClearance: 36, maxWidthRatio: 0.50 },
  bookcase: { minWallClearance: 0, minFrontClearance: 24, maxWidthRatio: 0.40 },
  'floor lamp': { minWallClearance: 6, minFrontClearance: 12, maxWidthRatio: 0.15 },
  rug: { minWallClearance: 6, minFrontClearance: 0, maxWidthRatio: 0.95 },
  default: { minWallClearance: 6, minFrontClearance: 24, maxWidthRatio: 0.60 },
}

// Category default dimensions when no product data is available
const CATEGORY_DEFAULTS: Record<string, ProductDimensions> = {
  sofa: { widthInches: 84, depthInches: 38, heightInches: 34, source: 'default', confidence: 'estimated' },
  sectional: { widthInches: 110, depthInches: 60, heightInches: 34, source: 'default', confidence: 'estimated' },
  'coffee table': { widthInches: 48, depthInches: 24, heightInches: 18, source: 'default', confidence: 'estimated' },
  bed: { widthInches: 60, depthInches: 80, heightInches: 14, source: 'default', confidence: 'estimated' },
  'dining table': { widthInches: 60, depthInches: 36, heightInches: 30, source: 'default', confidence: 'estimated' },
  desk: { widthInches: 54, depthInches: 24, heightInches: 30, source: 'default', confidence: 'estimated' },
  dresser: { widthInches: 48, depthInches: 18, heightInches: 54, source: 'default', confidence: 'estimated' },
  bookcase: { widthInches: 36, depthInches: 12, heightInches: 72, source: 'default', confidence: 'estimated' },
  'floor lamp': { widthInches: 12, depthInches: 12, heightInches: 60, source: 'default', confidence: 'estimated' },
  rug: { widthInches: 96, depthInches: 120, heightInches: 1, source: 'default', confidence: 'estimated' },
}

// Regex patterns for extracting dimensions from product descriptions
// Ordered from most specific to most general
const DIMENSION_PATTERNS: RegExp[] = [
  // "W34" × D18" × H30""
  /[Ww][\s:]*([\d.]+)\s*["'in]*\s*[×xX]\s*[Dd][\s:]*([\d.]+)\s*["'in]*\s*[×xX]\s*[Hh][\s:]*([\d.]+)/,
  // "34W x 18D x 30H"
  /([\d.]+)\s*[Ww]\s*[×xX]\s*([\d.]+)\s*[Dd]\s*[×xX]\s*([\d.]+)\s*[Hh]/,
  // "Overall: 34"W x 18"D x 30"H"
  /[Oo]verall[\s:]*\s*([\d.]+)\s*["']?[Ww]\s*[×xX]\s*([\d.]+)\s*["']?[Dd]\s*[×xX]\s*([\d.]+)/,
  // "34 x 18 x 30 inches" (W x D x H assumed)
  /([\d.]+)\s*[×xX]\s*([\d.]+)\s*[×xX]\s*([\d.]+)\s*(?:in|inches|")/,
  // "Width: 34 inches" (width only)
  /[Ww]idth[\s:]*\s*([\d.]+)\s*(?:in|inches|")/,
]

// Extract dimensions from a product description string
export function extractDimensionsFromText(text: string): ProductDimensions {
  for (const pattern of DIMENSION_PATTERNS) {
    const match = text.match(pattern)
    if (match) {
      const w = match[1]
      const d = match[2]
      const h = match[3]
      if (w) {
        return {
          widthInches: parseFloat(w),
          depthInches: d ? parseFloat(d) : null,
          heightInches: h ? parseFloat(h) : null,
          source: 'regex',
          confidence: 'confirmed',
        }
      }
    }
  }
  return {
    widthInches: null,
    depthInches: null,
    heightInches: null,
    source: 'unknown',
    confidence: 'unknown',
  }
}

// Get dimensions for a category, falling back to defaults
export function getDimensionsForCategory(itemLabel: string): ProductDimensions {
  const labelLower = itemLabel.toLowerCase()
  for (const [key, dims] of Object.entries(CATEGORY_DEFAULTS)) {
    if (labelLower.includes(key) || key.includes(labelLower)) {
      return dims
    }
  }
  return {
    widthInches: null,
    depthInches: null,
    heightInches: null,
    source: 'default',
    confidence: 'estimated',
  }
}

// Score how well a product fits the room
export function scoreFit(
  itemLabel: string,
  productDimensions: ProductDimensions,
  usableWallInches: number,
): FitScore {
  const labelLower = itemLabel.toLowerCase()

  // Find matching clearance rule
  let rule = CLEARANCE_RULES['default']!
  for (const [key, r] of Object.entries(CLEARANCE_RULES)) {
    if (labelLower.includes(key)) {
      rule = r
      break
    }
  }

  // No dimension data — return unconfirmed
  if (!productDimensions.widthInches) {
    return {
      label: 'Dimensions Unconfirmed',
      score: 0.60,
      passes: true,  // don't hard-reject — show with disclaimer
      reason: 'Dimensions not confirmed for this product',
    }
  }

  const productWidth = productDimensions.widthInches
  const maxAllowedWidth = usableWallInches * rule.maxWidthRatio

  // Hard gate: product is physically too wide
  if (productWidth > maxAllowedWidth) {
    return {
      label: 'Tight Fit',
      score: 0.20,
      passes: false,  // hard reject
      reason: `${productWidth}in ${itemLabel} exceeds your ${Math.round(maxAllowedWidth)}in available wall space`,
    }
  }

  // Compute clearance
  const clearancePerSide = (usableWallInches - productWidth) / 2
  const clearanceRatio = clearancePerSide / usableWallInches

  // Score based on clearance ratio
  let score: number
  let label: FitLabel
  let reason: string

  if (clearanceRatio >= 0.20) {
    score = 1.0
    label = 'Perfect Fit'
    reason = `${productWidth}in ${itemLabel} fits with ${Math.round(clearancePerSide)}in clearance on each side`
  } else if (clearanceRatio >= 0.10) {
    score = 0.80
    label = 'Good Fit'
    reason = `${productWidth}in ${itemLabel} fits with ${Math.round(clearancePerSide)}in clearance — comfortable`
  } else {
    score = 0.55
    label = 'Tight Fit'
    reason = `${productWidth}in ${itemLabel} fits but with only ${Math.round(clearancePerSide)}in clearance per side`
  }

  return { label, score, passes: true, reason }
}

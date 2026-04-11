// apps/web/lib/ai/budget.ts
// Budget allocation and room-level optimization

// Professional designer budget allocation ratios by room type
// Values must sum to 1.0 per room type
export const BUDGET_ALLOCATION: Record<string, Record<string, number>> = {
  living_room: {
    sofa: 0.35,
    sectional: 0.35,
    "coffee table": 0.1,
    "accent chair": 0.15,
    rug: 0.12,
    "floor lamp": 0.08,
    lighting: 0.08,
    "side table": 0.05,
    decor: 0.05,
    other: 0.1,
  },
  bedroom: {
    bed: 0.3,
    "bed frame": 0.3,
    mattress: 0.25,
    dresser: 0.15,
    nightstand: 0.05,
    "bedside table": 0.05,
    lighting: 0.08,
    decor: 0.07,
    other: 0.1,
  },
  home_office: {
    desk: 0.3,
    chair: 0.35,
    "office chair": 0.35,
    storage: 0.15,
    bookcase: 0.15,
    lighting: 0.1,
    "desk lamp": 0.1,
    decor: 0.05,
    other: 0.05,
  },
  dining_room: {
    "dining table": 0.45,
    "dining chair": 0.3,
    sideboard: 0.15,
    lighting: 0.1,
    decor: 0.05,
    other: 0.1,
  },
  studio: {
    sofa: 0.3,
    bed: 0.25,
    desk: 0.2,
    storage: 0.15,
    lighting: 0.1,
    other: 0.1,
  },
  bathroom: {
    vanity: 0.35,
    mirror: 0.15,
    storage: 0.2,
    lighting: 0.15,
    decor: 0.15,
    other: 0.1,
  },
  outdoor: {
    seating: 0.4,
    table: 0.25,
    lighting: 0.15,
    decor: 0.1,
    other: 0.1,
  },
};

const DEFAULT_ALLOCATION = 0.1;

// Get budget target for a specific item given total budget and room type
export function getItemBudgetTarget(
  itemLabel: string,
  roomType: string,
  totalBudgetRange: [number, number],
): [number, number] {
  const midBudget = (totalBudgetRange[0] + totalBudgetRange[1]) / 2;
  const roomKey = roomType.toLowerCase().replace(/\s+/g, "_");
  const allocation = BUDGET_ALLOCATION[roomKey] ?? {};

  // Match item label to allocation key (fuzzy — check if label contains key)
  const labelLower = itemLabel.toLowerCase();
  let ratio = DEFAULT_ALLOCATION;

  for (const [key, value] of Object.entries(allocation)) {
    if (labelLower.includes(key) || key.includes(labelLower)) {
      ratio = value;
      break;
    }
  }

  const target = midBudget * ratio;
  // Allow 25% below and 15% above target
  return [Math.round(target * 0.75), Math.round(target * 1.15)];
}

interface ProductSummary {
  id: string;
  price: number;
}

// Room-level optimizer:
// Start with top recommendation per item.
// If total > budgetMax: swap most expensive items for cheaper alternatives.
// If total < budgetMin * 0.85: upgrade lowest-score items if headroom allows.
export function optimizeRoomSelection(
  productsByItem: Record<string, ProductSummary[]>,
  budgetRange: [number, number],
): {
  selectedIndices: Record<string, number>; // item id → index of selected product
  totalCost: number;
  wasOptimized: boolean;
} {
  const [budgetMin, budgetMax] = budgetRange;
  const itemIds = Object.keys(productsByItem);

  // Start with index 0 (top recommendation) for each item
  const selectedIndices: Record<string, number> = {};
  itemIds.forEach((id) => {
    selectedIndices[id] = 0;
  });

  const getTotal = () =>
    itemIds.reduce((sum, id) => {
      const idx = selectedIndices[id] ?? 0;
      return sum + (productsByItem[id]?.[idx]?.price ?? 0);
    }, 0);

  let total = getTotal();
  let wasOptimized = false;

  // Over budget: swap most expensive item for cheaper alternative
  let iterations = 0;
  while (total > budgetMax && iterations < 10) {
    iterations++;

    // Find item where swapping to next alternative saves the most
    let bestSwapId: string | null = null;
    let bestSaving = 0;

    for (const id of itemIds) {
      const currentIdx = selectedIndices[id] ?? 0;
      const nextIdx = currentIdx + 1;
      const alternatives = productsByItem[id] ?? [];

      if (nextIdx >= alternatives.length) continue;

      const currentPrice = alternatives[currentIdx]?.price ?? 0;
      const nextPrice = alternatives[nextIdx]?.price ?? 0;
      const saving = currentPrice - nextPrice;

      if (saving > bestSaving) {
        bestSaving = saving;
        bestSwapId = id;
      }
    }

    if (!bestSwapId) break; // No more swaps available

    selectedIndices[bestSwapId] = (selectedIndices[bestSwapId] ?? 0) + 1;
    total = getTotal();
    wasOptimized = true;
  }

  // Under budget floor: try upgrading lowest-scoring item
  iterations = 0;
  while (total < budgetMin * 0.85 && iterations < 5) {
    iterations++;

    // Find item at index > 0 where upgrading to index 0 fits in budget
    let bestUpgradeId: string | null = null;
    let bestQualityGain = 0;

    for (const id of itemIds) {
      const currentIdx = selectedIndices[id] ?? 0;
      if (currentIdx === 0) continue; // Already at top recommendation

      const topProduct = productsByItem[id]?.[0];
      const currentProduct = productsByItem[id]?.[currentIdx];
      if (!topProduct || !currentProduct) continue;

      const priceDiff = topProduct.price - currentProduct.price;
      if (total + priceDiff > budgetMax) continue; // Would exceed ceiling

      const qualityGain = topProduct.price - currentProduct.price; // proxy for quality
      if (qualityGain > bestQualityGain) {
        bestQualityGain = qualityGain;
        bestUpgradeId = id;
      }
    }

    if (!bestUpgradeId) break;

    selectedIndices[bestUpgradeId] = 0;
    total = getTotal();
    wasOptimized = true;
  }

  return { selectedIndices, totalCost: Math.round(total), wasOptimized };
}

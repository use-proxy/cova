import { TOKEN_COSTS } from '../types';

export function canAfford(
  balance: number,
  action: keyof typeof TOKEN_COSTS
): boolean {
  return balance >= TOKEN_COSTS[action];
}

export function tokenCostLabel(action: keyof typeof TOKEN_COSTS): string {
  const cost = TOKEN_COSTS[action];
  return cost === 0 ? 'Free' : `${cost} token${cost > 1 ? 's' : ''}`;
}

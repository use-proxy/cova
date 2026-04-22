/**
 * Token balance stub.
 *
 * TODO(tokens-schema): replace in-memory balances with a real
 * `user_token_balances` table + audit log before rollout beyond admin.
 * Until then:
 *   - Admin accounts (ADMIN_TEST_USER_IDS) always have 999_999 tokens.
 *   - All other accounts get a fixed 100-token allowance tracked in-memory
 *     for this process. This is NOT persisted across requests in serverless;
 *     it exists only so the retry-route logic can be wired and tested.
 *
 * The retry route imports from this file, NOT from Supabase directly, so
 * swapping in the real schema later is a one-file change.
 */

import { RENDER_CONFIG } from "@/lib/render-config";

// Shared in-memory store (safe enough for dev / admin testing). A new
// process starts every user fresh at 100 tokens.
const _balances = new Map<string, number>();

function isAdmin(userId: string): boolean {
  const ids = (process.env.ADMIN_TEST_USER_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
  return ids.includes(userId);
}

function seed(userId: string): number {
  if (isAdmin(userId)) return 999_999;
  return 100;
}

export async function getTokenBalance(userId: string): Promise<number> {
  if (isAdmin(userId)) return 999_999;
  if (!_balances.has(userId)) _balances.set(userId, seed(userId));
  return _balances.get(userId)!;
}

/**
 * Deduct `amount` tokens. Returns the new balance on success.
 * Throws `InsufficientTokensError` when balance would go negative.
 * `reason` is captured for future audit-log wiring.
 */
export async function chargeTokens(
  userId: string,
  amount: number,
  reason: string,
): Promise<number> {
  if (amount < 0) throw new Error("chargeTokens: amount must be non-negative");
  if (isAdmin(userId)) return 999_999;
  const current = await getTokenBalance(userId);
  if (current < amount) {
    throw new InsufficientTokensError(current, amount, reason);
  }
  const next = current - amount;
  _balances.set(userId, next);
  return next;
}

export class InsufficientTokensError extends Error {
  constructor(
    public readonly balance: number,
    public readonly required: number,
    public readonly reason: string,
  ) {
    super(
      `Insufficient tokens for "${reason}": balance=${balance}, required=${required}`,
    );
    this.name = "InsufficientTokensError";
  }
}

/** Convenience: can this user afford a paid retry right now? */
export async function canAffordPaidRetry(userId: string): Promise<boolean> {
  const bal = await getTokenBalance(userId);
  return bal >= RENDER_CONFIG.PAID_RETRY_TOKEN_COST;
}

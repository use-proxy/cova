"use client";

/**
 * Persistent retry button for the empty-room render result. Handles:
 *   - free vs paid retry messaging
 *   - token-purchase link when balance insufficient
 *   - max-paid-retries / rate-limited states from the /api/render/retry response
 *   - confirmation modal before spending tokens
 *   - optional quality-warning banner
 *
 * Parent owns the rendered image state — pass `onRetryComplete(newUrl)`
 * so it can swap the image when the retry succeeds.
 */

import { useCallback, useMemo, useState } from "react";

export interface RetryButtonProps {
  renderId: string;
  imageUrl: string;
  qualityWarning?: boolean;
  /** Current balances + slots as the parent last knows them. */
  tokenBalance: number;
  freeRetriesUsed: number;
  paidRetriesUsed: number;
  hourRetryCount: number;
  onRetryComplete: (args: {
    newUrl: string;
    qualityWarning: boolean;
    retryWasFree: boolean;
    tokensCharged: number;
    remainingFreeRetries: number;
    remainingPaidRetrySlots: number;
    remainingHourBudget: number;
  }) => void;
  /** Where to link for token purchase — default "/account/tokens". */
  tokenPurchaseHref?: string;
}

const PAID_RETRY_TOKEN_COST = 2;
const FREE_RETRIES_PER_RENDER = 1;
const MAX_PAID_RETRIES_PER_RENDER = 5;
const MAX_RETRIES_PER_HOUR = 5;

type RetryState =
  | { kind: "idle" }
  | { kind: "confirming_paid" }
  | { kind: "running" }
  | { kind: "error"; message: string; code?: string; minutesUntilReset?: number };

export function RetryButton(props: RetryButtonProps) {
  const {
    renderId,
    imageUrl,
    qualityWarning,
    tokenBalance,
    freeRetriesUsed,
    paidRetriesUsed,
    hourRetryCount,
    onRetryComplete,
    tokenPurchaseHref = "/account/tokens",
  } = props;

  const [state, setState] = useState<RetryState>({ kind: "idle" });

  const derived = useMemo(() => {
    const atMaxPaid = paidRetriesUsed >= MAX_PAID_RETRIES_PER_RENDER;
    const rateLimited = hourRetryCount >= MAX_RETRIES_PER_HOUR;
    const nextIsFree = freeRetriesUsed < FREE_RETRIES_PER_RENDER && !atMaxPaid;
    const needsTokens = !nextIsFree && !atMaxPaid;
    const canAffordPaid = tokenBalance >= PAID_RETRY_TOKEN_COST;
    return { atMaxPaid, rateLimited, nextIsFree, needsTokens, canAffordPaid };
  }, [freeRetriesUsed, paidRetriesUsed, hourRetryCount, tokenBalance]);

  const helperText = useMemo(() => {
    if (derived.atMaxPaid) return "Maximum retries reached on this render";
    if (derived.rateLimited) {
      const last = state.kind === "error" && state.minutesUntilReset;
      return last
        ? `Retry limit reached, try again in ${last} minute${last === 1 ? "" : "s"}`
        : "Retry limit reached, try again next hour";
    }
    if (derived.nextIsFree) return "1 free retry available";
    if (derived.needsTokens && derived.canAffordPaid) {
      return "Additional retries cost 2 tokens";
    }
    if (derived.needsTokens && !derived.canAffordPaid) return "Get more tokens to retry";
    return "";
  }, [derived, state]);

  const disabled =
    derived.atMaxPaid ||
    derived.rateLimited ||
    (derived.needsTokens && !derived.canAffordPaid) ||
    state.kind === "running" ||
    state.kind === "confirming_paid";

  const runRetry = useCallback(async () => {
    setState({ kind: "running" });
    try {
      const res = await fetch("/api/render/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ original_render_id: renderId, image_url: imageUrl }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setState({
          kind: "error",
          message: body?.error || `HTTP ${res.status}`,
          code: body?.code,
          minutesUntilReset: body?.minutes_until_reset,
        });
        return;
      }

      onRetryComplete({
        newUrl: body.empty_room_url,
        qualityWarning: body.quality_warning,
        retryWasFree: body.retry_was_free,
        tokensCharged: body.tokens_charged,
        remainingFreeRetries: body.remaining_free_retries,
        remainingPaidRetrySlots: body.remaining_paid_retry_slots,
        remainingHourBudget: body.remaining_hour_budget,
      });
      setState({ kind: "idle" });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Network error",
      });
    }
  }, [renderId, imageUrl, onRetryComplete]);

  const handleClick = useCallback(() => {
    if (derived.nextIsFree) {
      runRetry();
    } else {
      setState({ kind: "confirming_paid" });
    }
  }, [derived.nextIsFree, runRetry]);

  return (
    <div className="retry-wrap">
      {qualityWarning ? (
        <div
          className="retry-warning"
          role="status"
          aria-live="polite"
          style={{
            background: "rgba(59, 130, 246, 0.08)",
            border: "1px solid rgba(59, 130, 246, 0.35)",
            color: "#93c5fd",
            padding: "10px 14px",
            borderRadius: 6,
            fontSize: 13,
            marginBottom: 10,
          }}
        >
          If this doesn&apos;t look right, try again for a different result.
        </div>
      ) : null}

      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        aria-label="Try again"
        style={{
          padding: "10px 16px",
          borderRadius: 8,
          border: "1px solid #2a2a2a",
          background: disabled ? "#141414" : "#1a1a1a",
          color: disabled ? "#666" : "#f5f5f5",
          fontSize: 14,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        {state.kind === "running" ? "Running…" : "Try again"}
      </button>

      {helperText ? (
        <div
          className="retry-helper"
          style={{ fontSize: 12, color: "#888", marginTop: 6 }}
        >
          {helperText}
          {derived.needsTokens && !derived.canAffordPaid ? (
            <>
              {" — "}
              <a href={tokenPurchaseHref} style={{ color: "#93c5fd" }}>
                Get more tokens
              </a>
            </>
          ) : null}
        </div>
      ) : null}

      {state.kind === "error" ? (
        <div
          role="alert"
          style={{
            fontSize: 12,
            color: "#ff6b6b",
            marginTop: 8,
            padding: "6px 10px",
            background: "rgba(255, 107, 107, 0.08)",
            borderRadius: 4,
          }}
        >
          {state.message}
        </div>
      ) : null}

      {state.kind === "confirming_paid" ? (
        <ConfirmPaidRetryModal
          balance={tokenBalance}
          onCancel={() => setState({ kind: "idle" })}
          onConfirm={runRetry}
        />
      ) : null}
    </div>
  );
}

interface ConfirmProps {
  balance: number;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmPaidRetryModal({ balance, onConfirm, onCancel }: ConfirmProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="retry-confirm-title"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
    >
      <div
        style={{
          background: "#141414",
          border: "1px solid #2a2a2a",
          borderRadius: 12,
          padding: 24,
          width: 360,
          maxWidth: "calc(100vw - 32px)",
        }}
      >
        <h2 id="retry-confirm-title" style={{ margin: 0, fontSize: 16, color: "#f5f5f5" }}>
          Confirm paid retry
        </h2>
        <p style={{ marginTop: 10, fontSize: 13, color: "#bbb", lineHeight: 1.5 }}>
          This retry will cost <b>{PAID_RETRY_TOKEN_COST} tokens</b>. You have{" "}
          <b>{balance} tokens</b> remaining. Continue?
        </p>
        <div style={{ display: "flex", gap: 10, marginTop: 18, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: "8px 14px",
              background: "#0a0a0a",
              border: "1px solid #2a2a2a",
              color: "#bbb",
              borderRadius: 6,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              padding: "8px 14px",
              background: "#3b82f6",
              border: "1px solid #3b82f6",
              color: "#fff",
              borderRadius: 6,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

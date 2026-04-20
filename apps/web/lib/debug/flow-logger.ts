/**
 * Flow Logger — Autonomous QA instrumentation
 *
 * Emits structured JSON logs to console for the autonomous healer
 * to capture via Playwright's console listener.
 *
 * Usage:
 *   import { flowLog } from '@/lib/debug/flow-logger'
 *   flowLog('page:mount', { page: 'step-2' })
 *   flowLog('api:response', { route: '/api/quiz/fingerprint', status: 200 })
 */

type FlowData = Record<string, unknown> | undefined;

export function flowLog(event: string, data?: FlowData): void {
  if (typeof window === "undefined") return;

  const entry = JSON.stringify({
    __COVA__: true,
    event,
    data,
    ts: Date.now(),
    url: window.location.pathname,
  });

  // eslint-disable-next-line no-console
  console.log(entry);
}

/**
 * Server-side flow logger for API routes.
 * Writes to stdout so the healer can capture via server logs.
 */
export function flowLogServer(event: string, data?: FlowData): void {
  const entry = JSON.stringify({
    __COVA_SERVER__: true,
    event,
    data,
    ts: Date.now(),
  });

  // eslint-disable-next-line no-console
  console.log(entry);
}

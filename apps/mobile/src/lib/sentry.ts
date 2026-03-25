/**
 * sentry.ts — Cova-specific Sentry wrapper
 *
 * Maps every captured event to PRODUCT_TRUTH.md features (FEATURE_1–FEATURE_12)
 * and records deviation severity, screen, render state, and user flow step
 * so every error in the Sentry dashboard has full product context.
 *
 * Usage:
 *   import { logProductDeviation, setCurrentScreen, setFlowStep, setRenderState } from '../lib/sentry';
 */

import * as Sentry from '@sentry/react-native';

// ── Feature identifiers matching PRODUCT_TRUTH.md ──────────────────────────

export type FeatureId =
  | 'FEATURE_1'   // Splash Screen
  | 'FEATURE_2'   // Authentication
  | 'FEATURE_3'   // Style Fingerprint Quiz
  | 'FEATURE_4'   // Room Capture
  | 'FEATURE_5'   // 3D Room Viewer
  | 'FEATURE_6'   // AI Render
  | 'FEATURE_7'   // AI Chatbot
  | 'FEATURE_8'   // Product Shopping & CLIP
  | 'FEATURE_9'   // Dashboard & Home
  | 'FEATURE_10'  // Token Economy
  | 'FEATURE_12'; // Profile & Settings

/**
 * CRITICAL_DEVIATION — PRODUCT_TRUTH.md marks these as fix-immediately bugs.
 * HIGH_DEVIATION     — PRODUCT_TRUTH.md flags these as fix-this-session bugs.
 * CODE_CRASH         — unhandled exception or promise rejection.
 */
export type DeviationSeverity = 'CRITICAL_DEVIATION' | 'HIGH_DEVIATION' | 'CODE_CRASH';

export type RenderState = 'rendering' | 'idle' | 'failed';

export type FlowStep = 'quiz' | 'capture' | 'render' | 'shop';

const FEATURE_NAMES: Record<FeatureId, string> = {
  FEATURE_1:  'Splash Screen',
  FEATURE_2:  'Authentication',
  FEATURE_3:  'Style Fingerprint Quiz',
  FEATURE_4:  'Room Capture',
  FEATURE_5:  '3D Room Viewer',
  FEATURE_6:  'AI Render',
  FEATURE_7:  'AI Chatbot',
  FEATURE_8:  'Product Shopping & CLIP',
  FEATURE_9:  'Dashboard & Home',
  FEATURE_10: 'Token Economy',
  FEATURE_12: 'Profile & Settings',
};

// ── Module-level context state — updated by screens ────────────────────────

let _screen: string = 'unknown';
let _flowStep: FlowStep = 'quiz';
let _renderState: RenderState = 'idle';

/** Call in screen useEffect([]) to tag all events from that screen. */
export function setCurrentScreen(screen: string): void {
  _screen = screen;
  Sentry.setTag('screen', screen);
}

/** Call when the user moves between major flow steps. */
export function setFlowStep(step: FlowStep): void {
  _flowStep = step;
  Sentry.setTag('flow_step', step);
}

/** Call whenever render pipeline status changes. */
export function setRenderState(state: RenderState): void {
  _renderState = state;
  Sentry.setTag('render_state', state);
}

// ── Sentry initialisation ───────────────────────────────────────────────────

/**
 * Call once in App.tsx instead of raw Sentry.init().
 * Sets baseline product_truth / expected_behavior / actual_behavior contexts.
 */
export function initSentry(): void {
  Sentry.init({
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 1.0,
  });

  // Baseline contexts visible on every event in the Sentry dashboard
  Sentry.setContext('product_truth', {
    version: '1.0',
    source: 'PRODUCT_TRUTH.md',
    current_feature: 'initializing',
  });

  Sentry.setContext('expected_behavior', {
    description: 'App launches; user reaches dashboard or sees splash flow.',
  });

  Sentry.setContext('actual_behavior', {
    description: 'No error yet.',
  });
}

// ── Core logging functions ──────────────────────────────────────────────────

/**
 * Log a PRODUCT TRUTH deviation that did NOT crash the app.
 *
 * @param feature  - Which PRODUCT_TRUTH.md feature is violated.
 * @param truth    - The exact ✓ TRUTH statement that is being violated.
 * @param actual   - What is actually happening instead.
 * @param severity - Defaults to HIGH_DEVIATION; use CRITICAL for PRODUCT_TRUTH.md CRITICAL flags.
 */
export function logProductDeviation(
  feature: FeatureId,
  truth: string,
  actual: string,
  severity: DeviationSeverity = 'HIGH_DEVIATION',
): void {
  const name = FEATURE_NAMES[feature];

  // Update persistent contexts so subsequent errors in the same scope carry them
  Sentry.setContext('product_truth', {
    feature,
    feature_name: name,
    current_feature: name,
  });

  Sentry.setContext('expected_behavior', {
    feature,
    description: truth,
  });

  Sentry.setContext('actual_behavior', {
    description: actual,
    screen: _screen,
    render_state: _renderState,
    flow_step: _flowStep,
  });

  Sentry.withScope((scope) => {
    scope.setTag('feature_id', feature);
    scope.setTag('feature_name', name);
    scope.setTag('deviation_severity', severity);
    scope.setTag('screen', _screen);
    scope.setTag('render_state', _renderState);
    scope.setTag('flow_step', _flowStep);
    scope.setLevel(severity === 'CRITICAL_DEVIATION' ? 'error' : 'warning');

    Sentry.captureMessage(
      `[${severity}] ${feature} — ${name}: ${actual}`,
    );
  });
}

/**
 * Capture an Error (crash or thrown exception) with full product context.
 * Use this instead of raw Sentry.captureException() inside feature screens.
 */
export function captureProductError(
  error: unknown,
  feature: FeatureId,
  severity: DeviationSeverity = 'CODE_CRASH',
): void {
  const name = FEATURE_NAMES[feature];

  Sentry.setContext('product_truth', {
    feature,
    feature_name: name,
    current_feature: name,
  });

  Sentry.setContext('actual_behavior', {
    description: error instanceof Error ? error.message : String(error),
    screen: _screen,
    render_state: _renderState,
    flow_step: _flowStep,
  });

  Sentry.withScope((scope) => {
    scope.setTag('feature_id', feature);
    scope.setTag('feature_name', name);
    scope.setTag('deviation_severity', severity);
    scope.setTag('screen', _screen);
    scope.setTag('render_state', _renderState);
    scope.setTag('flow_step', _flowStep);
    scope.setLevel('error');

    Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
  });
}

// Re-export raw Sentry so callers can use Sentry.wrap / Sentry.withErrorBoundary
// without a second import from '@sentry/react-native'.
export { Sentry };

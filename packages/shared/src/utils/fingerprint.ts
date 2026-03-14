import type { StyleFingerprint } from '../types';

/**
 * Score a style fingerprint (e.g. for matching or ranking).
 * Placeholder — fingerprint scoring logic expanded in later phases.
 */
export function scoreFingerprint(fp: StyleFingerprint): number {
  return fp.swipe_count;
}

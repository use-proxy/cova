/**
 * useRoomPlan — hook for interacting with the RoomPlanModule native bridge.
 *
 * isAvailable is async: it calls the native isLiDARAvailable() promise which
 * checks ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh).
 * This correctly returns false on all non-LiDAR iPhones and on the Simulator.
 *
 * The scan lifecycle uses native events (not the startScan promise return):
 *   RoomPlanComplete  → resolves the scan promise
 *   RoomPlanError     → rejects the scan promise
 *   RoomPlanProgress  → fires onProgress callback during scan
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { NativeEventEmitter } from 'react-native';
import RoomPlanNative, { type RoomPlanResult } from '../modules/RoomPlanModule';

// Re-export so consumers can import from here
export type { RoomPlanResult, RoomPlanDoor, RoomPlanWindow } from '../modules/RoomPlanModule';

const SCAN_TIMEOUT_MS = 60 * 1000; // 60s — spec requires auto-fallback to 3-photo on timeout

export function useRoomPlan() {
  const [isAvailable, setIsAvailable] = useState(false);
  const [progressInstruction, setProgressInstruction] = useState('');

  const resolveRef = useRef<((data: RoomPlanResult) => void) | null>(null);
  const rejectRef  = useRef<((error: Error) => void) | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Async LiDAR availability check ──────────────────────────────────────
  useEffect(() => {
    if (!RoomPlanNative) return;
    RoomPlanNative.isLiDARAvailable()
      .then(setIsAvailable)
      .catch(() => setIsAvailable(false));
  }, []);

  // ── Event subscriptions ──────────────────────────────────────────────────
  useEffect(() => {
    if (!RoomPlanNative) return;

    let emitter: NativeEventEmitter;
    try {
      emitter = new NativeEventEmitter(RoomPlanNative);
    } catch {
      return;
    }

    const completeSub = emitter.addListener(
      'RoomPlanComplete',
      (data: RoomPlanResult) => {
        if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
        if (resolveRef.current) {
          resolveRef.current(data);
          resolveRef.current = null;
          rejectRef.current  = null;
        }
      },
    );

    const errorSub = emitter.addListener(
      'RoomPlanError',
      (data: { error: string }) => {
        if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
        if (rejectRef.current) {
          rejectRef.current(new Error(data.error));
          resolveRef.current = null;
          rejectRef.current  = null;
        }
      },
    );

    const progressSub = emitter.addListener(
      'RoomPlanProgress',
      (data: { instruction: string }) => {
        setProgressInstruction(data.instruction);
      },
    );

    return () => {
      completeSub.remove();
      errorSub.remove();
      progressSub.remove();
    };
  }, []);

  // ── startScan ────────────────────────────────────────────────────────────
  const startScan = useCallback((): Promise<RoomPlanResult> => {
    if (!RoomPlanNative || !isAvailable) {
      return Promise.reject(new Error('LiDAR scanning is not available on this device.'));
    }

    return new Promise((resolve, reject) => {
      resolveRef.current = resolve;
      rejectRef.current  = reject;

      // 5-minute hard timeout — prevents a stuck scan from blocking the UI forever
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        if (rejectRef.current) {
          rejectRef.current(new Error('Scan timed out. Please try again.'));
          resolveRef.current = null;
          rejectRef.current  = null;
        }
        RoomPlanNative?.stopScan().catch(() => {/* already stopped or no session */});
      }, SCAN_TIMEOUT_MS);

      // Kick off the native scan; startScan resolves immediately (scan runs async).
      // Reject the outer promise if the native call itself fails (e.g. already scanning).
      RoomPlanNative!.startScan().catch((err: unknown) => {
        if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
        if (rejectRef.current) {
          rejectRef.current(err instanceof Error ? err : new Error('Failed to start scan.'));
          resolveRef.current = null;
          rejectRef.current  = null;
        }
      });
    });
  }, [isAvailable]);

  // ── stopScan ─────────────────────────────────────────────────────────────
  const stopScan = useCallback(() => {
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    if (RoomPlanNative) {
      RoomPlanNative.stopScan().catch(() => {/* not scanning or already stopped */});
    }
  }, []);

  return { startScan, stopScan, isAvailable, progressInstruction };
}

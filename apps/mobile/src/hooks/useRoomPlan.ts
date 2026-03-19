// RoomPlan native module added in Phase 6 — fallback active.
import { useRef, useEffect, useCallback } from 'react';
import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

export interface RoomPlanWall {
  width_ft: number;
  height_ft: number;
  position: { x: number; y: number; z: number };
}

export interface RoomPlanDoor {
  width_ft: number;
  height_ft: number;
  position: { x: number; y: number; z: number };
}

export interface RoomPlanWindow {
  width_ft: number;
  height_ft: number;
  position: { x: number; y: number; z: number };
}

export interface RoomPlanResult {
  width_ft: number;
  depth_ft: number;
  height_ft: number;
  walls: RoomPlanWall[];
  doors: RoomPlanDoor[];
  windows: RoomPlanWindow[];
}

let RoomPlanModule: any = null;
try {
  RoomPlanModule = NativeModules.RoomPlanModule ?? null;
} catch {
  RoomPlanModule = null;
}

const moduleAvailable = Platform.OS === 'ios' && RoomPlanModule != null;

export function useRoomPlan() {
  const resolveRef = useRef<((data: RoomPlanResult) => void) | null>(null);
  const rejectRef = useRef<((error: Error) => void) | null>(null);

  const isAvailable = moduleAvailable;

  useEffect(() => {
    if (!isAvailable || !RoomPlanModule) return;

    let emitter: NativeEventEmitter;
    try {
      emitter = new NativeEventEmitter(RoomPlanModule);
    } catch {
      return;
    }

    const completeSub = emitter.addListener('RoomPlanComplete', (data: RoomPlanResult) => {
      if (resolveRef.current) {
        resolveRef.current(data);
        resolveRef.current = null;
        rejectRef.current = null;
      }
    });

    const errorSub = emitter.addListener('RoomPlanError', (data: { error: string }) => {
      if (rejectRef.current) {
        rejectRef.current(new Error(data.error));
        resolveRef.current = null;
        rejectRef.current = null;
      }
    });

    return () => {
      completeSub.remove();
      errorSub.remove();
    };
  }, [isAvailable]);

  const startScan = useCallback((): Promise<RoomPlanResult> => {
    if (!isAvailable || !RoomPlanModule) {
      return Promise.reject(new Error('RoomPlan is not available on this device'));
    }
    return new Promise((resolve, reject) => {
      resolveRef.current = resolve;
      rejectRef.current = reject;
      RoomPlanModule.startScan();
    });
  }, [isAvailable]);

  const stopScan = useCallback(() => {
    if (isAvailable && RoomPlanModule) {
      RoomPlanModule.stopScan();
    }
  }, [isAvailable]);

  return { startScan, stopScan, isAvailable };
}

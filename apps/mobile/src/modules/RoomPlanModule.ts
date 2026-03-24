/**
 * Typed bridge for the RoomPlanModule native module.
 *
 * The native module (ios/RoomPlanModule.swift + ios/RoomPlanModule.m) is only
 * compiled into the app on iOS. On Android (not shipped in V1) or when the
 * native module has not been linked, all exports return safe no-op values.
 *
 * Event contract (matches Swift emitRoomComplete / handleSessionError):
 *   RoomPlanComplete  → { width, depth, height, unit: 'm', doors, windows }
 *   RoomPlanError     → { error: string }
 *   RoomPlanProgress  → { instruction: string }
 */

import { NativeModules, Platform } from 'react-native';

// ── Native payload types (must match Swift emitRoomComplete payload exactly) ──

export interface RoomPlanDoor {
  x: number;
  z: number;
  width: number;
  wallSide: 'front' | 'back' | 'left' | 'right';
}

export interface RoomPlanWindow {
  x: number;
  z: number;
  width: number;
  height: number;
  wallSide: 'front' | 'back' | 'left' | 'right';
}

/** Dimensions are in metres — Swift RoomBuilder produces SI units. */
export interface RoomPlanResult {
  width: number;
  depth: number;
  height: number;
  doors: RoomPlanDoor[];
  windows: RoomPlanWindow[];
  thumbnailBase64: string; // JPEG screenshot — matches Swift captureView UIGraphicsImageRenderer output
}

// ── Native module interface (must match RCT_EXTERN_METHOD declarations) ──

interface RoomPlanNativeInterface {
  isLiDARAvailable: () => Promise<boolean>;
  startScan: () => Promise<void>;
  stopScan: () => Promise<void>;
  // Required by NativeEventEmitter
  addListener: (eventType: string) => void;
  removeListeners: (count: number) => void;
}

// ── Module access (safe — returns null on non-iOS or un-linked build) ──

const mod: RoomPlanNativeInterface | null =
  Platform.OS === 'ios'
    ? (NativeModules.RoomPlanModule as RoomPlanNativeInterface | null | undefined) ?? null
    : null;

export default mod;

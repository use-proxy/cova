import React, { useImperativeHandle, forwardRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber/native';
import * as THREE from 'three';

export interface CameraControlState {
  theta: number;
  fov: number;
}

export interface CameraControlHandle {
  handlePan: (dx: number, dy: number) => void;
  handleZoom: (delta: number) => void;
}

interface Props {
  controlRef: React.MutableRefObject<CameraControlState>;
}

// ⚠️ ASSERTION: useRef ONLY — never useState for camera values.
// useState triggers re-renders that conflict with PanResponder gesture callbacks
// and cause the camera to freeze. This is a permanent architectural constraint.

// Eye level locked at 1.6m per spec — horizontal orbit only (no phi/vertical tilt)
const EYE_Y = 1.6;
const ORBIT_RADIUS = 4.5;
const TARGET = new THREE.Vector3(0, 1.0, 0);
const FOV_MIN = 40;
// ⚠️ ASSERTION: FOV range 40–90 per spec — never change these bounds.
const FOV_MAX = 90;

function CameraControllerInner(
  { controlRef }: Props,
  ref: React.Ref<CameraControlHandle>,
) {
  const { camera } = useThree();

  useImperativeHandle(ref, () => ({
    handlePan: (dx: number, _dy: number) => {
      // Horizontal orbit only — vertical (_dy) ignored: eye level is locked at 1.6m
      controlRef.current.theta -= dx * 0.007;
    },
    handleZoom: (delta: number) => {
      controlRef.current.fov = Math.max(
        FOV_MIN,
        Math.min(FOV_MAX, controlRef.current.fov + delta * 0.3),
      );
    },
  }));

  useFrame(() => {
    const fov = Math.max(FOV_MIN, Math.min(FOV_MAX, controlRef.current.fov));
    controlRef.current.fov = fov;

    camera.position.set(
      ORBIT_RADIUS * Math.sin(controlRef.current.theta),
      EYE_Y,
      ORBIT_RADIUS * Math.cos(controlRef.current.theta),
    );
    camera.lookAt(TARGET);
    (camera as THREE.PerspectiveCamera).fov = fov;
    camera.updateProjectionMatrix();
  });

  return null;
}

export const CameraController = forwardRef<CameraControlHandle, Props>(CameraControllerInner);

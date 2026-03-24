import React, { useImperativeHandle, forwardRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber/native';
import * as THREE from 'three';

export interface CameraControlState {
  theta: number;
  phi: number;
  radius: number;
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

// lookAt target: y=1.2 matches eye level from doorway (CLAUDE.md §10.1)
const TARGET = new THREE.Vector3(0, 1.2, 0);
const PHI_MIN = 0.3;
const PHI_MAX = Math.PI / 2 - 0.05;
const RADIUS_MIN = 1.5;
// ⚠️ ASSERTION: RADIUS_MAX=6.0 — camera must stay inside room. Never increase.
const RADIUS_MAX = 6.0;

function CameraControllerInner(
  { controlRef }: Props,
  ref: React.Ref<CameraControlHandle>,
) {
  const { camera } = useThree();

  useImperativeHandle(ref, () => ({
    handlePan: (dx: number, dy: number) => {
      controlRef.current.theta -= dx * 0.007;
      controlRef.current.phi = Math.max(
        PHI_MIN,
        Math.min(PHI_MAX, controlRef.current.phi + dy * 0.005),
      );
    },
    handleZoom: (delta: number) => {
      controlRef.current.radius = Math.max(
        RADIUS_MIN,
        Math.min(RADIUS_MAX, controlRef.current.radius + delta * 0.012),
      );
    },
  }));

  useFrame(() => {
    const p = Math.max(PHI_MIN, Math.min(PHI_MAX, controlRef.current.phi));
    const r = Math.max(RADIUS_MIN, Math.min(RADIUS_MAX, controlRef.current.radius));
    controlRef.current.phi = p;
    controlRef.current.radius = r;

    const x = TARGET.x + r * Math.sin(p) * Math.sin(controlRef.current.theta);
    const y = TARGET.y + r * Math.cos(p);
    const z = TARGET.z + r * Math.sin(p) * Math.cos(controlRef.current.theta);

    camera.position.set(x, y, z);
    camera.lookAt(TARGET);
    camera.updateProjectionMatrix();
  });

  return null;
}

export const CameraController = forwardRef<CameraControlHandle, Props>(CameraControllerInner);

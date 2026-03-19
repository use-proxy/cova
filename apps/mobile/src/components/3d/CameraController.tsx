import { useThree, useFrame } from '@react-three/fiber/native';
import * as THREE from 'three';

export interface CameraControlState {
  theta: number;
  phi: number;
  radius: number;
}

interface Props {
  controlRef: React.MutableRefObject<CameraControlState>;
}

const TARGET = new THREE.Vector3(0, 1.0, 0);
const PHI_MIN = 0.3;
const PHI_MAX = Math.PI / 2 - 0.05;
const RADIUS_MIN = 1.5;
const RADIUS_MAX = 5.5;

export function CameraController({ controlRef }: Props) {
  const { camera } = useThree();

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

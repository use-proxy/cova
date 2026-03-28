import React, { useEffect, Suspense } from 'react';
import { useLoader } from '@react-three/fiber/native';
import * as THREE from 'three';
import type { StyleName, RoomDimensions } from '@cova/shared';
import { STYLE_PALETTE } from '../../data/furnitureCatalog';

const ftToM = (ft: number) => ft * 0.3048;

interface BoxRoomProps {
  style: StyleName;
  dimensions: RoomDimensions;
  wallColorOverride?: string;
  showGrid?: boolean;
}

// ── Error boundary for texture loading ──

class TextureErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error) {
    console.warn('PBR texture load failed, using solid color fallback:', error.message);
  }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

// ── PBR textured floor (loaded on top of solid color fallback) ──

const FLOOR_DIFF = require('../../../assets/textures/floor/wood_floor_diff_1k.jpg');
const FLOOR_NOR = require('../../../assets/textures/floor/wood_floor_nor_1k.jpg');
const FLOOR_ROUGH = require('../../../assets/textures/floor/wood_floor_rough_1k.jpg');
const FLOOR_AO = require('../../../assets/textures/floor/wood_floor_ao.jpg');

function TexturedFloor({ w, d }: { w: number; d: number }) {
  const textures = useLoader(THREE.TextureLoader, [
    FLOOR_DIFF,
    FLOOR_NOR,
    FLOOR_ROUGH,
    FLOOR_AO,
  ]) as THREE.Texture[];

  useEffect(() => {
    textures.forEach((t) => {
      t.repeat.set(w / 4, d / 4);
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.needsUpdate = true;
    });
  }, [textures, w, d]);

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0.001, 0]}
      receiveShadow
      castShadow={false}
    >
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial
        map={textures[0]}
        normalMap={textures[1]}
        roughnessMap={textures[2]}
        aoMap={textures[3]}
        aoMapIntensity={1.0}
        roughness={0.8}
        metalness={0.05}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

export function BoxRoom({ style, dimensions, wallColorOverride, showGrid }: BoxRoomProps) {
  const toMeters = dimensions.unit === 'm' ? (v: number) => v : ftToM;
  const w = toMeters(dimensions.width);
  const d = toMeters(dimensions.depth);
  const h = toMeters(dimensions.height);
  const palette = STYLE_PALETTE[style];
  const wallColor = wallColorOverride ?? palette?.walls ?? '#E8E0D5';
  const floorColor = palette?.floor ?? '#C9BEA8';
  const ceilingColor = palette?.ceiling ?? '#F5F0E8';
  const trimColor = palette?.trim ?? '#8B7355';
  const windowEmissive = new THREE.Color(palette?.emissive ?? '#FFF8F0');
  const baseboardH = 0.08;
  const baseboardD = 0.03;
  const crownH = 0.1;
  const crownD = 0.1;
  const doorH = 2.4;
  const doorFrameW = 0.1;
  const doorFrameD = 0.1;
  const windowH = 2.5;

  return (
    <group>
      {/* Solid color floor (always rendered as fallback) */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        receiveShadow
        castShadow={false}
      >
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color={floorColor} roughness={0.8} metalness={0.05} side={THREE.DoubleSide} />
      </mesh>

      {/* PBR textured floor overlay — skipped for minimalist (grey concrete, no wood) */}
      {style !== 'minimalist' && (
        <TextureErrorBoundary>
          <Suspense fallback={null}>
            <TexturedFloor w={w} d={d} />
          </Suspense>
        </TextureErrorBoundary>
      )}

      {/* Ceiling */}
      <mesh
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, h, 0]}
        receiveShadow={false}
        castShadow={false}
      >
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color={ceilingColor} roughness={0.95} metalness={0.0} side={THREE.DoubleSide} />
      </mesh>

      {/* Back wall */}
      <mesh position={[0, h / 2, -d / 2]} rotation={[0, 0, 0]} receiveShadow castShadow={false}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial color={wallColor} roughness={0.85} metalness={0.0} side={THREE.DoubleSide} />
      </mesh>

      {/* Left wall */}
      <mesh position={[-w / 2, h / 2, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow castShadow={false}>
        <planeGeometry args={[d, h]} />
        <meshStandardMaterial color={wallColor} roughness={0.85} metalness={0.0} side={THREE.DoubleSide} />
      </mesh>

      {/* Right wall */}
      <mesh position={[w / 2, h / 2, 0]} rotation={[0, -Math.PI / 2, 0]} receiveShadow castShadow={false}>
        <planeGeometry args={[d, h]} />
        <meshStandardMaterial color={wallColor} roughness={0.85} metalness={0.0} side={THREE.DoubleSide} />
      </mesh>

      {/* ── Baseboards ── */}
      <mesh position={[0, baseboardH / 2, -d / 2 + baseboardD / 2]} receiveShadow={false} castShadow={false}>
        <boxGeometry args={[w, baseboardH, baseboardD]} />
        <meshStandardMaterial color={trimColor} roughness={0.3} metalness={0} />
      </mesh>
      <mesh position={[-w / 2 + baseboardD / 2, baseboardH / 2, 0]} receiveShadow={false} castShadow={false}>
        <boxGeometry args={[baseboardD, baseboardH, d]} />
        <meshStandardMaterial color={trimColor} roughness={0.3} metalness={0} />
      </mesh>
      <mesh position={[w / 2 - baseboardD / 2, baseboardH / 2, 0]} receiveShadow={false} castShadow={false}>
        <boxGeometry args={[baseboardD, baseboardH, d]} />
        <meshStandardMaterial color={trimColor} roughness={0.3} metalness={0} />
      </mesh>

      {/* ── Crown molding (ceiling height indicator) ── */}
      <mesh position={[0, h - crownH / 2, -d / 2 + crownD / 2]}>
        <boxGeometry args={[w, crownH, crownD]} />
        <meshStandardMaterial color={trimColor} roughness={0.3} metalness={0} />
      </mesh>
      <mesh position={[-w / 2 + crownD / 2, h - crownH / 2, 0]}>
        <boxGeometry args={[crownD, crownH, d]} />
        <meshStandardMaterial color={trimColor} roughness={0.3} metalness={0} />
      </mesh>
      <mesh position={[w / 2 - crownD / 2, h - crownH / 2, 0]}>
        <boxGeometry args={[crownD, crownH, d]} />
        <meshStandardMaterial color={trimColor} roughness={0.3} metalness={0} />
      </mesh>

      {/* ── Door frame (front entrance) ── */}
      <mesh position={[-0.6, doorH / 2, d / 2 - doorFrameD / 2]}>
        <boxGeometry args={[doorFrameW, doorH, doorFrameD]} />
        <meshStandardMaterial color={trimColor} roughness={0.3} metalness={0} />
      </mesh>
      <mesh position={[0.6, doorH / 2, d / 2 - doorFrameD / 2]}>
        <boxGeometry args={[doorFrameW, doorH, doorFrameD]} />
        <meshStandardMaterial color={trimColor} roughness={0.3} metalness={0} />
      </mesh>
      <mesh position={[0, doorH + doorFrameW / 2, d / 2 - doorFrameD / 2]}>
        <boxGeometry args={[1.3, doorFrameW, doorFrameD]} />
        <meshStandardMaterial color={trimColor} roughness={0.3} metalness={0} />
      </mesh>

      {/* ── Window plane (back wall, emitting light) ── */}
      <mesh position={[0, h * 0.55, -d / 2 + 0.01]}>
        <planeGeometry args={[1.5, windowH]} />
        <meshStandardMaterial
          emissive={windowEmissive}
          emissiveIntensity={0.5}
          color="#B8D4E8"
          transparent
          opacity={0.35}
        />
      </mesh>
      <directionalLight
        position={[0, h * 0.8, -d / 2 + 1]}
        intensity={1.5}
        castShadow
        shadow-mapSize-width={512}
        shadow-mapSize-height={512}
      />

      {/* ── Ceiling height indicator line (subtle dashed line on side wall) ── */}
      {showGrid && (
        <mesh position={[-w / 2 + 0.005, h, 0]}>
          <planeGeometry args={[0.01, 0.01]} />
          <meshBasicMaterial color="transparent" opacity={0} transparent />
        </mesh>
      )}
      {showGrid && (
        <group position={[-w / 2 + 0.01, 0, -d / 2 + 0.5]}>
          {/* Vertical measurement line */}
          <mesh position={[0, h / 2, 0]}>
            <boxGeometry args={[0.005, h, 0.005]} />
            <meshBasicMaterial color="rgba(255,255,255,0.3)" transparent opacity={0.3} />
          </mesh>
          {/* Top tick */}
          <mesh position={[0.03, h - 0.01, 0]}>
            <boxGeometry args={[0.06, 0.005, 0.005]} />
            <meshBasicMaterial color="rgba(255,255,255,0.3)" transparent opacity={0.3} />
          </mesh>
          {/* Bottom tick */}
          <mesh position={[0.03, 0.01, 0]}>
            <boxGeometry args={[0.06, 0.005, 0.005]} />
            <meshBasicMaterial color="rgba(255,255,255,0.3)" transparent opacity={0.3} />
          </mesh>
        </group>
      )}

      {/* ── Floor grid (toggleable, off by default) ── */}
      {showGrid && (
        <gridHelper
          args={[Math.max(w, d), 10, 'rgba(255,255,255,0.15)', 'rgba(255,255,255,0.08)']}
          position={[0, 0.003, 0]}
        />
      )}
    </group>
  );
}

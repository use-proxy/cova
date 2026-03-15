import React from 'react';
import { BackSide } from 'three';
import type { CavaStyle, RoomDimensions } from '@cova/shared';
import { STYLE_COLORS } from '../../data/furnitureCatalog';

const ftToM = (ft: number) => ft * 0.3048;

interface BoxRoomProps {
  style: CavaStyle;
  dimensions: RoomDimensions;
}

export function BoxRoom({ style, dimensions }: BoxRoomProps) {
  const w = ftToM(dimensions.width_ft);
  const d = ftToM(dimensions.depth_ft);
  const h = ftToM(dimensions.height_ft);
  const colors = STYLE_COLORS[style];
  const baseboardH = 0.08;
  const baseboardD = 0.03;

  return (
    <group>
      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial
          color={colors.floor}
          roughness={0.8}
          metalness={0.05}
        />
      </mesh>

      {/* Ceiling */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, h, -d / 2]}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial
          color={colors.ceiling}
          roughness={0.95}
          metalness={0.0}
          side={BackSide}
        />
      </mesh>

      {/* Back wall */}
      <mesh position={[0, h / 2, -d]} receiveShadow>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial
          color={colors.wall}
          roughness={0.9}
          metalness={0.0}
          side={BackSide}
        />
      </mesh>

      {/* Front wall (behind camera) - optional for closed room */}
      <mesh position={[0, h / 2, d]} receiveShadow>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial
          color={colors.wall}
          roughness={0.9}
          metalness={0.0}
          side={BackSide}
        />
      </mesh>

      {/* Left wall */}
      <mesh position={[-w / 2, h / 2, -d / 2]} receiveShadow>
        <planeGeometry args={[d, h]} />
        <meshStandardMaterial
          color={colors.wall}
          roughness={0.9}
          metalness={0.0}
          side={BackSide}
        />
      </mesh>

      {/* Right wall */}
      <mesh position={[w / 2, h / 2, -d / 2]} receiveShadow>
        <planeGeometry args={[d, h]} />
        <meshStandardMaterial
          color={colors.wall}
          roughness={0.9}
          metalness={0.0}
          side={BackSide}
        />
      </mesh>

      {/* Baseboard trim - floor-wall intersections */}
      {/* Back */}
      <mesh position={[0, baseboardH / 2, -d + baseboardD / 2]}>
        <boxGeometry args={[w, baseboardH, baseboardD]} />
        <meshStandardMaterial color={colors.accent} roughness={0.8} metalness={0} />
      </mesh>
      {/* Front */}
      <mesh position={[0, baseboardH / 2, d - baseboardD / 2]}>
        <boxGeometry args={[w, baseboardH, baseboardD]} />
        <meshStandardMaterial color={colors.accent} roughness={0.8} metalness={0} />
      </mesh>
      {/* Left */}
      <mesh position={[-w / 2 + baseboardD / 2, baseboardH / 2, -d / 2]}>
        <boxGeometry args={[baseboardD, baseboardH, d]} />
        <meshStandardMaterial color={colors.accent} roughness={0.8} metalness={0} />
      </mesh>
      {/* Right */}
      <mesh position={[w / 2 - baseboardD / 2, baseboardH / 2, -d / 2]}>
        <boxGeometry args={[baseboardD, baseboardH, d]} />
        <meshStandardMaterial color={colors.accent} roughness={0.8} metalness={0} />
      </mesh>
    </group>
  );
}

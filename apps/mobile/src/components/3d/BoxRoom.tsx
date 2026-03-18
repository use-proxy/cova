import React from 'react';
import type { StyleName, RoomDimensions } from '@cova/shared';
import { STYLE_COLORS } from '../../data/furnitureCatalog';

const ftToM = (ft: number) => ft * 0.3048;

interface BoxRoomProps {
  style: StyleName;
  dimensions: RoomDimensions;
}

export function BoxRoom({ style, dimensions }: BoxRoomProps) {
  const w = ftToM(dimensions.width);
  const d = ftToM(dimensions.depth);
  const h = ftToM(dimensions.height);
  const palette = STYLE_COLORS[style];
  const wallColor = palette?.wall ?? '#E8E0D5';
  const floorColor = palette?.floor ?? '#C9BEA8';
  const ceilingColor = palette?.ceiling ?? '#F5F0E8';
  const accentColor = palette?.accent ?? '#8B7355';
  const baseboardH = 0.08;
  const baseboardD = 0.03;

  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        receiveShadow
        castShadow={false}
      >
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color={floorColor} roughness={0.8} metalness={0.05} />
      </mesh>

      <mesh
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, h, 0]}
        receiveShadow={false}
        castShadow={false}
      >
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color={ceilingColor} roughness={0.95} metalness={0.0} />
      </mesh>

      <mesh position={[0, h / 2, -d / 2]} rotation={[0, 0, 0]} receiveShadow castShadow={false}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial color={wallColor} roughness={0.9} metalness={0.0} />
      </mesh>

      <mesh position={[-w / 2, h / 2, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow castShadow={false}>
        <planeGeometry args={[d, h]} />
        <meshStandardMaterial color={wallColor} roughness={0.9} metalness={0.0} />
      </mesh>

      <mesh position={[w / 2, h / 2, 0]} rotation={[0, -Math.PI / 2, 0]} receiveShadow castShadow={false}>
        <planeGeometry args={[d, h]} />
        <meshStandardMaterial color={wallColor} roughness={0.9} metalness={0.0} />
      </mesh>

      <mesh position={[0, baseboardH / 2, -d / 2 + baseboardD / 2]} receiveShadow={false} castShadow={false}>
        <boxGeometry args={[w, baseboardH, baseboardD]} />
        <meshStandardMaterial color={accentColor} roughness={0.8} metalness={0} />
      </mesh>
      <mesh position={[-w / 2 + baseboardD / 2, baseboardH / 2, 0]} receiveShadow={false} castShadow={false}>
        <boxGeometry args={[baseboardD, baseboardH, d]} />
        <meshStandardMaterial color={accentColor} roughness={0.8} metalness={0} />
      </mesh>
      <mesh position={[w / 2 - baseboardD / 2, baseboardH / 2, 0]} receiveShadow={false} castShadow={false}>
        <boxGeometry args={[baseboardD, baseboardH, d]} />
        <meshStandardMaterial color={accentColor} roughness={0.8} metalness={0} />
      </mesh>
    </group>
  );
}

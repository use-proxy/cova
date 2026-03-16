import React from 'react';
import type { CavaStyle } from '@cova/shared';

interface StyleLight {
  ambientColor: string;
  ambientIntensity: number;
  dirColor: string;
  dirIntensity: number;
  dirPosition: [number, number, number];
  skyColor: string;
  groundColor: string;
  fillColor: string;
  fillIntensity: number;
  fillPosition: [number, number, number];
}

const STYLE_LIGHTING: Record<CavaStyle, StyleLight> = {
  japandi: {
    ambientColor: '#FFF8F0',
    ambientIntensity: 0.5,
    dirColor: '#FFF5E8',
    dirIntensity: 1.8,
    dirPosition: [6, 10, 6],
    skyColor: '#FFF8F0',
    groundColor: '#C9BEA8',
    fillColor: '#FFF8F0',
    fillIntensity: 0.36,
    fillPosition: [-6, 4, -6],
  },
  midcentury: {
    ambientColor: '#FFF3E0',
    ambientIntensity: 0.4,
    dirColor: '#FFE0A0',
    dirIntensity: 2.0,
    dirPosition: [4, 8, 4],
    skyColor: '#FFF3E0',
    groundColor: '#C4946A',
    fillColor: '#FFF3E0',
    fillIntensity: 0.4,
    fillPosition: [-4, 3, -4],
  },
  coastal: {
    ambientColor: '#F0F8FF',
    ambientIntensity: 0.7,
    dirColor: '#FFFFFF',
    dirIntensity: 2.2,
    dirPosition: [8, 12, 6],
    skyColor: '#E8F4FF',
    groundColor: '#C2D4DC',
    fillColor: '#E8F4FF',
    fillIntensity: 0.44,
    fillPosition: [-8, 4, -6],
  },
  industrial: {
    ambientColor: '#D0C8C0',
    ambientIntensity: 0.25,
    dirColor: '#FFA040',
    dirIntensity: 1.5,
    dirPosition: [2, 6, 2],
    skyColor: '#4A4540',
    groundColor: '#1A1A1A',
    fillColor: '#D0C8C0',
    fillIntensity: 0.3,
    fillPosition: [-2, 3, -2],
  },
  bohemian: {
    ambientColor: '#FFE8D0',
    ambientIntensity: 0.45,
    dirColor: '#FFB060',
    dirIntensity: 1.6,
    dirPosition: [4, 7, 3],
    skyColor: '#FFE8C8',
    groundColor: '#8B4513',
    fillColor: '#FFE8D0',
    fillIntensity: 0.32,
    fillPosition: [-4, 3, -3],
  },
};

interface SceneLightingProps {
  style: CavaStyle;
}

export function SceneLighting({ style }: SceneLightingProps) {
  const L = STYLE_LIGHTING[style] ?? STYLE_LIGHTING.japandi;

  return (
    <>
      <ambientLight intensity={L.ambientIntensity} color={L.ambientColor} />

      <directionalLight
        position={L.dirPosition}
        color={L.dirColor}
        intensity={L.dirIntensity}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={30}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
      />

      <hemisphereLight
        args={[L.skyColor, L.groundColor, 0.4]}
      />

      <directionalLight
        position={L.fillPosition}
        color={L.fillColor}
        intensity={L.fillIntensity}
      />
    </>
  );
}

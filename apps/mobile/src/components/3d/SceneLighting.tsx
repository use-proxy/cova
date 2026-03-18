import React from 'react';
import type { StyleName } from '@cova/shared';

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

const STYLE_LIGHTING: Record<StyleName, StyleLight> = {
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
  mid_century: {
    ambientColor: '#FFF3E0',
    ambientIntensity: 0.45,
    dirColor: '#FFD080',
    dirIntensity: 1.8,
    dirPosition: [5, 9, 5] as [number, number, number],
    skyColor: '#FFF3E0',
    groundColor: '#8B6914',
    fillColor: '#FFE8C0',
    fillIntensity: 0.35,
    fillPosition: [-5, 3, -5] as [number, number, number],
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
  minimalist: {
    ambientColor: '#FFFFFF',
    ambientIntensity: 0.6,
    dirColor: '#FFFFFF',
    dirIntensity: 2.0,
    dirPosition: [6, 10, 6] as [number, number, number],
    skyColor: '#F5F5F5',
    groundColor: '#D0D0D0',
    fillColor: '#FFFFFF',
    fillIntensity: 0.4,
    fillPosition: [-6, 4, -6] as [number, number, number],
  },
};

interface SceneLightingProps {
  style: StyleName;
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
      <hemisphereLight args={[L.skyColor, L.groundColor, 0.4]} />
      <directionalLight
        position={L.fillPosition}
        color={L.fillColor}
        intensity={L.fillIntensity}
      />
    </>
  );
}

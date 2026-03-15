import React from 'react';
import type { CavaStyle } from '@cova/shared';

const STYLE_LIGHTING: Record<
  CavaStyle,
  {
    ambient: number;
    ambientColor: string;
    dirColor: string;
    dirIntensity: number;
    dirPosition: [number, number, number];
    pointColor: string;
    pointIntensity: number;
  }
> = {
  japandi: {
    ambient: 0.6,
    ambientColor: '#FFF8F0',
    dirColor: '#FFE0A0',
    dirIntensity: 1.2,
    dirPosition: [4, 6, 3],
    pointColor: '#FFE0A0',
    pointIntensity: 0.4,
  },
  midcentury: {
    ambient: 0.5,
    ambientColor: '#FFF5E0',
    dirColor: '#FFD080',
    dirIntensity: 1.5,
    dirPosition: [3, 5, 2],
    pointColor: '#FF8C00',
    pointIntensity: 0.6,
  },
  coastal: {
    ambient: 0.8,
    ambientColor: '#E8F4FF',
    dirColor: '#FFFFFF',
    dirIntensity: 1.4,
    dirPosition: [5, 8, 4],
    pointColor: '#B0D8F0',
    pointIntensity: 0.3,
  },
  industrial: {
    ambient: 0.3,
    ambientColor: '#D0C8C0',
    dirColor: '#FFA040',
    dirIntensity: 0.8,
    dirPosition: [2, 4, 1],
    pointColor: '#FF6020',
    pointIntensity: 0.8,
  },
  bohemian: {
    ambient: 0.55,
    ambientColor: '#FFE8D0',
    dirColor: '#FF9040',
    dirIntensity: 1.0,
    dirPosition: [3, 5, 2],
    pointColor: '#FF4080',
    pointIntensity: 0.5,
  },
};

interface SceneLightingProps {
  style: CavaStyle;
}

export function SceneLighting({ style }: SceneLightingProps) {
  const L = STYLE_LIGHTING[style];
  return (
    <>
      <ambientLight intensity={L.ambient} color={L.ambientColor} />
      <directionalLight
        position={L.dirPosition}
        color={L.dirColor}
        intensity={L.dirIntensity}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-far={20}
        shadow-camera-near={0.1}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
      />
      <pointLight
        position={[-3, 2.5, 2]}
        color={L.pointColor}
        intensity={L.pointIntensity}
      />
    </>
  );
}

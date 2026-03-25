import React, { Suspense } from 'react';
import type { StyleName } from '@cova/shared';

// Attempt to import Environment from drei/native — may not be available
let EnvironmentComponent: React.ComponentType<{ files: unknown; background: boolean }> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  EnvironmentComponent = require('@react-three/drei/native').Environment ?? null;
} catch {
  EnvironmentComponent = null;
}

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

const HDRI_FILES: Record<StyleName, number> = {
  coastal: require('../../../assets/textures/hdri/sunset_fairway_1k.hdr'),
  japandi: require('../../../assets/textures/hdri/small_empty_room_1k.hdr'),
  bohemian: require('../../../assets/textures/hdri/colorful_studio_1k.hdr'),
  mid_century: require('../../../assets/textures/hdri/loft_hall_1k.hdr'),
  minimalist: require('../../../assets/textures/hdri/grey_room_1k.hdr'),
};

// ── Error boundary for HDRI loading ──

class HDRIErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error) {
    console.warn('HDRI load failed, using hemisphere + ambient lights:', error.message);
  }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

function HDRIEnvironment({ style }: { style: StyleName }) {
  if (!EnvironmentComponent) return null;
  const hdriFile = HDRI_FILES[style];
  if (!hdriFile) return null;

  return <EnvironmentComponent files={hdriFile} background={false} />;
}

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

      {/* HDRI environment — falls back silently to lights above if loading fails */}
      <HDRIErrorBoundary>
        <Suspense fallback={null}>
          <HDRIEnvironment style={style} />
        </Suspense>
      </HDRIErrorBoundary>
    </>
  );
}

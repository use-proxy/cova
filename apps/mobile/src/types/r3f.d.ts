/// <reference types="@react-three/fiber" />

import "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      group: Record<string, unknown>;
      mesh: Record<string, unknown>;
      primitive: Record<string, unknown>;
      planeGeometry: Record<string, unknown>;
      boxGeometry: Record<string, unknown>;
      meshStandardMaterial: Record<string, unknown>;
      meshBasicMaterial: Record<string, unknown>;
      ambientLight: Record<string, unknown>;
      directionalLight: Record<string, unknown>;
      pointLight: Record<string, unknown>;
    }
  }
}

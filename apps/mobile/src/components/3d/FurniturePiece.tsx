import React, { useRef, Suspense, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei/native';
import type { FurniturePiece as FurniturePieceType, FurnitureCatalogItem } from '@cova/shared';

interface FurniturePieceProps {
  piece: FurniturePieceType;
  catalog: FurnitureCatalogItem;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onDragEnd: (id: string, pos: [number, number, number]) => void;
  onDragStart?: () => void;
  onDragStop?: () => void;
}

const ROOM_HALF_W = 2.2;
const ROOM_HALF_D = 2.0;

function FurnitureModel({
  catalog,
  isSelected,
  colorOverride,
}: {
  catalog: FurnitureCatalogItem;
  isSelected: boolean;
  colorOverride: string | null;
}) {
  const gltf = useGLTF(catalog.glb_path as unknown as string) as unknown as {
    scene?: THREE.Group;
  };
  if (!gltf || !gltf.scene) return null;
  const clonedScene = useMemo(() => gltf.scene!.clone(), [gltf.scene]);
  const box = useRef<THREE.Box3>(new THREE.Box3());
  const size = useRef(new THREE.Vector3());

  useEffect(() => {
    try {
      clonedScene.traverse((child: THREE.Object3D) => {
        if (!(child as THREE.Mesh).isMesh) return;
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        const applyMat = (mat: THREE.Material | null | undefined) => {
          if (!(mat instanceof THREE.MeshStandardMaterial)) return;

          if (colorOverride) {
            mat.color.set(colorOverride);
          }

          if (isSelected) {
            mat.emissive.set('#C47B3C');
            mat.emissiveIntensity = 0.3;
          } else {
            mat.emissive.set('#000000');
            mat.emissiveIntensity = 0;
          }
          mat.needsUpdate = true;
        };

        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => applyMat(m));
        } else {
          applyMat(mesh.material);
        }
      });
    } catch (e) {
      console.warn('Material update skipped:', e);
    }
  }, [clonedScene, isSelected, colorOverride]);

  const scale = useMemo(() => {
    box.current.setFromObject(clonedScene);
    box.current.getSize(size.current);
    if (size.current.x === 0 || size.current.y === 0 || size.current.z === 0) return [1, 1, 1] as [number, number, number];
    const sx = catalog.width / size.current.x;
    const sy = catalog.height / size.current.y;
    const sz = catalog.depth / size.current.z;
    const s = Math.min(sx, sy, sz);
    return [s, s, s] as [number, number, number];
  }, [clonedScene, catalog.width, catalog.height, catalog.depth]);

  return <primitive object={clonedScene} scale={scale} />;
}

export function FurniturePiece({
  piece,
  catalog,
  isSelected,
  onSelect,
  onDragEnd,
  onDragStart,
  onDragStop,
}: FurniturePieceProps) {
  const groupRef = useRef<THREE.Group>(null);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    if (!isSelected) {
      isDraggingRef.current = false;
    }
  }, [isSelected]);

  return (
    <group
      ref={groupRef}
      position={[piece.position.x, 0, piece.position.y]}
      rotation={[0, piece.rotation_y, 0]}
    >
      <Suspense fallback={null}>
        <FurnitureModel
          catalog={catalog}
          isSelected={isSelected}
          colorOverride={piece.color_override}
        />
      </Suspense>

      <mesh
        position={[0, catalog.height / 2, 0]}
        onPointerDown={(e: any) => {
          e.stopPropagation();
          if (!isSelected) {
            onSelect(piece.id);
          } else {
            isDraggingRef.current = true;
            onDragStart?.();
          }
        }}
        onPointerUp={(e: any) => {
          e.stopPropagation();
          if (isDraggingRef.current && groupRef.current) {
            const pos = groupRef.current.position;
            onDragEnd(piece.id, [pos.x, 0, pos.z]);
          }
          isDraggingRef.current = false;
          onDragStop?.();
        }}
      >
        <boxGeometry args={[
          catalog.width + 0.1,
          catalog.height + 0.1,
          catalog.depth + 0.1,
        ]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {isSelected && (
        <mesh
          rotation={[-Math.PI / 2, -piece.rotation_y, 0]}
          position={[0, 0.002, 0]}
          onPointerMove={(e: any) => {
            if (!isDraggingRef.current || !groupRef.current) return;
            e.stopPropagation();
            const nx = Math.max(-ROOM_HALF_W, Math.min(ROOM_HALF_W, e.point.x));
            const nz = Math.max(-ROOM_HALF_D, Math.min(ROOM_HALF_D, e.point.z));
            groupRef.current.position.set(nx, 0, nz);
            onDragEnd(piece.id, [nx, 0, nz]);
          }}
          onPointerUp={(e: any) => {
            e.stopPropagation();
            if (isDraggingRef.current && groupRef.current) {
              const pos = groupRef.current.position;
              onDragEnd(piece.id, [pos.x, 0, pos.z]);
            }
            isDraggingRef.current = false;
            onDragStop?.();
          }}
          onPointerLeave={() => {
            if (isDraggingRef.current) {
              isDraggingRef.current = false;
              onDragStop?.();
            }
          }}
        >
          <planeGeometry args={[100, 100]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}

      {isSelected && (
        <mesh position={[0, catalog.height / 2, 0]}>
          <boxGeometry args={[
            catalog.width + 0.08,
            catalog.height + 0.08,
            catalog.depth + 0.08,
          ]} />
          <meshBasicMaterial color="#C47B3C" wireframe transparent opacity={0.5} />
        </mesh>
      )}
    </group>
  );
}

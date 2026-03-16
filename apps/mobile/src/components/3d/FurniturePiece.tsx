import React, { useRef, Suspense, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei/native';
import type { PlacedFurniture, CavaStyle } from '@cova/shared';
import type { FURNITURE_CATALOG } from '../../data/furnitureCatalog';
import { STYLE_MATERIALS } from '../../data/furnitureCatalog';

type CatalogItem = (typeof FURNITURE_CATALOG)[string];

interface FurniturePieceProps {
  piece: PlacedFurniture;
  catalog: CatalogItem;
  isSelected: boolean;
  editMode: boolean;
  onSelect: (id: string) => void;
  onDragEnd: (id: string, pos: [number, number, number]) => void;
  onDragStart?: () => void;
  onDragStop?: () => void;
}

const FABRIC_CATEGORIES = new Set(['sofa', 'chair']);
const TABLE_CATEGORIES = new Set(['table']);
const ROOM_HALF_W = 2.2;
const ROOM_HALF_D = 2.0;

function FurnitureModel({
  catalog,
  isSelected,
  style,
}: {
  catalog: CatalogItem;
  isSelected: boolean;
  style: CavaStyle;
}) {
  const gltf = useGLTF(catalog.model_path as unknown as string) as unknown as {
    scene?: THREE.Group;
  };
  if (!gltf || !gltf.scene) return null;
  const clonedScene = React.useMemo(() => gltf.scene!.clone(), [gltf.scene]);
  const box = useRef<THREE.Box3>(new THREE.Box3());
  const size = useRef(new THREE.Vector3());

  useEffect(() => {
    try {
      clonedScene.traverse((child: THREE.Object3D) => {
        if (!(child as THREE.Mesh).isMesh) return;
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        const styleMats = STYLE_MATERIALS[style];
        const catKey = catalog.category as keyof typeof styleMats;
        const styleMat = styleMats[catKey] ?? styleMats.sofa;
        if (!styleMat?.color) return;

        const applyMat = (mat: THREE.Material | null | undefined) => {
          if (!(mat instanceof THREE.MeshStandardMaterial)) return;
          if (!styleMat?.color) return;
          mat.color.set(styleMat.color);

          let roughness = styleMat.roughness ?? 0.8;
          let metalness = styleMat.metalness ?? 0.0;

          if (FABRIC_CATEGORIES.has(catalog.category)) {
            roughness = Math.min(1.0, roughness + 0.05);
          }
          if (TABLE_CATEGORIES.has(catalog.category)) {
            metalness = Math.min(1.0, metalness + 0.05);
          }

          mat.roughness = roughness;
          mat.metalness = metalness;
          mat.envMapIntensity = 0.3;

          if (isSelected) {
            mat.emissive.set('#C9A84C');
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
  }, [clonedScene, isSelected, style, catalog.category]);

  const scale = useMemo(() => {
    box.current.setFromObject(clonedScene);
    box.current.getSize(size.current);
    const sx = catalog.dimensions.w / size.current.x;
    const sy = catalog.dimensions.h / size.current.y;
    const sz = catalog.dimensions.d / size.current.z;
    const s = Math.min(sx, sy, sz);
    return [s, s, s] as [number, number, number];
  }, [clonedScene, catalog.dimensions.w, catalog.dimensions.h, catalog.dimensions.d]);

  return (
    <primitive
      object={clonedScene}
      scale={scale}
    />
  );
}

export function FurniturePiece({
  piece,
  catalog,
  isSelected,
  editMode,
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
      position={piece.position}
      rotation={[0, piece.rotation_y, 0]}
    >
      <Suspense fallback={null}>
        <FurnitureModel
          catalog={catalog}
          isSelected={isSelected}
          style={piece.style}
        />
      </Suspense>

      <mesh
        position={[0, catalog.dimensions.h / 2, 0]}
        onPointerDown={(e) => {
          e.stopPropagation();
          if (!isSelected) {
            onSelect(piece.id);
          } else {
            isDraggingRef.current = true;
            onDragStart?.();
            console.log('DRAG STARTED', piece.id);
          }
        }}
        onPointerUp={(e) => {
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
          catalog.dimensions.w + 0.1,
          catalog.dimensions.h + 0.1,
          catalog.dimensions.d + 0.1,
        ]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {isSelected && (
        <mesh
          rotation={[-Math.PI / 2, -piece.rotation_y, 0]}
          position={[0, 0.002, 0]}
          onPointerMove={(e) => {
            console.log('PLANE MOVE', isDraggingRef.current, e.point);
            if (!isDraggingRef.current || !groupRef.current) return;
            e.stopPropagation();
            const nx = Math.max(-ROOM_HALF_W, Math.min(ROOM_HALF_W, e.point.x));
            const nz = Math.max(-ROOM_HALF_D, Math.min(ROOM_HALF_D, e.point.z));
            groupRef.current.position.set(nx, 0, nz);
            onDragEnd(piece.id, [nx, 0, nz]);
          }}
          onPointerUp={(e) => {
            e.stopPropagation();
            if (isDraggingRef.current && groupRef.current) {
              const pos = groupRef.current.position;
              onDragEnd(piece.id, [pos.x, 0, pos.z]);
            }
            isDraggingRef.current = false;
            onDragStop?.();
          }}
          onPointerLeave={() => {
            console.log('PLANE LEAVE', isDraggingRef.current);
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
        <mesh position={[0, catalog.dimensions.h / 2, 0]}>
          <boxGeometry args={[
            catalog.dimensions.w + 0.08,
            catalog.dimensions.h + 0.08,
            catalog.dimensions.d + 0.08,
          ]} />
          <meshBasicMaterial
            color="#C9A84C"
            wireframe
            transparent
            opacity={0.5}
          />
        </mesh>
      )}
    </group>
  );
}

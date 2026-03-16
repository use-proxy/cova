import React, { useRef, useState, Suspense, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber/native';
import { useGLTF } from '@react-three/drei/native';
import type { PlacedFurniture, CavaStyle } from '@cova/shared';
import type { FURNITURE_CATALOG } from '../../data/furnitureCatalog';
import { STYLE_MATERIALS } from '../../data/furnitureCatalog';

type CatalogItem = (typeof FURNITURE_CATALOG)[string];

interface FurniturePieceProps {
  piece: PlacedFurniture;
  catalog: CatalogItem;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onDragEnd: (id: string, newPosition: [number, number, number]) => void;
}

function FurnitureModel({
  catalog,
  isSelected,
  style,
}: {
  catalog: CatalogItem;
  isSelected: boolean;
  style: CavaStyle;
}) {
  // NOTE: useGLTF returns a cached GLTF-like object in native
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
        const styleMats = STYLE_MATERIALS[style];
        const catKey = catalog.category as keyof typeof styleMats;
        const styleMat = styleMats[catKey] ?? styleMats.sofa;
        if (!styleMat?.color) return;

        const applyMat = (mat: THREE.Material | null | undefined) => {
          if (!(mat instanceof THREE.MeshStandardMaterial)) return;
          if (!styleMat?.color) return;
          mat.color.set(styleMat.color);
          mat.roughness =
            styleMat.roughness !== undefined ? styleMat.roughness : 0.8;
          mat.metalness =
            styleMat.metalness !== undefined ? styleMat.metalness : 0.0;
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
      castShadow
      receiveShadow
    />
  );
}

export function FurniturePiece({
  piece,
  catalog,
  isSelected,
  onSelect,
  onDragEnd,
}: FurniturePieceProps) {
  const groupRef = useRef<THREE.Group>(null);
  const [isDragging, setDragging] = useState(false);
  const dragPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const { raycaster } = useThree();

  const handlePointerDown = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    onSelect(piece.id);
    setDragging(true);
  };

  const handlePointerUp = () => {
    if (isDragging && groupRef.current) {
      const pos = groupRef.current.position;
      onDragEnd(piece.id, [pos.x, pos.y, pos.z]);
    }
    setDragging(false);
  };

  useFrame((state) => {
    if (!isDragging || !groupRef.current) return;
    const { pointer: p } = state;
    raycaster.setFromCamera(p, state.camera);
    const intersection = new THREE.Vector3();
    raycaster.ray.intersectPlane(dragPlane.current, intersection);
    if (intersection) {
      groupRef.current.position.x = intersection.x;
      groupRef.current.position.z = intersection.z;
      groupRef.current.position.y = 0;
    }
  });

  return (
    <group
      ref={groupRef}
      position={piece.position}
      rotation={[0, piece.rotation_y, 0]}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    >
      <Suspense fallback={null}>
        <FurnitureModel
          catalog={catalog}
          isSelected={isSelected}
          style={piece.style}
        />
      </Suspense>
      {isSelected && (
        <mesh>
          <boxGeometry
            args={[
              catalog.dimensions.w + 0.1,
              catalog.dimensions.h + 0.1,
              catalog.dimensions.d + 0.1,
            ]}
          />
          <meshBasicMaterial
            color="#C9A84C"
            wireframe
            transparent
            opacity={0.4}
          />
        </mesh>
      )}
    </group>
  );
}

import React, { useState, useRef, useCallback, Suspense, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  PanResponder,
  Animated,
  Dimensions,
  FlatList,
  Modal,
} from 'react-native';
import * as THREE from 'three';
import * as MediaLibrary from 'expo-media-library';
import ViewShot, { captureRef } from 'react-native-view-shot';
import { Canvas } from '@react-three/fiber/native';
import { EffectComposer, SSAO } from '@react-three/postprocessing';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Circle, Rect, Polygon, Line } from 'react-native-svg';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RoomStackParamList } from '../../navigation/RoomNavigator';
import { BoxRoom } from '../../components/3d/BoxRoom';
import { SceneLighting } from '../../components/3d/SceneLighting';
import { FurniturePiece } from '../../components/3d/FurniturePiece';
import { CameraController } from '../../components/3d/CameraController';
import type { CameraControlState } from '../../components/3d/CameraController';
import type { StyleName, RoomDimensions, FurniturePiece as FurniturePieceType, FurnitureCatalogItem, FurnitureCategory } from '@cova/shared';
import { FURNITURE_CATALOG, STYLE_PALETTE, getFurnitureForRoom } from '../../data/furnitureCatalog';
import { useAppStore } from '../../store';
import { supabase, callEdgeFunction } from '../../lib/supabase';

type Props = NativeStackScreenProps<RoomStackParamList, 'Viewer3D'>;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');


const PRICE_RANGE_LABELS: Record<string, string> = {
  budget: '$',
  mid: '$$',
  premium: '$$$',
};

const DEFAULT_DIMENSIONS: RoomDimensions = {
  width: 4.9,
  depth: 4.3,
  height: 2.7,
  unit: 'm',
};

const MAX_UNDO_HISTORY = 10;

const CATALOG_CATEGORIES: { key: FurnitureCategory | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'seating', label: 'Seating' },
  { key: 'tables', label: 'Tables' },
  { key: 'storage', label: 'Storage' },
  { key: 'lighting', label: 'Lighting' },
  { key: 'decor', label: 'Decor' },
  { key: 'plants', label: 'Plants' },
];

// ── SVG Icon Components ──────────────────────────

function BackIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M19 12H5M12 19l-7-7 7-7" stroke="white" strokeWidth={2} />
    </Svg>
  );
}

function PlusIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path d="M12 5v14M5 12h14" stroke="white" strokeWidth={2.5} />
    </Svg>
  );
}

function RotateLeftIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M3 12a9 9 0 019-9c2.52 0 4.93 1 6.74 2.74L21 8" stroke="white" strokeWidth={2} />
      <Path d="M21 3v5h-5" stroke="white" strokeWidth={2} />
    </Svg>
  );
}

function RotateRightIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M21 12a9 9 0 01-9 9c-2.52 0-4.93-1-6.74-2.74L3 16" stroke="white" strokeWidth={2} />
      <Path d="M3 21v-5h5" stroke="white" strokeWidth={2} />
    </Svg>
  );
}

function DeleteIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M3 6h18" stroke="#ff6464" strokeWidth={2} />
      <Path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" stroke="#ff6464" strokeWidth={2} />
    </Svg>
  );
}

function CheckIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M20 6L9 17l-5-5" stroke="#C4A45A" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function UndoIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d="M3 12a9 9 0 019-9c2.52 0 4.93 1 6.74 2.74L21 8" stroke="#C4A45A" strokeWidth={2} />
      <Path d="M21 3v5h-5" stroke="#C4A45A" strokeWidth={2} />
    </Svg>
  );
}

// ── Helpers ──────────────────────────────────────

function buildDefaultFurniture(style: StyleName): FurniturePieceType[] {
  const equalBlend = { coastal: 0.2, japandi: 0.2, bohemian: 0.2, mid_century: 0.2, minimalist: 0.2 };
  const items = getFurnitureForRoom('living_room', { ...equalBlend, [style]: 1.0 });
  const topItems = items.filter((item) => item.style_tags.includes(style)).slice(0, 4);
  return topItems.map((item, index) => ({
    id: `default-${item.id}-${index}`,
    catalog_id: item.id,
    name: item.name,
    category: item.category,
    glb_path: item.glb_path,
    position: { x: (index - 1.5) * 2, y: 0 },
    rotation_y: 0,
    scale: 1,
    color_override: null,
    width: item.width,
    depth: item.depth,
    height: item.height,
  }));
}

function cloneFurniture(arr: FurniturePieceType[]): FurniturePieceType[] {
  return arr.map((f) => ({ ...f, position: { ...f.position } }));
}

// ── Error boundary for 3D ────────────────────────

class ThreeDErrorBoundary extends React.Component<
  { children: React.ReactNode; onError: () => void },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error) {
    console.warn('3D render error caught:', error.message);
    this.props.onError();
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorFallback}>
          <Text style={styles.errorText}>Reloading scene...</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

// ── Main Component ──────────────────────────────

export default function RoomViewer3DScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const testMode = process.env.EXPO_PUBLIC_TEST_RENDER_MODE === 'true';

  const currentRoom = useAppStore((s) => s.currentRoom);

  const [activeStyle] = useState<StyleName>(() => {
    const blend = currentRoom?.style_blend;
    if (!blend) return 'japandi';
    const entries = Object.entries(blend) as [StyleName, number][];
    entries.sort(([, a], [, b]) => b - a);
    return entries[0][0];
  });
  const [sceneKey, setSceneKey] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const [placedFurniture, setPlacedFurniture] = useState<FurniturePieceType[]>(
    () => buildDefaultFurniture('japandi'),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionHistory, setActionHistory] = useState<FurniturePieceType[][]>([]);
  const [productInfoItem, setProductInfoItem] = useState<FurnitureCatalogItem | null>(null);
  const [show2D, setShow2D] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [showCatalog, setShowCatalog] = useState(false);
  const [catalogCategory, setCatalogCategory] = useState<FurnitureCategory | 'all'>('all');

  const viewShotRef = useRef<ViewShot>(null);
  const selectedIdRef = useRef<string | null>(null);
  const isDraggingRef = useRef(false);
  const furnitureRef = useRef(placedFurniture);
  furnitureRef.current = placedFurniture;

  const productSheetAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  const controlRef = useRef<CameraControlState>({
    theta: 0,
    fov: 60,
  });

  const lastTouchRef = useRef<{ x: number; y: number } | null>(null);
  const lastPinchRef = useRef<number>(0);
  const touchCountRef = useRef<number>(0);

  const user = useAppStore((s) => s.user);
  const currentRoomDimensions = useAppStore((s) => s.currentRoomDimensions);

  // ── detect-furniture on entry ──
  // When 3D viewer loads, call detect-furniture edge function to get furniture positions
  // from the room's render image. Falls back to buildDefaultFurniture silently.
  useEffect(() => {
    const renderUrl = currentRoom?.latest_render_url;
    if (!renderUrl || testMode) return;

    let cancelled = false;
    const timeoutId = setTimeout(() => { cancelled = true; }, 5000);

    const run = async () => {
      try {
        interface FurnitureSuggestion {
          category: string;
          x: number;
          z: number;
          rotation_y?: number;
        }
        interface DetectResult {
          suggestions: FurnitureSuggestion[];
          source: string;
        }
        const result = await callEdgeFunction<DetectResult>('detect-furniture', {
          render_url: renderUrl,
          room_type: currentRoom?.room_type ?? 'living_room',
          dimensions: currentRoomDimensions ?? DEFAULT_DIMENSIONS,
        });
        if (cancelled) return;
        if (!result?.suggestions?.length) return;

        const newFurniture: FurniturePieceType[] = result.suggestions.slice(0, 6).map((s, i) => {
          const catalogItem =
            FURNITURE_CATALOG.find((c) => c.category === s.category) ??
            FURNITURE_CATALOG[i % FURNITURE_CATALOG.length];
          return {
            id: `detected-${i}-${Date.now()}`,
            catalog_id: catalogItem.id,
            name: catalogItem.name,
            category: catalogItem.category,
            glb_path: catalogItem.glb_path,
            position: { x: s.x ?? 0, y: s.z ?? 0 },
            rotation_y: s.rotation_y ?? 0,
            scale: 1,
            color_override: null,
            width: catalogItem.width,
            depth: catalogItem.depth,
            height: catalogItem.height,
          };
        });
        setPlacedFurniture(newFurniture);
      } catch {
        // fallback to buildDefaultFurniture (already set as initial state)
      } finally {
        clearTimeout(timeoutId);
      }
    };

    run();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  // Run once on mount only
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Undo helpers ──

  const pushHistory = useCallback(() => {
    setActionHistory((prev) => {
      const snapshot = cloneFurniture(furnitureRef.current);
      const next = [...prev, snapshot];
      return next.length > MAX_UNDO_HISTORY ? next.slice(-MAX_UNDO_HISTORY) : next;
    });
  }, []);

  const handleUndo = useCallback(() => {
    setActionHistory((prev) => {
      if (prev.length === 0) return prev;
      const restored = prev[prev.length - 1];
      setPlacedFurniture(restored);
      setSelectedId(null);
      selectedIdRef.current = null;
      return prev.slice(0, -1);
    });
  }, []);

  // ── Product info sheet ──

  const showProductInfo = useCallback((catalogItem: FurnitureCatalogItem) => {
    setProductInfoItem(catalogItem);
    Animated.spring(productSheetAnim, {
      toValue: 0,
      useNativeDriver: true,
      friction: 8,
    }).start();
  }, [productSheetAnim]);

  const hideProductInfo = useCallback(() => {
    Animated.timing(productSheetAnim, {
      toValue: SCREEN_HEIGHT,
      duration: 250,
      useNativeDriver: true,
    }).start(() => setProductInfoItem(null));
  }, [productSheetAnim]);

  const handleLongPress = useCallback((pieceId: string) => {
    const piece = furnitureRef.current.find((p) => p.id === pieceId);
    if (!piece) return;
    const catalogItem = FURNITURE_CATALOG.find((c) => c.id === piece.catalog_id);
    if (!catalogItem) return;
    showProductInfo(catalogItem);
  }, [showProductInfo]);

  // ── Selection + drag ──

  const updateSelectedId = useCallback((id: string | null) => {
    selectedIdRef.current = id;
    setSelectedId(id);
    isDraggingRef.current = false;
  }, []);

  const updateIsDragging = useCallback((val: boolean) => {
    isDraggingRef.current = val;
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => selectedIdRef.current === null,
      onMoveShouldSetPanResponder: () => selectedIdRef.current === null,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponderCapture: () => false,

      onPanResponderGrant: (evt) => {
        if (selectedIdRef.current !== null) return;
        const touches = evt.nativeEvent.touches;
        touchCountRef.current = touches.length;
        if (touches.length >= 2) {
          lastTouchRef.current = null;
          const dx = touches[0].pageX - touches[1].pageX;
          const dy = touches[0].pageY - touches[1].pageY;
          lastPinchRef.current = Math.sqrt(dx * dx + dy * dy);
        } else {
          lastTouchRef.current = { x: touches[0].pageX, y: touches[0].pageY };
          lastPinchRef.current = 0;
        }
      },

      onPanResponderMove: (evt) => {
        if (selectedIdRef.current !== null) return;
        const touches = evt.nativeEvent.touches;
        touchCountRef.current = touches.length;

        if (touches.length >= 2) {
          lastTouchRef.current = null;
          const dx = touches[0].pageX - touches[1].pageX;
          const dy = touches[0].pageY - touches[1].pageY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (lastPinchRef.current > 0) {
            // Pinch → FOV zoom (40–90°) per spec
            const delta = lastPinchRef.current - dist;
            controlRef.current.fov = Math.max(
              40,
              Math.min(90, controlRef.current.fov + delta * 0.3),
            );
          }
          lastPinchRef.current = dist;
          return;
        }

        if (touches.length === 1 && lastTouchRef.current) {
          const dx = touches[0].pageX - lastTouchRef.current.x;
          lastTouchRef.current = { x: touches[0].pageX, y: touches[0].pageY };
          // Horizontal orbit only — vertical swipe ignored (eye level locked at 1.6m)
          controlRef.current.theta -= dx * 0.007;
        } else if (touches.length === 1) {
          lastTouchRef.current = { x: touches[0].pageX, y: touches[0].pageY };
        }
      },

      onPanResponderRelease: () => {
        lastTouchRef.current = null;
        lastPinchRef.current = 0;
        touchCountRef.current = 0;
      },
      onPanResponderTerminate: () => {
        lastTouchRef.current = null;
        lastPinchRef.current = 0;
        touchCountRef.current = 0;
      },
    }),
  ).current;

  const handleSelectId = useCallback(
    (id: string) => updateSelectedId(id),
    [updateSelectedId],
  );

  const handleDragStart = useCallback(() => {
    pushHistory();
    updateIsDragging(true);
  }, [pushHistory, updateIsDragging]);

  const handleDragStop = useCallback(() => updateIsDragging(false), [updateIsDragging]);

  const handlePointerMissed = useCallback(() => {
    if (selectedIdRef.current !== null && !isDraggingRef.current) {
      updateSelectedId(null);
    }
  }, [updateSelectedId]);

  // ── Actions ──

  const handleSave = async () => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please allow photo library access to save screenshots.');
        return;
      }
      const uri = await captureRef(viewShotRef, { format: 'jpg', quality: 0.9 });
      await MediaLibrary.saveToLibraryAsync(uri);
      Alert.alert('Saved', 'Screenshot saved to your camera roll');
    } catch (e) {
      console.warn('Save error:', e);
      Alert.alert('Error', 'Could not save screenshot');
    }
  };


  const handleError = useCallback(() => {
    setErrorCount((prev) => prev + 1);
    if (errorCount < 3) {
      setSceneKey((prev) => prev + 1);
    }
  }, [errorCount]);

  const updateFurniturePosition = useCallback(
    (id: string, newPosition: [number, number, number]) => {
      setPlacedFurniture((prev) =>
        prev.map((item) =>
          item.id === id
            ? { ...item, position: { x: newPosition[0], y: newPosition[2] } }
            : item,
        ),
      );
    },
    [],
  );

  const handleReset = useCallback(() => {
    Alert.alert(
      'Reset arrangement?',
      'All furniture will return to default positions.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            pushHistory();
            setPlacedFurniture(buildDefaultFurniture(activeStyle));
            updateSelectedId(null);
            setSceneKey((prev) => prev + 1);
          },
        },
      ],
    );
  }, [activeStyle, updateSelectedId, pushHistory]);

  const handleDone = useCallback(async () => {
    // Save furniture arrangement to Zustand
    useAppStore.getState().setPlacedFurniture(placedFurniture);
    // Fire-and-forget save to Supabase furniture_placements
    if (currentRoom?.id) {
      try {
        const rows = placedFurniture.map((piece) => ({
          room_id: currentRoom.id,
          furniture_catalog_id: piece.catalog_id,
          position_x: piece.position.x,
          position_y: piece.position.y,
          rotation_y: piece.rotation_y,
          scale: piece.scale,
        }));
        await supabase
          .from('furniture_placements')
          .upsert(rows, { onConflict: 'room_id,furniture_catalog_id' });
      } catch (e) {
        console.warn('furniture_placements save failed (non-blocking):', e);
      }
    }
    navigation.goBack();
  }, [placedFurniture, currentRoom, navigation]);

  const handleAddFurniture = useCallback((item: FurnitureCatalogItem) => {
    pushHistory();
    const newPiece: FurniturePieceType = {
      id: `piece-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      catalog_id: item.id,
      name: item.name,
      category: item.category,
      glb_path: item.glb_path,
      position: { x: 0, y: 0 },
      rotation_y: 0,
      scale: 1,
      color_override: null,
      width: item.width,
      depth: item.depth,
      height: item.height,
    };
    setPlacedFurniture((prev) => [...prev, newPiece]);
    setShowCatalog(false);
  }, [pushHistory]);

  const findCatalogItem = (catalogId: string) =>
    FURNITURE_CATALOG.find((c) => c.id === catalogId);

  const ceilingColor = STYLE_PALETTE[activeStyle]?.ceiling ?? '#F5F0E8';

  // ── Catalog data ──

  const catalogItems = useMemo(() => {
    const roomType = currentRoom?.room_type ?? 'living_room';
    const blend = currentRoom?.style_blend ?? { coastal: 0.2, japandi: 0.2, bohemian: 0.2, mid_century: 0.2, minimalist: 0.2 };
    const all = getFurnitureForRoom(roomType, blend);
    if (catalogCategory === 'all') return all;
    return all.filter((item) => item.category === catalogCategory);
  }, [currentRoom, catalogCategory]);

  // ── Room dimensions — always from store, fall back to DEFAULT_DIMENSIONS ──
  // ⚠️ ASSERTION: never hardcode room dimensions — §5.12 of CLAUDE.md.
  // Converts to metres so Three.js geometry and drag clamping are consistent.

  const roomDimensions = currentRoom?.dimensions ?? DEFAULT_DIMENSIONS;
  const ftToM = (ft: number) => ft * 0.3048;
  const roomWidthM = roomDimensions.unit === 'm' ? roomDimensions.width  : ftToM(roomDimensions.width);
  const roomDepthM = roomDimensions.unit === 'm' ? roomDimensions.depth  : ftToM(roomDimensions.depth);

  // ── 2D floor plan dimensions ──

  const roomW = roomWidthM;
  const roomD = roomDepthM;
  const floorAspect = roomW / roomD;
  const floorContainerW = SCREEN_WIDTH - 48;
  const floorContainerH = floorContainerW / floorAspect;
  const floorColor = STYLE_PALETTE[activeStyle]?.floor ?? '#C8B89A';

  // ── Selected piece data ──

  const selectedPiece = selectedId ? placedFurniture.find((p) => p.id === selectedId) : undefined;
  const selectedCatalog = selectedPiece ? findCatalogItem(selectedPiece.catalog_id) : undefined;
  const colorOptions = selectedCatalog?.colors ?? [];

  return (
    <View testID="room-viewer-3d" style={[styles.container, { backgroundColor: ceilingColor }]}>
      {/* ── 3D Canvas / 2D Floor Plan ── */}
      {show2D ? (
        <View style={styles.floorPlanWrapper}>
          <View
            style={[
              styles.floorPlanRoom,
              { width: floorContainerW, height: floorContainerH, backgroundColor: floorColor },
            ]}
          >
            {placedFurniture.map((piece) => {
              const screenX = ((piece.position.x / (roomW / 2) + 1) / 2) * floorContainerW;
              const screenY = ((piece.position.y / (roomD / 2) + 1) / 2) * floorContainerH;
              const pieceW = Math.max((piece.width / roomW) * floorContainerW, 16);
              const pieceH = Math.max((piece.depth / roomD) * floorContainerH, 16);
              return (
                <View
                  key={piece.id}
                  style={[
                    styles.floorPlanPiece,
                    { left: screenX - pieceW / 2, top: screenY - pieceH / 2, width: pieceW, height: pieceH },
                  ]}
                >
                  <Text style={styles.floorPlanPieceLabel} numberOfLines={1}>{piece.name}</Text>
                </View>
              );
            })}
          </View>
        </View>
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: ceilingColor }]}>
          <ViewShot ref={viewShotRef} style={styles.canvasContainer}>
            {/* In testMode skip the Canvas (GLView intercepts all native touches) */}
            {testMode ? (
              <View style={[styles.canvas, { backgroundColor: ceilingColor }]} />
            ) : (
            <ThreeDErrorBoundary onError={handleError}>
              <Canvas
                key={sceneKey}
                style={styles.canvas}
                gl={{
                  powerPreference: 'default',
                  antialias: false,
                  depth: true,
                  stencil: false,
                  alpha: false,
                  preserveDrawingBuffer: true,
                }}
                camera={{ fov: 75, near: 0.1, far: 50 }}
                shadows
                onCreated={({ gl }) => {
                  gl.setClearColor(ceilingColor, 1);
                  gl.shadowMap.enabled = true;
                  gl.shadowMap.type = THREE.PCFSoftShadowMap;
                }}
                onPointerMissed={handlePointerMissed}
              >
                <color attach="background" args={[ceilingColor]} />
                <CameraController controlRef={controlRef} />
                <Suspense fallback={null}>
                  <SceneLighting style={activeStyle} />
                  <BoxRoom style={activeStyle} dimensions={roomDimensions} showGrid={showGrid} />
                  {placedFurniture.map((item) => {
                    const catalog = findCatalogItem(item.catalog_id);
                    if (!catalog) return null;
                    return (
                      <FurniturePiece
                        key={item.id}
                        piece={item}
                        catalog={catalog}
                        isSelected={selectedId === item.id}
                        roomWidth={roomWidthM}
                        roomDepth={roomDepthM}
                        onSelect={handleSelectId}
                        onDragEnd={updateFurniturePosition}
                        onDragStart={handleDragStart}
                        onDragStop={handleDragStop}
                        onLongPress={handleLongPress}
                      />
                    );
                  })}
                  <EffectComposer>
                    <SSAO
                      radius={0.05}
                      intensity={15}
                      luminanceInfluence={0.6}
                      worldDistanceThreshold={20}
                      worldDistanceFalloff={5}
                      worldProximityThreshold={0.4}
                      worldProximityFalloff={0.1}
                    />
                  </EffectComposer>
                </Suspense>
              </Canvas>
            </ThreeDErrorBoundary>
            )}
          </ViewShot>
        </View>
      )}

      {/* ── PanResponder sibling — NEVER inside Canvas (§6.8) ── */}
      {!show2D && (
        <View
          style={StyleSheet.absoluteFill}
          pointerEvents="box-none"
          {...panResponder.panHandlers}
        />
      )}

      {/* ── HUD Overlay ── */}

      {/* Back button */}
      <TouchableOpacity
        style={[styles.backBtn, { top: insets.top + 16 }]}
        onPress={() => navigation.goBack()}
        activeOpacity={0.8}
      >
        <BackIcon />
      </TouchableOpacity>

      {/* 2D/3D toggle */}
      <TouchableOpacity
        testID="floorplan-toggle"
        style={[
          styles.toggle2DBtn,
          { top: insets.top + 60 },
          show2D && styles.toggle2DBtnActive,
        ]}
        onPress={() => setShow2D((v) => !v)}
      >
        <Text style={[styles.toggle2DBtnText, show2D && styles.toggle2DBtnTextActive]}>
          {show2D ? '3D' : '2D'}
        </Text>
      </TouchableOpacity>

      {/* Undo button */}
      {actionHistory.length > 0 && (
        <TouchableOpacity
          testID="undo-button"
          style={[styles.undoBtn, { top: insets.top + 100 }]}
          onPress={handleUndo}
        >
          <UndoIcon />
          <Text style={styles.undoBtnText}>Undo</Text>
        </TouchableOpacity>
      )}

      {/* View from Doorway button — top right, resets camera to initial position */}
      <TouchableOpacity
        style={[styles.doorwayBtn, { top: insets.top + 16 }]}
        onPress={() => {
          controlRef.current.theta = 0;
          controlRef.current.fov = 60;
        }}
        activeOpacity={0.8}
      >
        <Text style={styles.doorwayBtnText}>Doorway</Text>
      </TouchableOpacity>

      {/* Grid toggle button */}
      <TouchableOpacity
        style={[styles.gridBtn, { top: insets.top + 60 }, showGrid && styles.gridBtnActive]}
        onPress={() => setShowGrid((v) => !v)}
        activeOpacity={0.8}
      >
        <Text style={[styles.gridBtnText, showGrid && styles.gridBtnTextActive]}>Grid</Text>
      </TouchableOpacity>

      {/* Add furniture FAB */}
      {!selectedId && (
        <TouchableOpacity
          testID="add-fab"
          style={styles.addFab}
          onPress={() => setShowCatalog(true)}
          activeOpacity={0.85}
        >
          <PlusIcon />
        </TouchableOpacity>
      )}

      {/* Done button — saves furniture arrangement and navigates back */}
      {!selectedId && !showCatalog && (
        <View style={styles.renderBtnRow} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.renderBtn}
            onPress={handleDone}
            activeOpacity={0.85}
          >
            <Text style={styles.renderBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Furniture Selection Panel ── */}
      {selectedId && (
        <View style={styles.selectionPanel}>
          {/* Drag handle */}
          <View style={styles.panelHandleRow}>
            <View style={styles.panelHandle} />
          </View>

          {/* Color swatches */}
          {colorOptions.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.swatchScroll}>
              <View style={styles.swatchRow}>
                {colorOptions.map((color) => {
                  const isActive = selectedPiece?.color_override === color;
                  return (
                    <TouchableOpacity
                      key={color}
                      style={[
                        styles.colorSwatch,
                        { backgroundColor: color },
                        isActive && styles.colorSwatchSelected,
                      ]}
                      onPress={() => {
                        pushHistory();
                        setPlacedFurniture((prev) =>
                          prev.map((item) =>
                            item.id === selectedId
                              ? { ...item, color_override: item.color_override === color ? null : color }
                              : item,
                          ),
                        );
                      }}
                    />
                  );
                })}
              </View>
            </ScrollView>
          )}

          {/* Action buttons */}
          <View style={styles.actionBtnRow}>
            {/* Rotate Left */}
            <TouchableOpacity
              style={styles.actionCircleBtn}
              onPress={() => {
                pushHistory();
                setPlacedFurniture((prev) =>
                  prev.map((item) =>
                    item.id === selectedId
                      ? { ...item, rotation_y: item.rotation_y - Math.PI / 4 }
                      : item,
                  ),
                );
              }}
            >
              <RotateLeftIcon />
              <Text style={styles.actionBtnLabel}>Rotate</Text>
            </TouchableOpacity>

            {/* Rotate Right */}
            <TouchableOpacity
              style={styles.actionCircleBtn}
              onPress={() => {
                pushHistory();
                setPlacedFurniture((prev) =>
                  prev.map((item) =>
                    item.id === selectedId
                      ? { ...item, rotation_y: item.rotation_y + Math.PI / 4 }
                      : item,
                  ),
                );
              }}
            >
              <RotateRightIcon />
              <Text style={styles.actionBtnLabel}>Rotate</Text>
            </TouchableOpacity>

            {/* Delete */}
            <TouchableOpacity
              style={[styles.actionCircleBtn, styles.actionCircleBtnDelete]}
              onPress={() => {
                Alert.alert('Delete Furniture', 'Remove this piece from the room?', [
                  { text: 'Cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => {
                      pushHistory();
                      setPlacedFurniture((prev) => prev.filter((i) => i.id !== selectedId));
                      updateSelectedId(null);
                    },
                  },
                ]);
              }}
            >
              <DeleteIcon />
              <Text style={styles.actionBtnLabelDelete}>Delete</Text>
            </TouchableOpacity>

            {/* Done */}
            <TouchableOpacity
              style={styles.actionCircleBtn}
              onPress={() => updateSelectedId(null)}
            >
              <CheckIcon />
              <Text style={styles.actionBtnLabelGold}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Bottom action bar (Save / Reset) ── */}
      <View style={styles.bottomBar} pointerEvents="box-none">
        <TouchableOpacity style={styles.bottomBarBtn} onPress={handleSave}>
          <Text style={styles.bottomBarBtnText}>Save</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.bottomBarBtn} onPress={handleReset}>
          <Text style={styles.bottomBarBtnText}>Reset</Text>
        </TouchableOpacity>
      </View>


      {/* ── Product info bottom sheet ── */}
      {productInfoItem && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.sheetBackdrop}
            activeOpacity={1}
            onPress={hideProductInfo}
          />
          <Animated.View
            style={[styles.productSheet, { transform: [{ translateY: productSheetAnim }] }]}
          >
            <View style={styles.sheetHeader}>
              <View style={styles.sheetDragHandle} />
              <TouchableOpacity style={styles.sheetCloseBtn} onPress={hideProductInfo}>
                <Text style={styles.sheetCloseBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sheetTitle}>{productInfoItem.name}</Text>
            <Text style={styles.sheetCategory}>{productInfoItem.category}</Text>

            <View style={styles.sheetBadgeRow}>
              <View style={styles.priceBadge}>
                <Text style={styles.priceBadgeText}>
                  {PRICE_RANGE_LABELS[productInfoItem.price_range] ?? productInfoItem.price_range}
                </Text>
              </View>
            </View>

            <View style={styles.sheetDimensionsRow}>
              <Text style={styles.sheetDimLabel}>
                {productInfoItem.width}m W × {productInfoItem.depth}m D × {productInfoItem.height}m H
              </Text>
            </View>

            <View style={styles.sheetTagRow}>
              {productInfoItem.style_tags.map((tag) => (
                <View key={tag} style={styles.styleTagPill}>
                  <Text style={styles.styleTagText}>{tag.replace('_', ' ')}</Text>
                </View>
              ))}
            </View>

            {productInfoItem.colors.length > 0 && (
              <View style={styles.sheetColorRow}>
                <Text style={styles.sheetColorLabel}>Colors</Text>
                <View style={styles.colorSwatches}>
                  {productInfoItem.colors.map((color) => (
                    <View key={color} style={[styles.sheetColorSwatch, { backgroundColor: color }]} />
                  ))}
                </View>
              </View>
            )}

            {/* Action buttons: Buy Now / Move / Dismiss */}
            <View style={styles.sheetActionRow}>
              <TouchableOpacity
                style={styles.sheetBuyBtn}
                onPress={() => Alert.alert('Shop Now', `Find ${productInfoItem.name} at a retailer near you.`)}
                activeOpacity={0.85}
              >
                <Text style={styles.sheetBuyBtnText}>Buy Now</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.sheetMoveBtn}
                onPress={() => {
                  hideProductInfo();
                  // Ensure the piece triggering the popup is selected for dragging
                  const matchingPiece = placedFurniture.find((p) => {
                    const cat = FURNITURE_CATALOG.find((c) => c.id === p.catalog_id);
                    return cat?.name === productInfoItem.name;
                  });
                  if (matchingPiece) updateSelectedId(matchingPiece.id);
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.sheetMoveBtnText}>Move</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.sheetDismissBtn}
                onPress={hideProductInfo}
                activeOpacity={0.85}
              >
                <Text style={styles.sheetDismissBtnText}>Dismiss</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      )}

      {/* ── Add Furniture Catalog Modal ── */}
      <Modal
        visible={showCatalog}
        animationType="slide"
        transparent
        onRequestClose={() => setShowCatalog(false)}
      >
        <View style={styles.catalogOverlay}>
          <TouchableOpacity style={styles.catalogDismiss} onPress={() => setShowCatalog(false)} />
          <View style={styles.catalogSheet}>
            <View style={styles.catalogHeader}>
              <View style={styles.panelHandle} />
              <Text style={styles.catalogTitle}>Add Furniture</Text>
              <TouchableOpacity onPress={() => setShowCatalog(false)}>
                <Text style={styles.catalogCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Category tabs */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catalogTabScroll}>
              {CATALOG_CATEGORIES.map((cat) => {
                const isActive = catalogCategory === cat.key;
                return (
                  <TouchableOpacity
                    key={cat.key}
                    style={[styles.catalogTab, isActive && styles.catalogTabActive]}
                    onPress={() => setCatalogCategory(cat.key)}
                  >
                    <Text style={[styles.catalogTabText, isActive && styles.catalogTabTextActive]}>
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Items list */}
            <FlatList
              data={catalogItems}
              keyExtractor={(item) => item.id}
              numColumns={2}
              contentContainerStyle={styles.catalogList}
              columnWrapperStyle={styles.catalogRow}
              renderItem={({ item, index }) => (
                <TouchableOpacity
                  testID={`catalog-item-${index}`}
                  style={styles.catalogItem}
                  onPress={() => handleAddFurniture(item)}
                  activeOpacity={0.7}
                >
                  <View style={styles.catalogItemIcon}>
                    <Text style={styles.catalogItemEmoji}>🪑</Text>
                  </View>
                  <Text style={styles.catalogItemName} numberOfLines={2}>{item.name}</Text>
                  <Text style={styles.catalogItemMeta}>
                    {PRICE_RANGE_LABELS[item.price_range] ?? item.price_range}
                  </Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={styles.catalogEmpty}>
                  <Text style={styles.catalogEmptyText}>No items in this category</Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ──────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  canvasContainer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  canvas: { flex: 1 },
  errorFallback: { flex: 1, backgroundColor: '#1a1a2e', justifyContent: 'center', alignItems: 'center' },
  errorText: { color: '#C4A45A', fontSize: 16 },

  // ── Back button ──
  backBtn: {
    position: 'absolute',
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(10,22,40,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },

  // ── 2D/3D toggle ──
  toggle2DBtn: {
    position: 'absolute',
    right: 16,
    backgroundColor: 'rgba(10,22,40,0.7)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    zIndex: 20,
  },
  toggle2DBtnActive: {
    backgroundColor: '#C4A45A',
    borderColor: '#C4A45A',
  },
  toggle2DBtnText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '500',
  },
  toggle2DBtnTextActive: {
    color: '#0A1628',
  },

  // ── Undo ──
  undoBtn: {
    position: 'absolute',
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(10,22,40,0.7)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    zIndex: 20,
  },
  undoBtnText: {
    color: '#C4A45A',
    fontSize: 13,
    fontWeight: '600',
  },

  // ── View from Doorway button ──
  doorwayBtn: {
    position: 'absolute',
    right: 16,
    backgroundColor: 'rgba(10,22,40,0.7)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    zIndex: 20,
  },
  doorwayBtnText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '500',
  },

  // ── Grid toggle button ──
  gridBtn: {
    position: 'absolute',
    right: 16,
    backgroundColor: 'rgba(10,22,40,0.7)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    zIndex: 20,
  },
  gridBtnActive: {
    backgroundColor: '#C4A45A',
    borderColor: '#C4A45A',
  },
  gridBtnText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '500',
  },
  gridBtnTextActive: {
    color: '#0A1628',
  },

  // ── Add furniture FAB ──
  addFab: {
    position: 'absolute',
    bottom: 120,
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#C4A45A',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },

  // ── Render button ──
  renderBtnRow: {
    position: 'absolute',
    bottom: 120,
    left: 0,
    right: 80,
    alignItems: 'center',
    zIndex: 10,
  },
  renderBtn: {
    backgroundColor: '#C4A45A',
    borderRadius: 24,
    paddingHorizontal: 28,
    paddingVertical: 13,
  },
  renderBtnText: {
    color: '#0A1628',
    fontSize: 15,
    fontWeight: '600',
  },
  btnDisabled: { opacity: 0.5 },

  // ── Selection panel ──
  selectionPanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(10,22,40,0.92)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
    zIndex: 30,
  },
  panelHandleRow: {
    alignItems: 'center',
    marginBottom: 12,
  },
  panelHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  swatchScroll: {
    marginBottom: 16,
  },
  swatchRow: {
    flexDirection: 'row',
    gap: 8,
  },
  colorSwatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  colorSwatchSelected: {
    borderWidth: 2,
    borderColor: 'white',
  },
  actionBtnRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  actionCircleBtn: {
    alignItems: 'center',
  },
  actionCircleBtnDelete: {},
  actionBtnLabel: {
    fontSize: 11,
    color: 'white',
    marginTop: 6,
  },
  actionBtnLabelDelete: {
    fontSize: 11,
    color: '#ff6464',
    marginTop: 6,
  },
  actionBtnLabelGold: {
    fontSize: 11,
    color: '#C4A45A',
    marginTop: 6,
  },

  // ── Bottom bar ──
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
    backgroundColor: 'rgba(10,22,40,0.95)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
    zIndex: 10,
  },
  bottomBarBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  bottomBarBtnText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
  },

  // ── 2D floor plan ──
  floorPlanWrapper: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  floorPlanRoom: { borderWidth: 2, borderColor: '#1B3A2D', borderRadius: 4 },
  floorPlanPiece: {
    position: 'absolute',
    backgroundColor: '#C4A45A',
    opacity: 0.7,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  floorPlanPieceLabel: {
    fontSize: 7,
    color: 'white',
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: 1,
  },

  // ── Rendering overlay ──
  renderingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,22,40,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 40,
  },
  renderingText: {
    color: '#FFFFFF',
    fontSize: 16,
    marginTop: 16,
    fontWeight: '500',
  },
  renderingStyle: {
    color: '#C4A45A',
    fontSize: 14,
    marginTop: 6,
  },

  // ── Product info sheet ──
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  productSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#F5F0E8',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingBottom: 40,
    minHeight: 280,
    zIndex: 30,
  },
  sheetHeader: { alignItems: 'center', paddingTop: 12, paddingBottom: 8 },
  sheetDragHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#CCC' },
  sheetCloseBtn: {
    position: 'absolute',
    top: 12,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetCloseBtnText: { fontSize: 16, color: '#1B3A2D', fontWeight: '700' },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: '#1B3A2D', marginTop: 4 },
  sheetCategory: { fontSize: 14, color: '#888888', marginTop: 4 },
  sheetBadgeRow: { flexDirection: 'row', marginTop: 12, gap: 8 },
  priceBadge: {
    backgroundColor: 'rgba(196,164,90,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#C4A45A',
  },
  priceBadgeText: { color: '#C4A45A', fontWeight: '700', fontSize: 14 },
  sheetDimensionsRow: { marginTop: 12 },
  sheetDimLabel: { fontSize: 14, color: '#1A1A1A' },
  sheetTagRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12, gap: 8 },
  styleTagPill: {
    backgroundColor: 'rgba(27,58,45,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  styleTagText: { color: '#1B3A2D', fontSize: 12, fontWeight: '600' },
  sheetColorRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16, gap: 12 },
  sheetColorLabel: { color: '#1A1A1A', fontSize: 14, fontWeight: '600' },
  colorSwatches: { flexDirection: 'row', gap: 8 },
  sheetColorSwatch: { width: 28, height: 28, borderRadius: 14 },

  // ── Product sheet action buttons ──
  sheetActionRow: {
    flexDirection: 'row',
    marginTop: 20,
    gap: 8,
  },
  sheetBuyBtn: {
    flex: 2,
    backgroundColor: '#C47B3C',
    borderRadius: 20,
    paddingVertical: 12,
    alignItems: 'center',
  },
  sheetBuyBtnText: { color: 'white', fontWeight: '700', fontSize: 14 },
  sheetMoveBtn: {
    flex: 1,
    backgroundColor: 'rgba(27,58,45,0.1)',
    borderRadius: 20,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1B3A2D',
  },
  sheetMoveBtnText: { color: '#1B3A2D', fontWeight: '600', fontSize: 14 },
  sheetDismissBtn: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderRadius: 20,
    paddingVertical: 12,
    alignItems: 'center',
  },
  sheetDismissBtnText: { color: '#888', fontWeight: '500', fontSize: 14 },

  // ── Catalog modal ──
  catalogOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  catalogDismiss: {
    flex: 1,
  },
  catalogSheet: {
    backgroundColor: '#0A1628',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: SCREEN_HEIGHT * 0.65,
  },
  catalogHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  catalogTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  catalogCloseText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 20,
    fontWeight: '600',
  },
  catalogTabScroll: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  catalogTab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  catalogTabActive: {
    backgroundColor: '#C4A45A',
    borderColor: '#C4A45A',
  },
  catalogTabText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: '500',
  },
  catalogTabTextActive: {
    color: '#0A1628',
  },
  catalogList: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  catalogRow: {
    gap: 12,
    marginBottom: 12,
  },
  catalogItem: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  catalogItemIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(196,164,90,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  catalogItemEmoji: {
    fontSize: 22,
  },
  catalogItemName: {
    color: 'white',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 4,
  },
  catalogItemMeta: {
    color: '#C4A45A',
    fontSize: 12,
    fontWeight: '600',
  },
  catalogEmpty: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  catalogEmptyText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
  },
});

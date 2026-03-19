import React, { useState, useRef, useCallback, Suspense } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  PanResponder,
  Animated,
  Dimensions,
} from 'react-native';
import * as THREE from 'three';
import * as MediaLibrary from 'expo-media-library';
import ViewShot, { captureRef } from 'react-native-view-shot';
import { Canvas } from '@react-three/fiber/native';
import { EffectComposer, SSAO } from '@react-three/postprocessing';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RoomStackParamList } from '../../navigation/RoomNavigator';
import { BoxRoom } from '../../components/3d/BoxRoom';
import { SceneLighting } from '../../components/3d/SceneLighting';
import { FurniturePiece } from '../../components/3d/FurniturePiece';
import { CameraController } from '../../components/3d/CameraController';
import type { CameraControlState } from '../../components/3d/CameraController';
import type { StyleName, RoomDimensions, FurniturePiece as FurniturePieceType, FurnitureCatalogItem } from '@cova/shared';
import { FURNITURE_CATALOG, STYLE_COLORS, getFurnitureForRoom } from '../../data/furnitureCatalog';
import { useAppStore } from '../../store';

type Props = NativeStackScreenProps<RoomStackParamList, 'Viewer3D'>;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const PHI_MIN = 0.3;
const PHI_MAX = Math.PI / 2 - 0.05;

const STYLES: { key: StyleName; label: string }[] = [
  { key: 'coastal', label: 'Ocean Breeze' },
  { key: 'japandi', label: 'Zen Garden' },
  { key: 'bohemian', label: 'Boho Spirit' },
  { key: 'mid_century', label: 'Mid-Century' },
  { key: 'minimalist', label: 'Pure Lines' },
];

const PRICE_RANGE_LABELS: Record<string, string> = {
  budget: '$',
  mid: '$$',
  premium: '$$$',
};

const DEFAULT_DIMENSIONS: RoomDimensions = {
  width: 16,
  depth: 14,
  height: 9,
  unit: 'ft',
};

const MAX_UNDO_HISTORY = 10;

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

export default function RoomViewer3DScreen({ navigation }: Props) {
  const [activeStyle, setActiveStyle] = useState<StyleName>('japandi');
  const [sceneKey, setSceneKey] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const [isRendering, setIsRendering] = useState(false);
  const [placedFurniture, setPlacedFurniture] = useState<FurniturePieceType[]>(
    () => buildDefaultFurniture('japandi'),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [forceUpdate, setForceUpdate] = useState(0);
  const [actionHistory, setActionHistory] = useState<FurniturePieceType[][]>([]);
  const [productInfoItem, setProductInfoItem] = useState<FurnitureCatalogItem | null>(null);
  const [show2D, setShow2D] = useState(false);
  const viewShotRef = useRef<ViewShot>(null);

  const selectedIdRef = useRef<string | null>(null);
  const isDraggingRef = useRef(false);
  const furnitureRef = useRef(placedFurniture);
  furnitureRef.current = placedFurniture;

  const productSheetAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  const controlRef = useRef<CameraControlState>({
    theta: Math.PI,
    phi: 1.25,
    radius: 5.0,
  });

  const lastTouchRef = useRef<{ x: number; y: number } | null>(null);
  const lastPinchRef = useRef<number>(0);
  const touchCountRef = useRef<number>(0);

  const user = useAppStore((s) => s.user);
  const currentRoom = useAppStore((s) => s.currentRoom);

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
            const delta = lastPinchRef.current - dist;
            controlRef.current.radius = Math.max(
              1.5,
              Math.min(5.5, controlRef.current.radius + delta * 0.012),
            );
          }
          lastPinchRef.current = dist;
          return;
        }

        if (touches.length === 1 && lastTouchRef.current) {
          const dx = touches[0].pageX - lastTouchRef.current.x;
          const dy = touches[0].pageY - lastTouchRef.current.y;
          lastTouchRef.current = { x: touches[0].pageX, y: touches[0].pageY };
          controlRef.current.theta -= dx * 0.007;
          controlRef.current.phi = Math.max(
            PHI_MIN,
            Math.min(PHI_MAX, controlRef.current.phi + dy * 0.005),
          );
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

  const handleStyleChange = useCallback(
    (newStyle: StyleName) => {
      setActiveStyle(newStyle);
      setPlacedFurniture(buildDefaultFurniture(newStyle));
      updateSelectedId(null);
      setActionHistory([]);
      setSceneKey((prev) => prev + 1);
    },
    [updateSelectedId],
  );

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
    pushHistory();
    setPlacedFurniture(buildDefaultFurniture(activeStyle));
    updateSelectedId(null);
    setSceneKey((prev) => prev + 1);
  }, [activeStyle, updateSelectedId, pushHistory]);

  const handleAIRender = async () => {
    if (!user) {
      Alert.alert('Please sign in', 'You must be signed in to render.');
      return;
    }

    setIsRendering(true);
    try {
      const uri = await captureRef(viewShotRef, { format: 'jpg', quality: 0.9 });
      useAppStore.getState().setCapturedImageUri(uri);
      setIsRendering(false);
      navigation.navigate('RenderView', { room_id: currentRoom?.id });
    } catch {
      setIsRendering(false);
      Alert.alert('Error', 'Could not capture room screenshot.');
    }
  };

  const findCatalogItem = (catalogId: string) =>
    FURNITURE_CATALOG.find((c) => c.id === catalogId);

  const ceilingColor = STYLE_COLORS[activeStyle]?.ceiling ?? '#F5F0E8';

  const roomW = DEFAULT_DIMENSIONS.width;
  const roomD = DEFAULT_DIMENSIONS.depth;
  const floorAspect = roomW / roomD;
  const floorContainerW = SCREEN_WIDTH - 48;
  const floorContainerH = floorContainerW / floorAspect;
  const floorColor = STYLE_COLORS[activeStyle]?.floor ?? '#C8B89A';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: ceilingColor }]}>
      {show2D ? (
        <View style={styles.floorPlanWrapper}>
          <View
            style={[
              styles.floorPlanRoom,
              {
                width: floorContainerW,
                height: floorContainerH,
                backgroundColor: floorColor,
              },
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
                    {
                      left: screenX - pieceW / 2,
                      top: screenY - pieceH / 2,
                      width: pieceW,
                      height: pieceH,
                    },
                  ]}
                >
                  <Text style={styles.floorPlanPieceLabel} numberOfLines={1}>{piece.name}</Text>
                </View>
              );
            })}
          </View>
        </View>
      ) : (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: ceilingColor }]} {...panResponder.panHandlers}>
        <ViewShot ref={viewShotRef} style={styles.canvasContainer}>
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
                <BoxRoom style={activeStyle} dimensions={DEFAULT_DIMENSIONS} />
                {placedFurniture.map((item) => {
                  const catalog = findCatalogItem(item.catalog_id);
                  if (!catalog) return null;
                  return (
                    <FurniturePiece
                      key={item.id}
                      piece={item}
                      catalog={catalog}
                      isSelected={selectedId === item.id}
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
        </ViewShot>
      </View>
      )}

      {/* 2D/3D toggle */}
      <TouchableOpacity
        style={[styles.toggle2DBtn, show2D && styles.toggle2DBtnActive]}
        onPress={() => setShow2D((v) => !v)}
      >
        <Text style={styles.toggle2DBtnText}>{show2D ? '3D' : '2D'}</Text>
      </TouchableOpacity>

      {/* Style chips */}
      <View style={styles.chipRow} pointerEvents="box-none">
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {STYLES.map((s) => (
            <TouchableOpacity
              key={s.key}
              style={[styles.chip, activeStyle === s.key && styles.chipActive]}
              onPress={() => handleStyleChange(s.key)}
            >
              <Text style={[styles.chipLabel, activeStyle === s.key && styles.chipLabelActive]}>
                {s.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Undo button */}
      {actionHistory.length > 0 && (
        <TouchableOpacity style={styles.undoBtn} onPress={handleUndo}>
          <Text style={styles.undoBtnText}>↩ Undo</Text>
        </TouchableOpacity>
      )}

      {/* Selected piece panel */}
      {selectedId && (() => {
        const selectedPiece = placedFurniture.find((p) => p.id === selectedId);
        const selectedCatalog = selectedPiece ? findCatalogItem(selectedPiece.catalog_id) : undefined;
        const colorOptions = selectedCatalog?.colors ?? [];
        return (
        <View style={styles.selectedPanel}>
          <Text style={styles.selectedPanelText}>Tap & drag to move</Text>
          {colorOptions.length > 0 && (
            <View style={styles.colorSwatchRow}>
              {colorOptions.map((color) => (
                <TouchableOpacity
                  key={color}
                  style={[
                    styles.colorSwatch,
                    { backgroundColor: color },
                    selectedPiece?.color_override === color && styles.colorSwatchSelected,
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
                    setForceUpdate((p) => p + 1);
                  }}
                />
              ))}
            </View>
          )}
          <View style={styles.selectedPanelActions}>
            <TouchableOpacity
              style={styles.rotateBtn}
              onPress={() => {
                pushHistory();
                setPlacedFurniture((prev) =>
                  prev.map((item) =>
                    item.id === selectedId
                      ? { ...item, rotation_y: item.rotation_y - Math.PI / 4 }
                      : item,
                  ),
                );
                setForceUpdate((p) => p + 1);
              }}
            >
              <Text style={styles.rotateBtnText}>{'↺'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.rotateBtn}
              onPress={() => {
                pushHistory();
                setPlacedFurniture((prev) =>
                  prev.map((item) =>
                    item.id === selectedId
                      ? { ...item, rotation_y: item.rotation_y + Math.PI / 4 }
                      : item,
                  ),
                );
                setForceUpdate((p) => p + 1);
              }}
            >
              <Text style={styles.rotateBtnText}>{'↻'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.removeBtn}
              onPress={() => {
                pushHistory();
                setPlacedFurniture((prev) => prev.filter((i) => i.id !== selectedId));
                updateSelectedId(null);
              }}
            >
              <Text style={styles.removeBtnText}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.doneBtn} onPress={() => updateSelectedId(null)}>
              <Text style={styles.doneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
        );
      })()}

      {/* Action bar */}
      <View style={styles.actionBar} pointerEvents="box-none">
        <TouchableOpacity style={styles.btnSave} onPress={handleSave}>
          <Text style={styles.btnSaveText}>Save</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btnRender, isRendering && styles.btnDisabled]}
          onPress={handleAIRender}
          disabled={isRendering}
        >
          <Text style={styles.btnRenderText}>Render Room</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnReset} onPress={handleReset}>
          <Text style={styles.btnResetText}>Reset</Text>
        </TouchableOpacity>
      </View>

      {/* Rendering overlay */}
      {isRendering && (
        <View style={styles.renderingOverlay}>
          <ActivityIndicator size="large" color="#C47B3C" />
          <Text style={styles.renderingText}>Generating your design...</Text>
          <Text style={styles.renderingStyle}>
            {STYLES.find((s) => s.key === activeStyle)?.label ?? activeStyle}
          </Text>
        </View>
      )}

      {/* Product info bottom sheet */}
      {productInfoItem && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.sheetBackdrop}
            activeOpacity={1}
            onPress={hideProductInfo}
          />
          <Animated.View
            style={[
              styles.productSheet,
              { transform: [{ translateY: productSheetAnim }] },
            ]}
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
                {productInfoItem.width}ft W × {productInfoItem.depth}ft D × {productInfoItem.height}ft H
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
                    <View
                      key={color}
                      style={[styles.colorSwatch, { backgroundColor: color }]}
                    />
                  ))}
                </View>
              </View>
            )}
          </Animated.View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  canvasContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  canvas: { flex: 1 },
  chipRow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 52,
    paddingHorizontal: 12,
    paddingBottom: 10,
    backgroundColor: 'rgba(27,58,45,0.55)',
    zIndex: 10,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.2)',
    marginRight: 8,
    backgroundColor: 'rgba(27,58,45,0.6)',
  },
  chipActive: {
    borderColor: '#C47B3C',
    backgroundColor: 'rgba(196,123,60,0.15)',
  },
  chipLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '500',
  },
  chipLabelActive: { color: '#C47B3C' },

  // 2D floor plan
  floorPlanWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  floorPlanRoom: {
    borderWidth: 2,
    borderColor: '#1B3A2D',
    borderRadius: 4,
  },
  floorPlanPiece: {
    position: 'absolute',
    backgroundColor: '#C47B3C',
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
  toggle2DBtn: {
    position: 'absolute',
    top: 100,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    zIndex: 20,
  },
  toggle2DBtnActive: {
    backgroundColor: '#C47B3C',
  },
  toggle2DBtnText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '700',
  },

  // Undo
  undoBtn: {
    position: 'absolute',
    top: 140,
    right: 16,
    backgroundColor: 'rgba(27,58,45,0.85)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#C47B3C',
    zIndex: 10,
  },
  undoBtnText: {
    color: '#C47B3C',
    fontSize: 13,
    fontWeight: '700',
  },

  actionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    padding: 12,
    paddingBottom: 28,
    gap: 10,
    backgroundColor: 'rgba(27,58,45,0.65)',
    zIndex: 10,
  },
  btnSave: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  btnSaveText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },
  btnRender: {
    flex: 1,
    backgroundColor: '#C47B3C',
    borderRadius: 28,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnRenderText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  btnReset: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  btnResetText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },
  btnDisabled: { opacity: 0.5 },

  selectedPanel: {
    position: 'absolute',
    bottom: 90,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(27,58,45,0.9)',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  selectedPanelText: {
    color: '#FFFFFF',
    fontSize: 12,
    flex: 1,
    marginRight: 12,
  },
  colorSwatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  colorSwatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorSwatchSelected: {
    borderColor: '#C47B3C',
    borderWidth: 3,
  },
  selectedPanelActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rotateBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(196,123,60,0.2)',
    borderWidth: 1.5,
    borderColor: '#C47B3C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rotateBtnText: {
    color: '#C47B3C',
    fontSize: 18,
    fontWeight: '600',
  },
  doneBtn: {
    backgroundColor: 'rgba(196,123,60,0.15)',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1.5,
    borderColor: '#C47B3C',
  },
  doneBtnText: {
    color: '#C47B3C',
    fontSize: 13,
    fontWeight: '600',
  },
  removeBtn: {
    backgroundColor: 'rgba(255,80,80,0.2)',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,80,80,0.5)',
  },
  removeBtnText: {
    color: '#FF6B6B',
    fontSize: 13,
    fontWeight: '600',
  },
  errorFallback: {
    flex: 1,
    backgroundColor: '#1B3A2D',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: { color: '#C47B3C', fontSize: 16 },
  renderingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(27,58,45,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  renderingText: {
    color: '#FFFFFF',
    fontSize: 16,
    marginTop: 16,
    fontWeight: '500',
  },
  renderingStyle: {
    color: '#C47B3C',
    fontSize: 14,
    marginTop: 6,
  },

  // Product info bottom sheet
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
  sheetHeader: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 8,
  },
  sheetDragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CCC',
  },
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
  sheetCloseBtnText: {
    fontSize: 16,
    color: '#1B3A2D',
    fontWeight: '700',
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1B3A2D',
    marginTop: 4,
  },
  sheetCategory: {
    fontSize: 14,
    color: '#888888',
    marginTop: 4,
    textTransform: 'capitalize',
  },
  sheetBadgeRow: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 8,
  },
  priceBadge: {
    backgroundColor: 'rgba(196,123,60,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#C47B3C',
  },
  priceBadgeText: {
    color: '#C47B3C',
    fontWeight: '700',
    fontSize: 14,
  },
  sheetDimensionsRow: {
    marginTop: 12,
  },
  sheetDimLabel: {
    fontSize: 14,
    color: '#1A1A1A',
  },
  sheetTagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
    gap: 8,
  },
  styleTagPill: {
    backgroundColor: 'rgba(27,58,45,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  styleTagText: {
    color: '#1B3A2D',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  sheetColorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    gap: 12,
  },
  sheetColorLabel: {
    color: '#1A1A1A',
    fontSize: 14,
    fontWeight: '600',
  },
  colorSwatches: {
    flexDirection: 'row',
    gap: 8,
  },
});

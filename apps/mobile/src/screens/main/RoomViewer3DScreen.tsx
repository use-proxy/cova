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
import type { StyleName, RoomDimensions, FurniturePiece as FurniturePieceType } from '@cova/shared';
import { FURNITURE_CATALOG, STYLE_COLORS, getFurnitureForRoom } from '../../data/furnitureCatalog';
import { supabase, callEdgeFunction } from '../../lib/supabase';
import { useAppStore } from '../../store';

type Props = NativeStackScreenProps<RoomStackParamList, 'Viewer3D'>;

const STYLES: { key: StyleName; label: string }[] = [
  { key: 'coastal', label: 'Ocean Breeze' },
  { key: 'japandi', label: 'Zen Garden' },
  { key: 'bohemian', label: 'Boho Spirit' },
  { key: 'mid_century', label: 'Mid-Century' },
  { key: 'minimalist', label: 'Pure Lines' },
];

const DEFAULT_DIMENSIONS: RoomDimensions = {
  width: 16,
  depth: 14,
  height: 9,
  unit: 'ft',
};

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
  const viewShotRef = useRef<ViewShot>(null);

  const selectedIdRef = useRef<string | null>(null);
  const isDraggingRef = useRef(false);

  const controlRef = useRef<CameraControlState>({
    theta: 0,
    phi: 1.25,
    radius: 4.5,
  });

  const lastTouchRef = useRef<{ x: number; y: number } | null>(null);
  const lastPinchRef = useRef<number>(0);
  const touchCountRef = useRef<number>(0);

  const user = useAppStore((s) => s.user);
  const currentRoom = useAppStore((s) => s.currentRoom);

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
            1.1,
            Math.min(1.45, controlRef.current.phi + dy * 0.005),
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

  const handleDragStart = useCallback(() => updateIsDragging(true), [updateIsDragging]);
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
    setPlacedFurniture(buildDefaultFurniture(activeStyle));
    updateSelectedId(null);
    setSceneKey((prev) => prev + 1);
  }, [activeStyle, updateSelectedId]);

  const handleAIRender = async () => {
    if (!user) {
      Alert.alert('Please sign in', 'You must be signed in to render.');
      return;
    }

    let roomId = currentRoom?.id;
    if (!roomId) {
      try {
        const { data: newRoom, error } = await supabase
          .from('rooms')
          .insert({ user_id: user.id })
          .select()
          .single();
        if (error || !newRoom) {
          Alert.alert('Error', 'Could not create room.');
          return;
        }
        roomId = newRoom.id;
      } catch {
        Alert.alert('Error', 'Could not create room.');
        return;
      }
    }

    setIsRendering(true);
    try {
      const data = await callEdgeFunction<{ render_id: string; job_id: string }>(
        'render-room',
        { room_id: roomId, style: activeStyle, quality_tier: 'draft' },
      );

      const pollInterval = setInterval(async () => {
        try {
          const statusData = await callEdgeFunction<{ status: string; image_url?: string }>(
            'get-render-status',
            { render_id: data.render_id, job_id: data.job_id },
          );
          if (statusData.status === 'complete') {
            clearInterval(pollInterval);
            setIsRendering(false);
            Alert.alert('Render complete!', 'Image: ' + statusData.image_url);
          } else if (statusData.status === 'failed') {
            clearInterval(pollInterval);
            setIsRendering(false);
            Alert.alert('Render failed', 'Tokens have been refunded.');
          }
        } catch {
          clearInterval(pollInterval);
          setIsRendering(false);
          Alert.alert('Error', 'Lost connection while checking render status.');
        }
      }, 3000);
    } catch {
      setIsRendering(false);
      Alert.alert('Error', 'Could not reach the render service.');
    }
  };

  const findCatalogItem = (catalogId: string) =>
    FURNITURE_CATALOG.find((c) => c.id === catalogId);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: STYLE_COLORS[activeStyle]?.ceiling ?? '#F5F0E8' }]}
    >
      <View style={StyleSheet.absoluteFill} {...panResponder.panHandlers}>
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
                gl.setClearColor(STYLE_COLORS[activeStyle]?.ceiling ?? '#F5F0E8', 1);
                gl.shadowMap.enabled = true;
                gl.shadowMap.type = THREE.PCFSoftShadowMap;
              }}
              onPointerMissed={handlePointerMissed}
            >
              <color attach="background" args={[STYLE_COLORS[activeStyle]?.ceiling ?? '#F5F0E8']} />
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

      {selectedId && (
        <View style={styles.selectedPanel}>
          <Text style={styles.selectedPanelText}>Tap & drag to move</Text>
          <View style={styles.selectedPanelActions}>
            <TouchableOpacity
              style={styles.rotateBtn}
              onPress={() => {
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
      )}

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

      {isRendering && (
        <View style={styles.renderingOverlay}>
          <ActivityIndicator size="large" color="#C47B3C" />
          <Text style={styles.renderingText}>Generating your design...</Text>
          <Text style={styles.renderingStyle}>
            {STYLES.find((s) => s.key === activeStyle)?.label ?? activeStyle}
          </Text>
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
});

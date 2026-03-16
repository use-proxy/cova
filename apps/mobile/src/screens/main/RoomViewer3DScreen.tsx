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
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../../App';
import { BoxRoom } from '../../components/3d/BoxRoom';
import { SceneLighting } from '../../components/3d/SceneLighting';
import { FurniturePiece } from '../../components/3d/FurniturePiece';
import { CameraController } from '../../components/3d/CameraController';
import type { CameraControlState } from '../../components/3d/CameraController';
import type { CavaStyle, RoomDimensions, PlacedFurniture } from '@cova/shared';
import { FURNITURE_CATALOG, STYLE_DEFAULT_FURNITURE, STYLE_COLORS } from '../../data/furnitureCatalog';
import { useAppStore } from '../../store';
import { supabase } from '@cova/shared';

type Props = NativeStackScreenProps<RootStackParamList, 'RoomViewer3D'>;

const STYLES: { key: CavaStyle; label: string; emoji: string }[] = [
  { key: 'japandi', label: 'Japandi', emoji: '🌿' },
  { key: 'midcentury', label: 'Mid-Century', emoji: '🪑' },
  { key: 'coastal', label: 'Coastal', emoji: '🌊' },
  { key: 'industrial', label: 'Industrial', emoji: '⚙️' },
  { key: 'bohemian', label: 'Bohemian', emoji: '🪬' },
];

const DEFAULT_DIMENSIONS: RoomDimensions = {
  width_ft: 16,
  depth_ft: 14,
  height_ft: 9,
};

const SUPABASE_FUNCTIONS_URL = 'https://xdeacbmkdwqrwxonqaqh.supabase.co/functions/v1';

function buildDefaultFurniture(style: CavaStyle): PlacedFurniture[] {
  const keys = STYLE_DEFAULT_FURNITURE[style] ?? [];
  return keys
    .map((key, index) => {
      const cat = FURNITURE_CATALOG[key];
      if (!cat) {
        console.warn('Missing catalog entry for key:', key);
        return null;
      }
      return {
        id: `${style}_${key}_${index}`,
        model_key: key,
        position: cat.default_position as [number, number, number],
        rotation_y: cat.default_rotation_y ?? 0,
        style: style,
      } satisfies PlacedFurniture;
    })
    .filter((item): item is PlacedFurniture => item !== null);
}

class ThreeDErrorBoundary extends React.Component<
  { children: React.ReactNode; onError: () => void },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
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

export function RoomViewer3DScreen({ navigation }: Props) {
  const [activeStyle, setActiveStyle] = useState<CavaStyle>('japandi');
  const [sceneKey, setSceneKey] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const [isRendering, setIsRendering] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [placedFurniture, setPlacedFurniture] = useState<PlacedFurniture[]>(
    () => buildDefaultFurniture('japandi'),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const viewShotRef = useRef<ViewShot>(null);

  const selectedIdRef = useRef<string | null>(null);
  const isDraggingRef = useRef(false);

  const updateSelectedId = useCallback((id: string | null) => {
    selectedIdRef.current = id;
    setSelectedId(id);
    setEditMode(id !== null);
    isDraggingRef.current = false;
    setIsDragging(false);
  }, []);

  const updateIsDragging = useCallback((val: boolean) => {
    isDraggingRef.current = val;
    setIsDragging(val);
  }, []);

  const controlRef = useRef<CameraControlState>({
    theta: 0,
    phi: 1.25,
    radius: 4.5,
  });

  const lastTouchRef = useRef<{ x: number; y: number } | null>(null);
  const lastPinchRef = useRef<number>(0);
  const touchCountRef = useRef<number>(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => {
        return selectedIdRef.current === null;
      },
      onMoveShouldSetPanResponder: () => {
        return selectedIdRef.current === null;
      },
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
          lastTouchRef.current = {
            x: touches[0].pageX,
            y: touches[0].pageY,
          };
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
          lastTouchRef.current = {
            x: touches[0].pageX,
            y: touches[0].pageY,
          };
          controlRef.current.theta -= dx * 0.007;
          controlRef.current.phi = Math.max(
            1.1,
            Math.min(1.45, controlRef.current.phi + dy * 0.005),
          );
        } else if (touches.length === 1) {
          lastTouchRef.current = {
            x: touches[0].pageX,
            y: touches[0].pageY,
          };
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

  const { tokenBalance, spendTokens, user, currentRoom } = useAppStore();

  const handleSelectId = useCallback((id: string) => {
    updateSelectedId(id);
  }, [updateSelectedId]);

  const handleDragStart = useCallback(() => {
    updateIsDragging(true);
  }, [updateIsDragging]);

  const handleDragStop = useCallback(() => {
    updateIsDragging(false);
  }, [updateIsDragging]);

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
      const uri = await captureRef(viewShotRef, {
        format: 'jpg',
        quality: 0.9,
      });
      await MediaLibrary.saveToLibraryAsync(uri);
      Alert.alert('Saved', 'Screenshot saved to your camera roll');
    } catch (e) {
      console.warn('Save error:', e);
      Alert.alert('Error', 'Could not save screenshot');
    }
  };

  const handleStyleChange = useCallback((newStyle: CavaStyle) => {
    setActiveStyle(newStyle);
    setPlacedFurniture(buildDefaultFurniture(newStyle));
    updateSelectedId(null);
    setSceneKey(prev => prev + 1);
  }, [updateSelectedId]);

  const handleError = useCallback(() => {
    setErrorCount(prev => prev + 1);
    if (errorCount < 3) {
      setSceneKey(prev => prev + 1);
    }
  }, [errorCount]);

  const updateFurniturePosition = useCallback(
    (id: string, newPosition: [number, number, number]) => {
      setPlacedFurniture(prev =>
        prev.map(item =>
          item.id === id ? { ...item, position: newPosition } : item,
        ),
      );
    },
    [],
  );

  const handleReset = useCallback(() => {
    setPlacedFurniture(buildDefaultFurniture(activeStyle));
    updateSelectedId(null);
    setSceneKey(prev => prev + 1);
  }, [activeStyle, updateSelectedId]);

  const handleAIRender = async () => {
    const tokenCost = 2;

    if (tokenBalance < tokenCost) {
      Alert.alert(
        'Not enough tokens',
        `This render costs ${tokenCost} tokens. You have ${tokenBalance}.`,
      );
      return;
    }

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
      } catch (e) {
        Alert.alert('Error', 'Could not create room.');
        return;
      }
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      Alert.alert('Session expired', 'Please sign in again.');
      return;
    }

    setIsRendering(true);

    try {
      const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/render-room`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          room_id: roomId,
          style: activeStyle,
          quality_tier: 'draft',
        }),
      });

      const data = await response.json();

      if (response.ok) {
        spendTokens(tokenCost);

        const pollInterval = setInterval(async () => {
          try {
            const statusResp = await fetch(
              `${SUPABASE_FUNCTIONS_URL}/get-render-status` +
              `?render_id=${data.render_id}&job_id=${data.job_id}`,
              { headers: { 'Authorization': `Bearer ${session.access_token}` } },
            );
            const statusData = await statusResp.json();

            if (statusData.status === 'complete') {
              clearInterval(pollInterval);
              setIsRendering(false);
              Alert.alert('Render complete!', 'Image: ' + statusData.image_url);
            } else if (statusData.status === 'failed') {
              clearInterval(pollInterval);
              setIsRendering(false);
              Alert.alert('Render failed', 'Tokens have been refunded.');
            }
          } catch (pollError) {
            clearInterval(pollInterval);
            setIsRendering(false);
            Alert.alert('Error', 'Lost connection while checking render status.');
          }
        }, 3000);
      } else {
        setIsRendering(false);
        if (data.error === 'insufficient_tokens') {
          Alert.alert(
            'Not enough tokens',
            `Need ${data.required}, you have ${data.available}.`,
          );
        } else {
          Alert.alert('Render failed', data.error || 'Something went wrong.');
        }
      }
    } catch (err) {
      setIsRendering(false);
      Alert.alert('Error', 'Could not reach the render service.');
    }
  };

  console.log('Rendering furniture count:', placedFurniture.length, 'for style:', activeStyle);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: STYLE_COLORS[activeStyle]?.ceiling ?? '#F5F0E8' }]}>
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
              }}
              camera={{ position: [0, 1.6, 4.5], fov: 72, near: 0.05, far: 25 }}
              shadows
              onCreated={({ gl }) => {
                gl.setClearColor(STYLE_COLORS[activeStyle]?.ceiling ?? '#F5F0E8', 1);
                gl.shadowMap.enabled = true;
                gl.shadowMap.type = THREE.PCFSoftShadowMap;
              }}
              onPointerMissed={handlePointerMissed}
            >
              <CameraController controlRef={controlRef} />
              <Suspense fallback={null}>
                <SceneLighting style={activeStyle} />
                <BoxRoom style={activeStyle} dimensions={DEFAULT_DIMENSIONS} />
                {placedFurniture.map(item => {
                  const catalog = FURNITURE_CATALOG[item.model_key];
                  if (!catalog) {
                    console.warn('No catalog item for:', item.model_key);
                    return null;
                  }
                  return (
                    <FurniturePiece
                      key={item.id}
                      piece={item}
                      catalog={catalog}
                      isSelected={selectedId === item.id}
                      editMode={editMode}
                      onSelect={handleSelectId}
                      onDragEnd={updateFurniturePosition}
                      onDragStart={handleDragStart}
                      onDragStop={handleDragStop}
                    />
                  );
                })}
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
              <Text style={styles.chipEmoji}>{s.emoji}</Text>
              <Text style={[styles.chipLabel, activeStyle === s.key && styles.chipLabelActive]}>
                {s.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {selectedId && (
        <View style={styles.selectedPanel}>
          <Text style={styles.selectedPanelText}>
            Tap & drag to move
          </Text>
          <View style={styles.selectedPanelActions}>
            <TouchableOpacity
              style={styles.doneBtn}
              onPress={() => updateSelectedId(null)}
            >
              <Text style={styles.doneBtnText}>Done</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.rotateBtn}
              onPress={() => {
                setPlacedFurniture(prev => prev.map(item =>
                  item.id === selectedId
                    ? { ...item, rotation_y: item.rotation_y - Math.PI / 4 }
                    : item,
                ));
              }}
            >
              <Text style={styles.rotateBtnText}>↺</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.rotateBtn}
              onPress={() => {
                setPlacedFurniture(prev => prev.map(item =>
                  item.id === selectedId
                    ? { ...item, rotation_y: item.rotation_y + Math.PI / 4 }
                    : item,
                ));
              }}
            >
              <Text style={styles.rotateBtnText}>↻</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.removeBtn}
              onPress={() => {
                setPlacedFurniture(prev => prev.filter(i => i.id !== selectedId));
                updateSelectedId(null);
              }}
            >
              <Text style={styles.removeBtnText}>Remove</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={styles.actionBar} pointerEvents="box-none">
        <TouchableOpacity style={styles.btnPrimary} onPress={handleSave}>
          <Text style={styles.btnPrimaryText}>📷 Save</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnGhost} onPress={handleReset}>
          <Text style={styles.btnGhostText}>↺ Reset</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btnGhost, isRendering && styles.btnDisabled]}
          onPress={handleAIRender}
          disabled={isRendering}
        >
          <Text style={styles.btnGhostText}>✦ AI Render</Text>
        </TouchableOpacity>
      </View>

      {isRendering && (
        <View style={styles.renderingOverlay}>
          <ActivityIndicator size="large" color="#C9A84C" />
          <Text style={styles.renderingText}>Generating your design...</Text>
          <Text style={styles.renderingStyle}>
            {activeStyle.charAt(0).toUpperCase() + activeStyle.slice(1)} Style
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
    backgroundColor: 'rgba(11,23,41,0.45)',
    zIndex: 10,
  },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: '#2A3F5F', marginRight: 8, backgroundColor: '#0D1F35' },
  chipActive: { borderColor: '#C9A84C', backgroundColor: 'rgba(201,168,76,0.15)' },
  chipEmoji: { fontSize: 14, marginRight: 5 },
  chipLabel: { fontSize: 13, color: '#8A9BB5', fontWeight: '500' },
  chipLabelActive: { color: '#C9A84C' },
  actionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    padding: 12,
    paddingBottom: 28,
    gap: 10,
    backgroundColor: 'rgba(11,23,41,0.55)',
    zIndex: 10,
  },
  btnPrimary: { flex: 1, backgroundColor: '#C9A84C', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  btnPrimaryText: { color: '#0B1729', fontWeight: '700', fontSize: 15 },
  btnGhost: { flex: 1, borderRadius: 10, paddingVertical: 14, alignItems: 'center', borderWidth: 1.5, borderColor: '#2A3F5F' },
  btnGhostText: { color: '#FAF7F2', fontWeight: '600', fontSize: 15 },
  btnDisabled: { opacity: 0.5 },
  selectedPanel: {
    position: 'absolute',
    bottom: 90,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(11,23,41,0.88)',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  selectedPanelText: {
    color: '#FAF7F2',
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
    backgroundColor: 'rgba(201,168,76,0.2)',
    borderWidth: 1.5,
    borderColor: '#C9A84C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rotateBtnText: {
    color: '#C9A84C',
    fontSize: 18,
    fontWeight: '600',
  },
  doneBtn: {
    backgroundColor: 'rgba(201,168,76,0.15)',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1.5,
    borderColor: '#C9A84C',
  },
  doneBtnText: {
    color: '#C9A84C',
    fontSize: 13,
    fontWeight: '600',
  },
  removeBtn: {
    backgroundColor: 'rgba(255,80,80,0.25)',
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
  errorFallback: { flex: 1, backgroundColor: '#0B1729', justifyContent: 'center', alignItems: 'center' },
  errorText: { color: '#C9A84C', fontSize: 16 },
  renderingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(11,23,41,0.80)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  renderingText: {
    color: '#FAF7F2',
    fontSize: 16,
    marginTop: 16,
    fontWeight: '500',
  },
  renderingStyle: {
    color: '#C9A84C',
    fontSize: 14,
    marginTop: 6,
  },
});

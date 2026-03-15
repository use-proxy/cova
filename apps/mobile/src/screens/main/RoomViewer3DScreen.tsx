import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Canvas } from '@react-three/fiber/native';
import { OrbitControls } from '@react-three/drei/native';
import ViewShot from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import { useRoute, RouteProp } from '@react-navigation/native';
import { supabase } from '@cova/shared';
import type { CavaStyle, PlacedFurniture, RoomDimensions } from '@cova/shared';
import { BoxRoom } from '../../components/3d/BoxRoom';
import { FurniturePiece } from '../../components/3d/FurniturePiece';
import { SceneLighting } from '../../components/3d/SceneLighting';
import {
  FURNITURE_CATALOG,
  STYLE_DEFAULT_FURNITURE,
} from '../../data/furnitureCatalog';
import { useAppStore } from '../../store';

type RouteParams = { room_id: string; image_url: string };

const STYLES: { key: CavaStyle; label: string; emoji: string }[] = [
  { key: 'japandi', label: 'Japandi', emoji: '🌿' },
  { key: 'midcentury', label: 'Mid-Century', emoji: '🪑' },
  { key: 'coastal', label: 'Coastal', emoji: '🌊' },
  { key: 'industrial', label: 'Industrial', emoji: '⚙️' },
  { key: 'bohemian', label: 'Bohemian', emoji: '🪬' },
];

function buildDefaultFurniture(style: CavaStyle): PlacedFurniture[] {
  return STYLE_DEFAULT_FURNITURE[style].map((key) => {
    const cat = FURNITURE_CATALOG[key];
    return {
      id: `${style}_${key}`,
      model_key: key,
      position: cat.default_position,
      rotation_y: cat.default_rotation_y,
      style,
    };
  });
}

export function RoomViewer3DScreen() {
  const route = useRoute<RouteProp<{ params: RouteParams }, 'params'>>();
  const { room_id, image_url } = route.params ?? {};
  const { user } = useAppStore();

  const [style, setStyle] = useState<CavaStyle>('japandi');
  const [furniture, setFurniture] = useState<PlacedFurniture[]>(() =>
    buildDefaultFurniture('japandi')
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<RoomDimensions>({
    width_ft: 14,
    depth_ft: 12,
    height_ft: 9,
  });
  const [loading, setLoading] = useState(!!room_id);
  const [saving, setSaving] = useState(false);
  const viewShotRef = useRef<ViewShot>(null);

  useEffect(() => {
    if (!room_id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('rooms')
        .select('room_dimensions')
        .eq('id', room_id)
        .single();
      if (!cancelled && !error && data?.room_dimensions) {
        setDimensions(data.room_dimensions as RoomDimensions);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [room_id]);

  const switchStyle = useCallback((newStyle: CavaStyle) => {
    setStyle(newStyle);
    setFurniture(buildDefaultFurniture(newStyle));
    setSelectedId(null);
  }, []);

  const handleDragEnd = useCallback((id: string, newPos: [number, number, number]) => {
    setFurniture((prev) =>
      prev.map((p) => (p.id === id ? { ...p, position: newPos } : p))
    );
  }, []);

  const handleCapture = async () => {
    try {
      setSaving(true);
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow access to save photos.');
        return;
      }
      const uri = await new Promise<string>((resolve, reject) => {
        setTimeout(async () => {
          try {
            const u = await (viewShotRef.current as any)?.capture?.();
            resolve(u ?? '');
          } catch (e) {
            reject(e);
          }
        }, 100);
      });
      if (uri) {
        await MediaLibrary.saveToLibraryAsync(uri);
        Alert.alert('Saved!', 'Your 3D room design has been saved to your photo library.');
      }
    } catch (e: any) {
      Alert.alert('Error saving', e?.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const selectedFurnitureItem = furniture.find((f) => f.id === selectedId);
  const selectedCatalogItem = selectedFurnitureItem
    ? FURNITURE_CATALOG[selectedFurnitureItem.model_key]
    : null;

  if (loading) {
    return (
      <View style={[s.container, s.centered]}>
        <ActivityIndicator size="large" color="#C9A84C" />
        <Text style={s.loadingText}>Loading room...</Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.styleBar}
        contentContainerStyle={s.styleBarContent}
      >
        {STYLES.map((st) => (
          <TouchableOpacity
            key={st.key}
            style={[s.styleChip, style === st.key && s.styleChipActive]}
            onPress={() => switchStyle(st.key)}
          >
            <Text style={s.styleEmoji}>{st.emoji}</Text>
            <Text style={[s.styleLabel, style === st.key && s.styleLabelActive]}>
              {st.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ViewShot
        ref={viewShotRef}
        style={s.canvasContainer}
        options={{ format: 'jpg', quality: 0.95 }}
      >
        <Canvas
          style={s.canvas}
          camera={{ position: [0, 2.5, 5], fov: 55, near: 0.1, far: 50 }}
          shadows
          onCreated={({ gl }) => {
            gl.shadowMap.enabled = true;
            gl.shadowMap.type = 2; // PCFSoftShadowMap
          }}
        >
          <React.Suspense fallback={null}>
            <SceneLighting style={style} />
            <BoxRoom style={style} dimensions={dimensions} />
            {furniture.map((piece) => {
              const cat = FURNITURE_CATALOG[piece.model_key];
              if (!cat) return null;
              return (
                <FurniturePiece
                  key={piece.id}
                  piece={piece}
                  catalog={cat}
                  isSelected={selectedId === piece.id}
                  onSelect={setSelectedId}
                  onDragEnd={handleDragEnd}
                />
              );
            })}
            <OrbitControls
              enablePan={false}
              minDistance={1.5}
              maxDistance={8}
              maxPolarAngle={Math.PI / 2.1}
              target={[0, 1, 0]}
            />
          </React.Suspense>
        </Canvas>
      </ViewShot>

      {selectedCatalogItem && (
        <View style={s.selectedPanel}>
          <Text style={s.selectedName}>{selectedCatalogItem.name}</Text>
          <Text style={s.selectedHint}>
            Drag to move · Tap elsewhere to deselect
          </Text>
          <TouchableOpacity
            style={s.removeBtn}
            onPress={() => {
              setFurniture((prev) => prev.filter((p) => p.id !== selectedId));
              setSelectedId(null);
            }}
          >
            <Text style={s.removeBtnText}>Remove</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={s.actionBar}>
        <TouchableOpacity
          style={s.actionBtn}
          onPress={handleCapture}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#0B1729" size="small" />
          ) : (
            <Text style={s.actionBtnText}>📷 Save</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.actionBtn, s.actionBtnSecondary]}
          onPress={() => setSelectedId(null)}
        >
          <Text style={[s.actionBtnText, s.actionBtnTextSec]}>↩ Reset</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.actionBtn, s.actionBtnSecondary]}
          onPress={() => {}}
        >
          <Text style={[s.actionBtnText, s.actionBtnTextSec]}>✦ AI Render</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B1729' },
  centered: { justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#FAF7F2', marginTop: 12 },
  styleBar: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: 'rgba(201,168,76,0.2)' },
  styleBarContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 8, flexDirection: 'row' },
  styleChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.15)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  styleChipActive: {
    backgroundColor: 'rgba(201,168,76,0.15)',
    borderColor: '#C9A84C',
  },
  styleEmoji: { fontSize: 16 },
  styleLabel: { color: '#8A8070', fontSize: 13, fontWeight: '600' },
  styleLabelActive: { color: '#C9A84C' },
  canvasContainer: { flex: 1 },
  canvas: { flex: 1 },
  selectedPanel: {
    position: 'absolute',
    bottom: 80,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(11,23,41,0.9)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.3)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectedName: { color: '#FAF7F2', fontWeight: '700', flex: 1 },
  selectedHint: { color: '#8A8070', fontSize: 11, flex: 1 },
  removeBtn: {
    backgroundColor: 'rgba(139,32,32,0.3)',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  removeBtnText: { color: '#FF6B6B', fontSize: 12, fontWeight: '700' },
  actionBar: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(201,168,76,0.2)',
  },
  actionBtn: {
    flex: 1,
    backgroundColor: '#C9A84C',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  actionBtnSecondary: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  actionBtnText: { color: '#0B1729', fontWeight: '700', fontSize: 14 },
  actionBtnTextSec: { color: '#FAF7F2' },
});

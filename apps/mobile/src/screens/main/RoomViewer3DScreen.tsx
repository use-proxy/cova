import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import ViewShot, { captureRef } from 'react-native-view-shot';
import { Canvas } from '@react-three/fiber/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../../App';
import { BoxRoom } from '../../components/3d/BoxRoom';
import { SceneLighting } from '../../components/3d/SceneLighting';
import type { CavaStyle, RoomDimensions } from '@cova/shared';
import { STYLE_DEFAULT_FURNITURE, FURNITURE_CATALOG } from '../../data/furnitureCatalog';

type Props = NativeStackScreenProps<RootStackParamList, 'RoomViewer3D'>;

const STYLES: { key: CavaStyle; label: string; emoji: string }[] = [
  { key: 'japandi', label: 'Japandi', emoji: '🌿' },
  { key: 'midcentury', label: 'Mid-Century', emoji: '🪑' },
  { key: 'coastal', label: 'Coastal', emoji: '🌊' },
  { key: 'industrial', label: 'Industrial', emoji: '⚙️' },
  { key: 'bohemian', label: 'Bohemian', emoji: '🪬' },
];

const DEFAULT_DIMENSIONS: RoomDimensions = {
  width_ft: 14,
  depth_ft: 12,
  height_ft: 9,
};

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
  const viewShotRef = useRef<ViewShot>(null);

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
    setSceneKey(prev => prev + 1);
  }, []);

  const handleError = useCallback(() => {
    setErrorCount(prev => prev + 1);
    if (errorCount < 3) {
      setSceneKey(prev => prev + 1);
    }
  }, [errorCount]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.styleBar}>
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
            camera={{ position: [0, 2.5, 5], fov: 55, near: 0.1, far: 50 }}
            shadows={false}
            onCreated={({ gl }) => {
              gl.setClearColor('#1a2a3a', 1);
            }}
          >
            <SceneLighting style={activeStyle} />
            <BoxRoom
              style={activeStyle}
              dimensions={DEFAULT_DIMENSIONS}
            />
          </Canvas>
        </ThreeDErrorBoundary>
      </ViewShot>

      <View style={styles.actionBar}>
        <TouchableOpacity style={styles.btnPrimary} onPress={handleSave}>
          <Text style={styles.btnPrimaryText}>📷 Save</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnGhost} onPress={() => setSceneKey(prev => prev + 1)}>
          <Text style={styles.btnGhostText}>↺ Reset</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnGhost} onPress={() => Alert.alert('AI Render', 'Coming soon')}>
          <Text style={styles.btnGhostText}>✦ AI Render</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B1729' },
  styleBar: { paddingVertical: 10, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: '#1E3050' },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: '#2A3F5F', marginRight: 8, backgroundColor: '#0D1F35' },
  chipActive: { borderColor: '#C9A84C', backgroundColor: 'rgba(201,168,76,0.15)' },
  chipEmoji: { fontSize: 14, marginRight: 5 },
  chipLabel: { fontSize: 13, color: '#8A9BB5', fontWeight: '500' },
  chipLabelActive: { color: '#C9A84C' },
  canvasContainer: { flex: 1 },
  canvas: { flex: 1 },
  errorFallback: { flex: 1, backgroundColor: '#0B1729', justifyContent: 'center', alignItems: 'center' },
  errorText: { color: '#C9A84C', fontSize: 16 },
  actionBar: { flexDirection: 'row', padding: 12, gap: 10, borderTopWidth: 1, borderTopColor: '#1E3050' },
  btnPrimary: { flex: 1, backgroundColor: '#C9A84C', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  btnPrimaryText: { color: '#0B1729', fontWeight: '700', fontSize: 15 },
  btnGhost: { flex: 1, borderRadius: 10, paddingVertical: 14, alignItems: 'center', borderWidth: 1.5, borderColor: '#2A3F5F' },
  btnGhostText: { color: '#FAF7F2', fontWeight: '600', fontSize: 15 },
});

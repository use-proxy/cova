import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Image,
  Animated,
  Easing,
  Alert,
  ActivityIndicator,
  PanResponder,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import Slider from '@react-native-community/slider';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RoomStackParamList } from '../../navigation/RoomNavigator';
import { useRender } from '../../hooks/useRender';
import { useRoomPlan } from '../../hooks/useRoomPlan';
import { useAppStore } from '../../store';
import { SafeAreaView } from 'react-native-safe-area-context';

type CaptureStep = 'method-select' | 'camera' | 'calibration' | 'processing';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function RoomCaptureScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RoomStackParamList>>();
  const { startRender } = useRender();
  const { startScan, stopScan, isAvailable: isRoomPlanAvailable } = useRoomPlan();

  const [step, setStep] = useState<CaptureStep>('method-select');
  const [capturedImageUri, setCapturedImageUri] = useState<string | null>(null);
  const [cameraPermission, requestPermission] = useCameraPermissions();
  const [dimensions, setDimensions] = useState({ width: 16, depth: 14, height: 9 });
  const [processingStage, setProcessingStage] = useState('');
  const [scanning, setScanning] = useState(false);
  const [corners, setCorners] = useState({
    tl: { x: 0.1, y: 0.1 },
    tr: { x: 0.9, y: 0.1 },
    bl: { x: 0.1, y: 0.9 },
    br: { x: 0.9, y: 0.9 },
  });
  const imageLayoutRef = useRef({ width: SCREEN_WIDTH, height: SCREEN_WIDTH * 1.3 });

  const cameraRef = useRef<CameraView>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const makeCornerResponder = (key: 'tl' | 'tr' | 'bl' | 'br') =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_: GestureResponderEvent, gs: PanResponderGestureState) => {
        const { width: imgW, height: imgH } = imageLayoutRef.current;
        setCorners((prev) => {
          const nx = Math.max(0, Math.min(1, prev[key].x + gs.dx / imgW));
          const ny = Math.max(0, Math.min(1, prev[key].y + gs.dy / imgH));
          return { ...prev, [key]: { x: nx, y: ny } };
        });
      },
      onPanResponderRelease: () => {},
    });

  const cornerResponders = useMemo(
    () => ({
      tl: makeCornerResponder('tl'),
      tr: makeCornerResponder('tr'),
      bl: makeCornerResponder('bl'),
      br: makeCornerResponder('br'),
    }),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    if (step === 'processing') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.2, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      ).start();
      handleProcessCapture();
    }
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTakePhoto = async () => {
    if (!cameraPermission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Camera Permission', 'Camera access is required to take a photo of your room.');
        return;
      }
    }
    setStep('camera');
  };

  const handleUploadPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      base64: false,
    });
    if (!result.canceled && result.assets[0]) {
      setCapturedImageUri(result.assets[0].uri);
      setStep('calibration');
    }
  };

  const handleCapture = async () => {
    if (!cameraRef.current) return;
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.9 });
    if (photo) {
      setCapturedImageUri(photo.uri);
      setStep('calibration');
    }
  };

  const handleRoomPlanScan = async () => {
    try {
      setScanning(true);
      setProcessingStage('Scanning your room...');
      const data = await startScan();
      setScanning(false);
      setDimensions({
        width: Math.round(data.width_ft),
        depth: Math.round(data.depth_ft),
        height: Math.round(data.height_ft),
      });
      setCapturedImageUri(null);
      setStep('processing');
    } catch (e: any) {
      setScanning(false);
      if (e.message !== 'Scan cancelled') {
        Alert.alert('Scan Failed', e.message ?? 'Could not complete the room scan.');
      }
    }
  };

  const handleProcessCapture = async () => {
    try {
      if (!capturedImageUri) {
        setProcessingStage('Setting up your room...');
        navigation.navigate('RenderView', {});
        return;
      }

      useAppStore.getState().setCapturedImageUri(capturedImageUri);

      setProcessingStage('Reading your room...');
      const base64 = await FileSystem.readAsStringAsync(capturedImageUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const imageBase64 = `data:image/jpeg;base64,${base64}`;
      setProcessingStage('Starting your design...');
      const room = useAppStore.getState().currentRoom;
      const blend = room?.style_blend ?? { coastal: 0.2, japandi: 0.2, bohemian: 0.2, mid_century: 0.2, minimalist: 0.2 };
      const roomType = room?.room_type ?? 'living_room';
      const roomId = room?.id ?? 'default-room';
      await startRender({
        roomId,
        roomType,
        styleBlend: blend,
        imageBase64,
        renderType: 'draft',
      });
      navigation.navigate('RenderView', {});
    } catch {
      setProcessingStage('Something went wrong. Please try again.');
    }
  };

  if (step === 'camera') {
    return (
      <View style={styles.fullScreen}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
        <SafeAreaView style={styles.cameraOverlay}>
          <TouchableOpacity style={styles.backButton} onPress={() => setStep('method-select')}>
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
        </SafeAreaView>
        <View style={styles.captureRow}>
          <TouchableOpacity style={styles.captureButton} onPress={handleCapture}>
            <View style={styles.captureButtonInner} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (step === 'calibration') {
    const imgW = imageLayoutRef.current.width;
    const imgH = imageLayoutRef.current.height;
    const cornerKeys = ['tl', 'tr', 'bl', 'br'] as const;

    return (
      <View style={styles.fullScreen}>
        <View
          style={styles.calibrationImageWrap}
          onLayout={(e) => {
            imageLayoutRef.current = { width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height };
          }}
        >
          <Image source={{ uri: capturedImageUri! }} style={StyleSheet.absoluteFill} resizeMode="cover" />

          {/* Connecting lines between corners */}
          {([['tl', 'tr'], ['tr', 'br'], ['br', 'bl'], ['bl', 'tl']] as const).map(([from, to]) => {
            const x1 = corners[from].x * imgW;
            const y1 = corners[from].y * imgH;
            const x2 = corners[to].x * imgW;
            const y2 = corners[to].y * imgH;
            const dx = x2 - x1;
            const dy = y2 - y1;
            const len = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx);
            return (
              <View
                key={`${from}-${to}`}
                style={{
                  position: 'absolute',
                  left: x1,
                  top: y1 - 1,
                  width: len,
                  height: 2,
                  backgroundColor: '#C47B3C',
                  transformOrigin: 'left center',
                  transform: [{ rotate: `${angle}rad` }],
                }}
                pointerEvents="none"
              />
            );
          })}

          {/* Corner handles */}
          {cornerKeys.map((key) => (
            <View
              key={key}
              style={[
                styles.cornerHandle,
                { left: corners[key].x * imgW - 14, top: corners[key].y * imgH - 14 },
              ]}
              {...cornerResponders[key].panHandlers}
            />
          ))}
        </View>

        <SafeAreaView style={styles.calibrationOverlay}>
          <TouchableOpacity style={styles.backButton} onPress={() => setStep('method-select')}>
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
        </SafeAreaView>
        <View style={styles.sliderPanel}>
          <Text style={styles.sliderTitle}>Room Dimensions</Text>

          <View style={styles.sliderRow}>
            <Text style={styles.sliderLabel}>Width</Text>
            <Slider
              style={styles.slider}
              minimumValue={5}
              maximumValue={30}
              step={1}
              value={dimensions.width}
              onValueChange={(v) => setDimensions((d) => ({ ...d, width: v }))}
              minimumTrackTintColor="#C47B3C"
              maximumTrackTintColor="rgba(255,255,255,0.3)"
              thumbTintColor="#C47B3C"
            />
            <Text style={styles.sliderValue}>{dimensions.width} ft</Text>
          </View>

          <View style={styles.sliderRow}>
            <Text style={styles.sliderLabel}>Depth</Text>
            <Slider
              style={styles.slider}
              minimumValue={5}
              maximumValue={30}
              step={1}
              value={dimensions.depth}
              onValueChange={(v) => setDimensions((d) => ({ ...d, depth: v }))}
              minimumTrackTintColor="#C47B3C"
              maximumTrackTintColor="rgba(255,255,255,0.3)"
              thumbTintColor="#C47B3C"
            />
            <Text style={styles.sliderValue}>{dimensions.depth} ft</Text>
          </View>

          <View style={styles.sliderRow}>
            <Text style={styles.sliderLabel}>Height</Text>
            <Slider
              style={styles.slider}
              minimumValue={6}
              maximumValue={16}
              step={1}
              value={dimensions.height}
              onValueChange={(v) => setDimensions((d) => ({ ...d, height: v }))}
              minimumTrackTintColor="#C47B3C"
              maximumTrackTintColor="rgba(255,255,255,0.3)"
              thumbTintColor="#C47B3C"
            />
            <Text style={styles.sliderValue}>{dimensions.height} ft</Text>
          </View>

          <TouchableOpacity style={styles.continueButton} onPress={() => setStep('processing')}>
            <Text style={styles.continueButtonText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (step === 'processing') {
    return (
      <View style={[styles.fullScreen, styles.processingContainer]}>
        <Animated.View style={[styles.pulseCircle, { transform: [{ scale: pulseAnim }] }]} />
        <Text style={styles.processingText}>{processingStage}</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.methodContainer}>
      <View style={styles.methodHeader}>
        <Text style={styles.methodTitle}>Capture Your Room</Text>
        <Text style={styles.methodSubtext}>Choose how to bring your room into Cova</Text>
      </View>

      <View style={styles.methodCards}>
        {isRoomPlanAvailable && (
          <TouchableOpacity
            style={[styles.methodCard, styles.methodCardPrimary]}
            onPress={handleRoomPlanScan}
            disabled={scanning}
          >
            <Text style={styles.methodCardIcon}>📐</Text>
            <Text style={styles.methodCardTitle}>Scan Room (Best Quality)</Text>
            <Text style={styles.methodCardDesc}>iPhone 12 Pro and later</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.methodCard} onPress={handleTakePhoto}>
          <Text style={styles.methodCardIcon}>📷</Text>
          <Text style={styles.methodCardTitle}>Take Photo</Text>
          <Text style={styles.methodCardDesc}>Use your camera to capture the room</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.methodCard} onPress={handleUploadPhoto}>
          <Text style={styles.methodCardIcon}>🖼</Text>
          <Text style={styles.methodCardTitle}>Upload Photo</Text>
          <Text style={styles.methodCardDesc}>Choose an existing photo from your library</Text>
        </TouchableOpacity>
      </View>

      {/* Scanning overlay */}
      {scanning && (
        <View style={styles.scanningOverlay}>
          <ActivityIndicator size="large" color="#C47B3C" />
          <Text style={styles.scanningText}>Scanning your room...</Text>
          <TouchableOpacity style={styles.scanCancelBtn} onPress={() => { stopScan(); setScanning(false); }}>
            <Text style={styles.scanCancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fullScreen: {
    flex: 1,
    backgroundColor: '#000',
  },
  methodContainer: {
    flex: 1,
    backgroundColor: '#1B3A2D',
  },
  methodHeader: {
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 32,
  },
  methodTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: 'white',
    marginBottom: 8,
  },
  methodSubtext: {
    fontSize: 16,
    color: '#F5F0E8',
    opacity: 0.8,
  },
  methodCards: {
    paddingHorizontal: 24,
    gap: 16,
  },
  methodCard: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  methodCardPrimary: {
    borderColor: '#C47B3C',
    borderWidth: 2,
    backgroundColor: 'rgba(196,123,60,0.12)',
  },
  methodCardIcon: {
    fontSize: 32,
    marginBottom: 12,
  },
  methodCardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: 'white',
    marginBottom: 6,
  },
  methodCardDesc: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
  },
  cameraOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 16,
    marginTop: 8,
  },
  backButtonText: {
    color: 'white',
    fontSize: 24,
    fontWeight: '600',
  },
  captureRow: {
    position: 'absolute',
    bottom: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  captureButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(196,123,60,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#C47B3C',
  },
  captureButtonInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#C47B3C',
  },
  calibrationImageWrap: {
    flex: 1,
  },
  cornerHandle: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#C47B3C',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    zIndex: 15,
  },
  calibrationOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  sliderPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(27,58,45,0.95)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
  },
  sliderTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: 'white',
    marginBottom: 16,
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sliderLabel: {
    width: 50,
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '600',
  },
  slider: {
    flex: 1,
    height: 40,
    marginHorizontal: 8,
  },
  sliderValue: {
    width: 50,
    fontSize: 14,
    color: '#C47B3C',
    fontWeight: '700',
    textAlign: 'right',
  },
  continueButton: {
    backgroundColor: '#C47B3C',
    borderRadius: 28,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
    width: SCREEN_WIDTH - 48,
  },
  continueButtonText: {
    color: 'white',
    fontSize: 17,
    fontWeight: '700',
  },
  processingContainer: {
    backgroundColor: '#1B3A2D',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pulseCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(196,123,60,0.25)',
    borderWidth: 2,
    borderColor: '#C47B3C',
    marginBottom: 32,
  },
  processingText: {
    fontSize: 18,
    color: '#F5F0E8',
    fontWeight: '600',
    textAlign: 'center',
  },
  scanningOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
  },
  scanningText: {
    fontSize: 18,
    color: '#F5F0E8',
    fontWeight: '600',
  },
  scanCancelBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 28,
    paddingHorizontal: 28,
    paddingVertical: 12,
    marginTop: 8,
  },
  scanCancelText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

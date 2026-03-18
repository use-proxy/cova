import React, { useState, useRef, useEffect } from 'react';
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
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import Slider from '@react-native-community/slider';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RoomStackParamList } from '../../navigation/RoomNavigator';
import { useRender } from '../../hooks/useRender';
import { SafeAreaView } from 'react-native-safe-area-context';

type CaptureStep = 'method-select' | 'camera' | 'calibration' | 'processing';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function RoomCaptureScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RoomStackParamList>>();
  const { startRender } = useRender();

  const [step, setStep] = useState<CaptureStep>('method-select');
  const [capturedImageUri, setCapturedImageUri] = useState<string | null>(null);
  const [cameraPermission, requestPermission] = useCameraPermissions();
  const [dimensions, setDimensions] = useState({ width: 16, depth: 14, height: 9 });
  const [processingStage, setProcessingStage] = useState('');

  const cameraRef = useRef<CameraView>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

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

  const handleProcessCapture = async () => {
    try {
      setProcessingStage('Reading your room...');
      const base64 = await FileSystem.readAsStringAsync(capturedImageUri!, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const imageBase64 = `data:image/jpeg;base64,${base64}`;
      setProcessingStage('Starting your design...');
      const equalBlend = { coastal: 0.2, japandi: 0.2, bohemian: 0.2, mid_century: 0.2, minimalist: 0.2 };
      await startRender({
        roomId: 'default-room',
        roomType: 'living_room',
        styleBlend: equalBlend,
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
    return (
      <View style={styles.fullScreen}>
        <Image source={{ uri: capturedImageUri! }} style={StyleSheet.absoluteFill} resizeMode="cover" />
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
});

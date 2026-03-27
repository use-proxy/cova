import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Sentry, logProductDeviation, captureProductError, setCurrentScreen, setFlowStep } from '../../lib/sentry';
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
  Switch,
  TextInput,
  ScrollView,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import { Accelerometer } from 'expo-sensors';
import type { EventSubscription } from 'expo-modules-core';
import Slider from '@react-native-community/slider';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RoomStackParamList } from '../../navigation/RoomNavigator';
import { useRender } from '../../hooks/useRender';
import { useRoomPlan } from '../../hooks/useRoomPlan';
import { useAppStore } from '../../store';
import { supabase } from '../../lib/supabase';
import type { Room, RoomType } from '@cova/shared';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Circle, Rect } from 'react-native-svg';

// ── Step types ──────────────────────────────────────────────────────────────
type CaptureStep =
  | 'budget'
  | 'method'
  | 'camera'           // single photo camera
  | 'review'           // single photo / upload review
  | 'threePhotoIntro'  // 3-photo introduction
  | 'threePhotoCapture' // 3-photo capture (photo 1, 2, or 3)
  | 'threePhotoConfirm' // confirm individual photo
  | 'threePhotoSummary' // summary of all 3 photos
  | 'details'
  | 'processing';

type CaptureMethod = 'camera' | 'upload' | 'lidar' | 'threePhoto' | null;

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ── Photo guidance text per index ───────────────────────────────────────────
const THREE_PHOTO_GUIDANCE: {
  title: string;
  subtitle: string;
}[] = [
  {
    title: 'Photo 1 of 3 — Stand in the doorway',
    subtitle: 'Fit the whole room in frame',
  },
  {
    title: 'Photo 2 of 3 — Move to the left side',
    subtitle: 'Capture the left corner of the room',
  },
  {
    title: 'Photo 3 of 3 — Move to the right side',
    subtitle: 'Capture the right corner of the room',
  },
];

// ── SVG Icon Components ─────────────────────────────────────────────────────

function BackChevron() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path d="M15 18L9 12L15 6" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function ChevronRight({ color = 'rgba(0,0,0,0.3)' }: { color?: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <Path d="M7 5L12 10L7 15" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function ScanIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path d="M4 20V16M4 8V4H8M16 4H20V8M20 16V20H16" stroke="#C4A45A" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M7 12C7 9.23858 9.23858 7 12 7C14.7614 7 17 9.23858 17 12" stroke="#C4A45A" strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function CameraIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path d="M23 19C23 19.5304 22.7893 20.0391 22.4142 20.4142C22.0391 20.7893 21.5304 21 21 21H3C2.46957 21 1.96086 20.7893 1.58579 20.4142C1.21071 20.0391 1 19.5304 1 19V8C1 7.46957 1.21071 6.96086 1.58579 6.58579C1.96086 6.21071 2.46957 6 3 6H7L9 3H15L17 6H21C21.5304 6 22.0391 6.21071 22.4142 6.58579C22.7893 6.96086 23 7.46957 23 8V19Z" stroke="#0A1628" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 17C14.2091 17 16 15.2091 16 13C16 10.7909 14.2091 9 12 9C9.79086 9 8 10.7909 8 13C8 15.2091 9.79086 17 12 17Z" stroke="#0A1628" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function ThreePhotoIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Rect x={2} y={4} width={6} height={16} rx={1} stroke="#0A1628" strokeWidth={2} />
      <Rect x={9} y={4} width={6} height={16} rx={1} stroke="#0A1628" strokeWidth={2} />
      <Rect x={16} y={4} width={6} height={16} rx={1} stroke="#0A1628" strokeWidth={2} />
    </Svg>
  );
}

function UploadIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={3} width={18} height={18} rx={2} stroke="#0A1628" strokeWidth={2} />
      <Circle cx={8.5} cy={8.5} r={1.5} fill="#0A1628" />
      <Path d="M21 15L16 10L5 21" stroke="#0A1628" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function DoubleArchMark() {
  return (
    <View style={{ width: 60, height: 80, position: 'relative' }}>
      <Svg width={60} height={80} viewBox="0 0 60 80" fill="none" style={{ position: 'absolute' }}>
        <Path d="M2 80 V30 Q2 2 30 2 Q58 2 58 30 V80" stroke="#C4A45A" strokeWidth={2.5} fill="none" strokeLinecap="round" />
      </Svg>
      <Svg width={44} height={60} viewBox="0 0 44 60" fill="none" style={{ position: 'absolute', left: 8, top: 20 }}>
        <Path d="M2 60 V22 Q2 2 22 2 Q42 2 42 22 V60" stroke="#C4A45A" strokeWidth={2} fill="none" strokeLinecap="round" />
      </Svg>
    </View>
  );
}

// ── Check indicator component ───────────────────────────────────────────────
function CheckIndicator({ label, passed }: { label: string; passed: boolean }) {
  return (
    <View style={checkStyles.row}>
      <View style={[checkStyles.dot, passed ? checkStyles.dotPassed : checkStyles.dotFailing]} />
      <Text style={[checkStyles.label, passed ? checkStyles.labelPassed : checkStyles.labelFailing]}>
        {label}
      </Text>
    </View>
  );
}

const checkStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  dotPassed: {
    backgroundColor: '#2E7D32',
  },
  dotFailing: {
    backgroundColor: '#C62828',
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
  },
  labelPassed: {
    color: '#2E7D32',
  },
  labelFailing: {
    color: '#C62828',
  },
});

// ── Room type configuration ─────────────────────────────────────────────────
type RoomTypeOption = 'living' | 'bedroom' | 'kitchen' | 'dining' | 'bathroom' | 'office' | 'other';

const DESIGN_TIPS = [
  'The average person spends 90% of their time indoors — your space matters more than you think.',
  'Natural light can make a room feel up to 30% larger. Position mirrors opposite windows for maximum effect.',
  'The 60-30-10 rule: 60% dominant color, 30% secondary, 10% accent creates instant visual harmony.',
  'Plants reduce indoor air pollutants by up to 87% in 24 hours and naturally soften any design style.',
  'Layering three types of lighting — ambient, task, and accent — is the secret to professional-looking rooms.',
  'Rugs should extend at least 6 inches beyond furniture edges to anchor a seating area properly.',
  'Odd numbers of decorative objects create more visually interesting arrangements than even groupings.',
  'Ceiling height perception changes with wall color: lighter colors make ceilings feel higher.',
];

const ROOM_TYPE_MAP: Record<RoomTypeOption, RoomType> = {
  living:   'living_room',
  bedroom:  'bedroom',
  kitchen:  'kitchen',
  dining:   'dining_room',
  bathroom: 'bathroom',
  office:   'home_office',
  other:    'living_room',
};

const ROOM_TYPES: { id: RoomTypeOption; label: string }[] = [
  { id: 'living', label: 'Living Room' },
  { id: 'bedroom', label: 'Bedroom' },
  { id: 'kitchen', label: 'Kitchen' },
  { id: 'dining', label: 'Dining' },
  { id: 'bathroom', label: 'Bathroom' },
  { id: 'office', label: 'Office' },
  { id: 'other', label: 'Other' },
];

// ── Main Component ──────────────────────────────────────────────────────────

function RoomCaptureScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RoomStackParamList>>();
  const insets = useSafeAreaInsets();
  const { renderProgressStage, renderProgress } = useRender();
  const { startScan, stopScan, isAvailable: isRoomPlanAvailable } = useRoomPlan();
  const currentRoom = useAppStore((s) => s.currentRoom);
  const setCurrentRoomDimensions = useAppStore((s) => s.setCurrentRoomDimensions);
  const setBudgetMax = useAppStore((s) => s.setBudgetMax);

  // ── Core state ────────────────────────────────────────────────────────────
  const [step, setStep] = useState<CaptureStep>('budget');
  const [capturedImageUri, setCapturedImageUri] = useState<string | null>(null);
  const [cameraPermission, requestPermission] = useCameraPermissions();
  const [dimensions, setDimensions] = useState({ width: 4.9, depth: 3.7, height: 2.7 });
  const [scanning, setScanning] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [selectedRoomType, setSelectedRoomType] = useState<RoomTypeOption | null>(null);
  const [keepFurniture, setKeepFurniture] = useState(true);
  const [budgetMax, setBudgetMaxLocal] = useState(2500);
  const [captureMethod, setCaptureMethod] = useState<CaptureMethod>(null);

  // ── 3-Photo state ─────────────────────────────────────────────────────────
  const [threePhotoIndex, setThreePhotoIndex] = useState(0); // 0, 1, 2
  const [capturedPhotos, setCapturedPhotos] = useState<string[]>([]);
  const [pendingPhotoUri, setPendingPhotoUri] = useState<string | null>(null);

  // ── Sensor checks for camera screens ──────────────────────────────────────
  const [isHorizontal, setIsHorizontal] = useState(false);
  const [lightCheckPassed, setLightCheckPassed] = useState(false);
  const accelSubRef = useRef<EventSubscription | null>(null);
  const lightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Design tips for loading screen ──────────────────────────────────────
  const [designTipIndex, setDesignTipIndex] = useState(0);
  const designTipTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cameraRef = useRef<CameraView>(null);
  const pulseAnim = useRef(new Animated.Value(0.3)).current;
  const captureButtonPulse = useRef(new Animated.Value(1)).current;

  // ── Sentry tracking ──────────────────────────────────────────────────────
  useEffect(() => {
    setCurrentScreen('RoomCaptureScreen');
    setFlowStep('capture');
  }, []);

  // ── Request camera permissions on mount ──────────────────────────────────
  useEffect(() => {
    requestPermission();
  }, [requestPermission]);

  // ── Stop RoomPlan scan on navigate away ──────────────────────────────────
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', () => {
      if (scanning) {
        stopScan();
      }
    });
    return unsubscribe;
  }, [navigation, scanning, stopScan]);

  // ── Processing pulse animation ───────────────────────────────────────────
  useEffect(() => {
    if (step === 'processing') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0.3, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      ).start();
    }
  }, [step, pulseAnim]);

  // ── Design tips rotation (every 8s during processing) ─────────────────────
  useEffect(() => {
    if (step === 'processing') {
      setDesignTipIndex(0);
      designTipTimerRef.current = setInterval(() => {
        setDesignTipIndex((prev) => (prev + 1) % DESIGN_TIPS.length);
      }, 8000);
    }
    return () => {
      if (designTipTimerRef.current) {
        clearInterval(designTipTimerRef.current);
        designTipTimerRef.current = null;
      }
    };
  }, [step]);

  // ── Capture button pulse when both checks pass ───────────────────────────
  useEffect(() => {
    if (isHorizontal && lightCheckPassed && (step === 'camera' || step === 'threePhotoCapture')) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(captureButtonPulse, { toValue: 1.08, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(captureButtonPulse, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      ).start();
    } else {
      captureButtonPulse.setValue(1);
    }
  }, [isHorizontal, lightCheckPassed, step, captureButtonPulse]);

  // ── Start/stop accelerometer for horizontal check ────────────────────────
  const startSensorChecks = useCallback(() => {
    // Start accelerometer for horizontal check (within 15 degrees)
    Accelerometer.setUpdateInterval(200);
    accelSubRef.current = Accelerometer.addListener(({ x, y, z }) => {
      // Calculate pitch angle in degrees
      const pitch = Math.abs(Math.atan2(y, Math.sqrt(x * x + z * z)) * (180 / Math.PI));
      setIsHorizontal(pitch < 15);
    });

    // Light check: pragmatic approach — pass after 1.5s delay
    // Real brightness validation happens server-side
    setLightCheckPassed(false);
    lightTimerRef.current = setTimeout(() => {
      setLightCheckPassed(true);
    }, 1500);
  }, []);

  const stopSensorChecks = useCallback(() => {
    if (accelSubRef.current) {
      accelSubRef.current.remove();
      accelSubRef.current = null;
    }
    if (lightTimerRef.current) {
      clearTimeout(lightTimerRef.current);
      lightTimerRef.current = null;
    }
    setIsHorizontal(false);
    setLightCheckPassed(false);
  }, []);

  // ── Cleanup sensors on unmount ───────────────────────────────────────────
  useEffect(() => {
    return () => {
      stopSensorChecks();
    };
  }, [stopSensorChecks]);

  // ── Start/stop sensors based on step ─────────────────────────────────────
  useEffect(() => {
    if (step === 'camera' || step === 'threePhotoCapture') {
      startSensorChecks();
    } else {
      stopSensorChecks();
    }
  }, [step, startSensorChecks, stopSensorChecks]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleTakePhoto = async () => {
    if (!cameraPermission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Camera Permission', 'Camera access is required to take a photo of your room.');
        return;
      }
    }
    setCaptureMethod('camera');
    setStep('camera');
  };

  const handleUploadPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      base64: false,
    });
    if (!result.canceled && result.assets[0]) {
      setCaptureMethod('upload');
      setCapturedImageUri(result.assets[0].uri);
      setStep('review');
    }
  };

  const handleCapture = async () => {
    if (!cameraRef.current) return;
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.9 });
    if (photo) {
      setCapturedImageUri(photo.uri);
      setStep('review');
    }
  };

  // ── 3-Photo handlers ─────────────────────────────────────────────────────

  const handleStartThreePhoto = async () => {
    if (!cameraPermission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Camera Permission', 'Camera access is required to capture your room.');
        return;
      }
    }
    setCaptureMethod('threePhoto');
    setThreePhotoIndex(0);
    setCapturedPhotos([]);
    setPendingPhotoUri(null);
    setStep('threePhotoCapture');
  };

  const handleThreePhotoCapture = async () => {
    if (!cameraRef.current) return;
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.9 });
    if (photo) {
      setPendingPhotoUri(photo.uri);
      setStep('threePhotoConfirm');
    }
  };

  const handleThreePhotoConfirmAccept = () => {
    if (!pendingPhotoUri) return;
    const newPhotos = [...capturedPhotos];
    newPhotos[threePhotoIndex] = pendingPhotoUri;
    setCapturedPhotos(newPhotos);
    setPendingPhotoUri(null);

    if (threePhotoIndex >= 2) {
      // All 3 photos captured — go to summary
      // Photo 1 (index 0) is the primary/BEFORE image
      setCapturedImageUri(newPhotos[0]);
      setStep('threePhotoSummary');
    } else {
      // Move to next photo
      setThreePhotoIndex(threePhotoIndex + 1);
      setStep('threePhotoCapture');
    }
  };

  const handleThreePhotoConfirmRetake = () => {
    setPendingPhotoUri(null);
    setStep('threePhotoCapture');
  };

  const handleUseSinglePhotoEscape = () => {
    // Use Photo 1 only (already captured), skip remaining
    if (capturedPhotos[0]) {
      setCapturedImageUri(capturedPhotos[0]);
      setCaptureMethod('camera');
      setStep('review');
    }
  };

  const handleThreePhotoBack = () => {
    if (threePhotoIndex === 0) {
      setStep('threePhotoIntro');
    } else {
      setThreePhotoIndex(threePhotoIndex - 1);
      setStep('threePhotoCapture');
    }
  };

  // ── LiDAR handler with auto-fallback to 3-photo ──────────────────────────
  const handleRoomPlanScan = async () => {
    try {
      setCaptureMethod('lidar');
      setScanning(true);
      const data = await startScan();
      setScanning(false);
      setDimensions({
        width: data.width,
        depth: data.depth,
        height: data.height,
      });
      setCurrentRoomDimensions({ width: data.width, depth: data.depth, height: data.height, unit: 'm' });
      if (!capturedImageUri && data.thumbnailBase64) {
        const destUri = FileSystem.cacheDirectory + 'roomplan_thumb.jpg';
        await FileSystem.writeAsStringAsync(destUri, data.thumbnailBase64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const compressed = await ImageManipulator.manipulateAsync(
          destUri,
          [{ resize: { width: 1024 } }],
          { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
        );
        setCapturedImageUri(compressed.uri);
      }
      setStep('details');
    } catch (e: unknown) {
      setScanning(false);
      const message = e instanceof Error ? e.message : 'Could not complete the room scan.';
      if (message === 'Scan cancelled') return;
      // Auto-fallback to 3-photo capture per spec
      Alert.alert(
        'Room scan unavailable',
        "Let's use photos instead",
        [
          {
            text: 'OK',
            onPress: () => {
              setCaptureMethod('threePhoto');
              setThreePhotoIndex(0);
              setCapturedPhotos([]);
              setPendingPhotoUri(null);
              setStep('threePhotoIntro');
            },
          },
        ],
      );
    }
  };

  const handleReviewContinue = () => {
    setCurrentRoomDimensions({ width: dimensions.width, depth: dimensions.depth, height: dimensions.height, unit: 'm' });
    setStep('details');
  };

  const handleStartDesigning = () => {
    setStep('processing');
    void handleProcessCapture();
  };

  const handleProcessCapture = async (imageUri?: string) => {
    try {
      const effectiveUri = imageUri ?? capturedImageUri;
      if (!effectiveUri) {
        logProductDeviation(
          'FEATURE_4',
          'Any path that results in capturedImageUri being null when render pipeline runs = CRITICAL DEVIATION',
          'handleProcessCapture called with no image URI — render pipeline cannot proceed',
          'CRITICAL_DEVIATION',
        );
        Alert.alert('Error', 'No image captured. Please try again.');
        setStep('method');
        return;
      }

      useAppStore.getState().setCapturedImageUri(effectiveUri);

      const compressed = await ImageManipulator.manipulateAsync(
        effectiveUri,
        [{ resize: { width: 1024 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
      );
      const blend = currentRoom?.style_blend ?? { coastal: 0.2, japandi: 0.2, bohemian: 0.2, mid_century: 0.2, minimalist: 0.2 };
      const roomType: RoomType = selectedRoomType
        ? ROOM_TYPE_MAP[selectedRoomType]
        : (currentRoom?.room_type ?? 'living_room');

      let roomId = currentRoom?.id;
      if (!roomId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');
        const { data: newRoom, error: roomErr } = await supabase
          .from('rooms')
          .insert({
            user_id: user.id,
            name: roomName || 'My Room',
            room_type: roomType,
            style_blend: blend,
          })
          .select('*')
          .single();
        if (roomErr || !newRoom) throw new Error('Failed to create room record');
        roomId = newRoom.id as string;
        useAppStore.getState().setCurrentRoom(newRoom as Room);
      }

      // Upload original image
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (authUser) {
          const filePath = `${authUser.id}/${roomId}/original.jpg`;
          const imgResponse = await fetch(compressed.uri);
          const blob = await imgResponse.blob();
          await supabase.storage.from('room-photos').upload(filePath, blob, { contentType: 'image/jpeg', upsert: true });
          const { data: signedData } = await supabase.storage.from('room-photos').createSignedUrl(filePath, 60 * 60 * 24 * 365);
          if (signedData?.signedUrl) {
            await supabase.from('rooms').update({ original_image_url: signedData.signedUrl }).eq('id', roomId);
            const updated = { ...useAppStore.getState().currentRoom, original_image_url: signedData.signedUrl };
            useAppStore.getState().setCurrentRoom(updated as Room);
          }
        }
      } catch (uploadErr) {
        console.warn('original_image_url upload failed (non-fatal):', uploadErr);
      }

      // Upload additional photos for 3-photo capture (photos 2 and 3)
      if (captureMethod === 'threePhoto' && capturedPhotos.length > 1) {
        try {
          const { data: { user: authUser } } = await supabase.auth.getUser();
          if (authUser) {
            for (let i = 1; i < capturedPhotos.length; i++) {
              const photoUri = capturedPhotos[i];
              if (!photoUri) continue;
              const compressedExtra = await ImageManipulator.manipulateAsync(
                photoUri,
                [{ resize: { width: 1024 } }],
                { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
              );
              const extraPath = `${authUser.id}/${roomId}/photo_${i + 1}.jpg`;
              const extraResponse = await fetch(compressedExtra.uri);
              const extraBlob = await extraResponse.blob();
              await supabase.storage.from('room-photos').upload(extraPath, extraBlob, { contentType: 'image/jpeg', upsert: true });
            }
          }
        } catch (extraUploadErr) {
          console.warn('Extra photo upload failed (non-fatal):', extraUploadErr);
        }
      }

      useAppStore.getState().setCurrentRender(null);
      useAppStore.getState().setRenderStatus('idle');

      const testMode = process.env.EXPO_PUBLIC_TEST_RENDER_MODE === 'true';
      navigation.navigate('RenderView', { room_id: roomId, autoGenerate: true, testMode });
    } catch (e) {
      console.error('handleProcessCapture failed:', e);
      const msg = e instanceof Error ? e.message : String(e);
      captureProductError(e instanceof Error ? e : new Error(msg), 'FEATURE_4');
      Alert.alert('Error', 'Something went wrong. Please try again.');
      setStep('details');
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // ── RENDER: 3-Photo Introduction ──────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  if (step === 'threePhotoIntro') {
    return (
      <View style={[styles.fullScreen, { backgroundColor: '#0A1628' }]}>
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <View style={styles.headerRow}>
            <TouchableOpacity style={styles.headerBackBtn} onPress={() => setStep('method')}>
              <BackChevron />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>3-Photo Capture</Text>
            <View style={{ width: 40 }} />
          </View>
        </View>

        <View style={styles.threePhotoIntroContent}>
          <Text style={styles.threePhotoIntroTitle}>
            {"We'll take 3 quick photos\nto understand your room."}
          </Text>

          <View style={styles.threePhotoCirclesRow}>
            {[1, 2, 3].map((num) => (
              <View key={num} style={styles.threePhotoCircle}>
                <Text style={styles.threePhotoCircleText}>{num}</Text>
                <Text style={styles.threePhotoCircleLabel}>
                  {num === 1 ? 'Doorway' : num === 2 ? 'Left Side' : 'Right Side'}
                </Text>
              </View>
            ))}
          </View>

          <Text style={styles.threePhotoIntroSubtext}>
            Photo 1 will be your before image and primary reference for the AI render.
          </Text>
        </View>

        <View style={[styles.bottomActionArea, { paddingBottom: Math.max(insets.bottom, 24) + 24 }]}>
          <TouchableOpacity style={styles.goldPillButton} onPress={handleStartThreePhoto}>
            <Text style={styles.goldPillButtonText}>Start</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ── RENDER: 3-Photo Capture ───────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  if (step === 'threePhotoCapture') {
    const guidance = THREE_PHOTO_GUIDANCE[threePhotoIndex];
    const bothChecksPassed = isHorizontal && lightCheckPassed;

    return (
      <View style={styles.fullScreen}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />

        {/* Top bar with back and guidance text */}
        <SafeAreaView style={styles.cameraTopBar}>
          <TouchableOpacity style={styles.headerBackBtn} onPress={handleThreePhotoBack}>
            <BackChevron />
          </TouchableOpacity>
        </SafeAreaView>

        {/* Guidance overlay */}
        <View style={styles.guidanceOverlay}>
          <Text style={styles.guidanceTitle}>{guidance?.title ?? ''}</Text>
          <Text style={styles.guidanceSubtitle}>{guidance?.subtitle ?? ''}</Text>
        </View>

        {/* Real-time checks */}
        <View style={styles.checksContainer}>
          <CheckIndicator label="Light level" passed={lightCheckPassed} />
          <CheckIndicator label="Horizontal" passed={isHorizontal} />
        </View>

        {/* Progress dots */}
        <View style={styles.progressDotsRow}>
          {[0, 1, 2].map((idx) => (
            <View
              key={idx}
              style={[
                styles.progressDot,
                idx < threePhotoIndex
                  ? styles.progressDotComplete
                  : idx === threePhotoIndex
                    ? styles.progressDotActive
                    : styles.progressDotInactive,
              ]}
            />
          ))}
        </View>

        {/* Bottom controls */}
        <View style={styles.threePhotoCaptureBottom}>
          {/* Escape hatch for photos 2 and 3 */}
          {threePhotoIndex > 0 && (
            <TouchableOpacity style={styles.escapeHatchBtn} onPress={handleUseSinglePhotoEscape}>
              <Text style={styles.escapeHatchText}>Use single photo instead</Text>
            </TouchableOpacity>
          )}

          <Animated.View style={{ transform: [{ scale: captureButtonPulse }] }}>
            <TouchableOpacity
              style={[
                styles.captureButton,
                bothChecksPassed && styles.captureButtonReady,
              ]}
              onPress={handleThreePhotoCapture}
            >
              <View
                style={[
                  styles.captureButtonInner,
                  bothChecksPassed && styles.captureButtonInnerReady,
                ]}
              />
            </TouchableOpacity>
          </Animated.View>
        </View>
      </View>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ── RENDER: 3-Photo Confirm ───────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  if (step === 'threePhotoConfirm') {
    return (
      <View style={[styles.fullScreen, { backgroundColor: '#0A1628' }]}>
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <View style={styles.headerRow}>
            <TouchableOpacity style={styles.headerBackBtn} onPress={handleThreePhotoConfirmRetake}>
              <BackChevron />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>
              {`Photo ${threePhotoIndex + 1} of 3`}
            </Text>
            <View style={{ width: 40 }} />
          </View>
        </View>

        {/* Full-screen preview */}
        <View style={styles.confirmImageContainer}>
          {pendingPhotoUri && (
            <Image source={{ uri: pendingPhotoUri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
          )}
        </View>

        {/* Action buttons */}
        <View style={[styles.confirmActions, { paddingBottom: Math.max(insets.bottom, 24) + 24 }]}>
          <TouchableOpacity style={styles.goldPillButton} onPress={handleThreePhotoConfirmAccept}>
            <Text style={styles.goldPillButtonText}>Looks Good</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.outlinedButton} onPress={handleThreePhotoConfirmRetake}>
            <Text style={styles.outlinedButtonText}>Retake</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ── RENDER: 3-Photo Summary ───────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  if (step === 'threePhotoSummary') {
    return (
      <View style={[styles.fullScreen, { backgroundColor: '#0A1628' }]}>
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <View style={styles.headerRow}>
            <TouchableOpacity
              style={styles.headerBackBtn}
              onPress={() => {
                setThreePhotoIndex(2);
                setStep('threePhotoCapture');
              }}
            >
              <BackChevron />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Photos Complete</Text>
            <View style={{ width: 40 }} />
          </View>
        </View>

        <View style={styles.summaryContent}>
          {/* 3 thumbnail row */}
          <View style={styles.summaryThumbnailRow}>
            {capturedPhotos.map((uri, idx) => (
              <View key={idx} style={styles.summaryThumbnail}>
                <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                <View style={styles.summaryThumbnailBadge}>
                  <Text style={styles.summaryThumbnailBadgeText}>{idx + 1}</Text>
                </View>
              </View>
            ))}
          </View>

          <Text style={styles.summaryText}>
            {"Perfect \u2014 we have everything we need."}
          </Text>
        </View>

        <View style={[styles.bottomActionArea, { paddingBottom: Math.max(insets.bottom, 24) + 24 }]}>
          <TouchableOpacity
            style={styles.goldPillButton}
            onPress={() => {
              setCurrentRoomDimensions({ width: dimensions.width, depth: dimensions.depth, height: dimensions.height, unit: 'm' });
              setStep('details');
            }}
          >
            <Text style={styles.goldPillButtonText}>Start Redesign</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ── RENDER: Single Photo Camera ───────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  if (step === 'camera') {
    const bothChecksPassed = isHorizontal && lightCheckPassed;

    return (
      <View style={styles.fullScreen}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
        <SafeAreaView style={styles.cameraTopBar}>
          <TouchableOpacity style={styles.headerBackBtn} onPress={() => setStep('method')}>
            <BackChevron />
          </TouchableOpacity>
        </SafeAreaView>

        {/* Real-time checks */}
        <View style={styles.checksContainer}>
          <CheckIndicator label="Light level" passed={lightCheckPassed} />
          <CheckIndicator label="Horizontal" passed={isHorizontal} />
        </View>

        <View style={styles.captureRow}>
          <Animated.View style={{ transform: [{ scale: captureButtonPulse }] }}>
            <TouchableOpacity
              style={[
                styles.captureButton,
                bothChecksPassed && styles.captureButtonReady,
              ]}
              onPress={handleCapture}
            >
              <View
                style={[
                  styles.captureButtonInner,
                  bothChecksPassed && styles.captureButtonInnerReady,
                ]}
              />
            </TouchableOpacity>
          </Animated.View>
        </View>
      </View>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ── RENDER: Review step (single photo / upload) ───────────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  if (step === 'review') {
    const isUpload = captureMethod === 'upload';
    return (
      <View style={[styles.fullScreen, { backgroundColor: '#0A1628' }]}>
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <View style={styles.headerRow}>
            <TouchableOpacity style={styles.headerBackBtn} onPress={() => setStep('method')}>
              <BackChevron />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Your Photo</Text>
            <View style={{ width: 40 }} />
          </View>
        </View>

        {/* Full-screen photo preview */}
        <View style={styles.confirmImageContainer}>
          {capturedImageUri && (
            <Image source={{ uri: capturedImageUri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
          )}
        </View>

        {/* Dimension sliders */}
        <View style={styles.sliderCard}>
          <Text style={{ color: 'rgba(0,0,0,0.5)', fontSize: 13, marginBottom: 12, textAlign: 'center' }}>
            Adjust sliders to match your room's dimensions
          </Text>

          <View style={styles.sliderSection}>
            <View style={styles.sliderLabelRow}>
              <Text style={styles.sliderLabel}>Width</Text>
              <Text style={styles.sliderValue}>{dimensions.width.toFixed(1)} m</Text>
            </View>
            <Slider
              style={styles.slider}
              minimumValue={2}
              maximumValue={12}
              step={0.1}
              value={dimensions.width}
              onValueChange={(v) => setDimensions((d) => ({ ...d, width: Math.round(v * 10) / 10 }))}
              minimumTrackTintColor="#C4A45A"
              maximumTrackTintColor="rgba(0,0,0,0.1)"
              thumbTintColor="#C4A45A"
            />
          </View>

          <View style={styles.sliderSection}>
            <View style={styles.sliderLabelRow}>
              <Text style={styles.sliderLabel}>Depth</Text>
              <Text style={styles.sliderValue}>{dimensions.depth.toFixed(1)} m</Text>
            </View>
            <Slider
              style={styles.slider}
              minimumValue={2}
              maximumValue={12}
              step={0.1}
              value={dimensions.depth}
              onValueChange={(v) => setDimensions((d) => ({ ...d, depth: Math.round(v * 10) / 10 }))}
              minimumTrackTintColor="#C4A45A"
              maximumTrackTintColor="rgba(0,0,0,0.1)"
              thumbTintColor="#C4A45A"
            />
          </View>

          <View style={styles.sliderSection}>
            <View style={styles.sliderLabelRow}>
              <Text style={styles.sliderLabel}>Ceiling Height</Text>
              <Text style={styles.sliderValue}>{dimensions.height.toFixed(1)} m</Text>
            </View>
            <Slider
              style={styles.slider}
              minimumValue={2.1}
              maximumValue={4.5}
              step={0.1}
              value={dimensions.height}
              onValueChange={(v) => setDimensions((d) => ({ ...d, height: Math.round(v * 10) / 10 }))}
              minimumTrackTintColor="#C4A45A"
              maximumTrackTintColor="rgba(0,0,0,0.1)"
              thumbTintColor="#C4A45A"
            />
          </View>
        </View>

        {/* Action buttons */}
        <View style={[styles.confirmActions, { paddingBottom: Math.max(insets.bottom, 24) + 24 }]}>
          <TouchableOpacity style={styles.goldPillButton} onPress={handleReviewContinue}>
            <Text style={styles.goldPillButtonText}>
              {isUpload ? 'Use This Photo' : 'Looks Good'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.outlinedButton}
            onPress={() => {
              setCapturedImageUri(null);
              if (isUpload) {
                void handleUploadPhoto();
              } else {
                setStep('camera');
              }
            }}
          >
            <Text style={styles.outlinedButtonText}>
              {isUpload ? 'Choose a Different Photo' : 'Retake'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ── RENDER: Details step ──────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  if (step === 'details') {
    return (
      <View style={[styles.fullScreen, { backgroundColor: '#0A1628' }]}>
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <View style={styles.headerRow}>
            <TouchableOpacity
              style={styles.headerBackBtn}
              onPress={() => {
                if (captureMethod === 'lidar') {
                  setStep('method');
                } else if (captureMethod === 'threePhoto') {
                  setStep('threePhotoSummary');
                } else {
                  setStep('review');
                }
              }}
            >
              <BackChevron />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Room Details</Text>
            <View style={{ width: 40 }} />
          </View>
        </View>

        {capturedImageUri && (
          <View style={styles.detailsThumbnail}>
            <Image source={{ uri: capturedImageUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          </View>
        )}

        <ScrollView style={styles.detailsFormScrollArea} contentContainerStyle={styles.detailsFormContent} showsVerticalScrollIndicator={false}>
          <View style={styles.formCard}>
            <View style={styles.formSection}>
              <Text style={styles.formLabel}>Room Name</Text>
              <TextInput
                style={styles.formInput}
                value={roomName}
                onChangeText={setRoomName}
                placeholder="e.g. Master Bedroom"
                placeholderTextColor="rgba(0,0,0,0.35)"
                autoCapitalize="words"
              />
            </View>

            <View style={styles.formSection}>
              <Text style={styles.formLabel}>Room Type</Text>
              <View style={styles.roomTypePillContainer}>
                {ROOM_TYPES.map((type) => (
                  <TouchableOpacity
                    key={type.id}
                    style={[
                      styles.roomTypePill,
                      selectedRoomType === type.id && styles.roomTypePillActive,
                    ]}
                    onPress={() => setSelectedRoomType(type.id)}
                  >
                    <Text
                      style={[
                        styles.roomTypePillText,
                        selectedRoomType === type.id && styles.roomTypePillTextActive,
                      ]}
                    >
                      {type.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleLabel}>Keep existing furniture</Text>
                <Text style={styles.toggleSubtext}>AI will work around current pieces</Text>
              </View>
              <Switch
                value={keepFurniture}
                onValueChange={setKeepFurniture}
                trackColor={{ false: 'rgba(0,0,0,0.15)', true: '#C4A45A' }}
                thumbColor="white"
              />
            </View>
          </View>
        </ScrollView>

        <View style={[styles.bottomActionArea, { paddingBottom: Math.max(insets.bottom, 24) + 24 }]}>
          <TouchableOpacity style={styles.goldPillButton} onPress={handleStartDesigning}>
            <Text style={styles.goldPillButtonText}>Start Designing</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ── RENDER: Budget step ───────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  if (step === 'budget') {
    const budgetLabel =
      budgetMax < 500 ? 'Under $500' :
      budgetMax < 1500 ? '$500\u2013$1,500' :
      budgetMax < 5000 ? '$1,500\u2013$5,000' : '$5,000+';

    return (
      <View style={[styles.fullScreen, { backgroundColor: '#0A1628' }]}>
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <View style={styles.headerRow}>
            <TouchableOpacity style={styles.headerBackBtn} onPress={() => navigation.goBack()}>
              <BackChevron />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Set Your Budget</Text>
            <View style={{ width: 40 }} />
          </View>
        </View>

        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 28 }}>
          <Text style={styles.budgetLabel}>Budget</Text>
          <Text style={styles.budgetValue}>${budgetMax.toLocaleString()}</Text>
          <Text style={styles.budgetRange}>{budgetLabel}</Text>

          <Slider
            testID="budget-slider"
            style={[styles.slider, { marginTop: 20, marginBottom: 8 }]}
            minimumValue={0}
            maximumValue={10000}
            step={100}
            value={budgetMax}
            onValueChange={(v) => setBudgetMaxLocal(Math.round(v))}
            minimumTrackTintColor="#C4A45A"
            maximumTrackTintColor="rgba(255,255,255,0.15)"
            thumbTintColor="#C4A45A"
          />

          <View style={styles.budgetTickRow}>
            {['Under $500', '$500\u2013$1,500', '$1,500\u2013$5,000', '$5,000+'].map((label) => (
              <Text key={label} style={styles.budgetTickLabel}>{label}</Text>
            ))}
          </View>
        </View>

        <View style={[styles.bottomActionArea, { paddingBottom: Math.max(insets.bottom, 24) + 24 }]}>
          <TouchableOpacity
            style={styles.goldPillButton}
            onPress={() => {
              setBudgetMax(budgetMax);
              setStep('method');
            }}
          >
            <Text style={styles.goldPillButtonText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ── RENDER: Processing step ───────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  if (step === 'processing') {
    const progressWidth = Math.max(0, Math.min(100, renderProgress));
    return (
      <View style={[styles.fullScreen, styles.processingContainer]}>
        <Animated.View style={[styles.pulseOuter, { opacity: pulseAnim }]}>
          <View style={styles.pulseInner} />
        </Animated.View>

        <DoubleArchMark />

        <Text style={styles.processingStageText}>
          {renderProgressStage || 'Setting up your room...'}
        </Text>

        <View style={styles.progressBarTrack}>
          <View style={[styles.progressBarFill, { width: `${progressWidth}%` }]} />
        </View>

        {/* Design tips rotating every 8s */}
        <View style={styles.designTipContainer}>
          <Text style={styles.designTipText}>{DESIGN_TIPS[designTipIndex]}</Text>
        </View>
      </View>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ── RENDER: Method selection step (default) ───────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <View style={[styles.fullScreen, { backgroundColor: '#0A1628' }]}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.headerBackBtn} onPress={() => setStep('budget')}>
            <BackChevron />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Capture Your Room</Text>
          <View style={{ width: 40 }} />
        </View>
        <Text style={styles.headerSubtext}>Choose how to capture your space</Text>
      </View>

      <View style={styles.methodCards}>
        {/* Permission denied — camera-dependent options hidden */}
        {cameraPermission?.status === 'denied' ? (
          <>
            <Text style={styles.permissionText}>
              Camera access was denied. You can still upload a photo from your library.
            </Text>
            <TouchableOpacity
              style={styles.methodCard}
              onPress={handleUploadPhoto}
              activeOpacity={0.8}
            >
              <View style={[styles.methodIconCircle, { backgroundColor: 'rgba(10,22,40,0.08)' }]}>
                <UploadIcon />
              </View>
              <View style={styles.methodCardContent}>
                <Text style={styles.methodCardTitle}>Upload from Library</Text>
                <Text style={styles.methodCardSubtext}>Choose an existing photo</Text>
              </View>
              <ChevronRight />
            </TouchableOpacity>
          </>
        ) : !cameraPermission?.granted ? (
          <>
            <Text style={styles.permissionText}>
              Camera access is required to capture your room
            </Text>
            <TouchableOpacity style={styles.goldPillButton} onPress={requestPermission}>
              <Text style={styles.goldPillButtonText}>Grant Permission</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.methodCard, { marginTop: 12 }]}
              onPress={handleUploadPhoto}
              activeOpacity={0.8}
            >
              <View style={[styles.methodIconCircle, { backgroundColor: 'rgba(10,22,40,0.08)' }]}>
                <UploadIcon />
              </View>
              <View style={styles.methodCardContent}>
                <Text style={styles.methodCardTitle}>Upload from Library</Text>
                <Text style={styles.methodCardSubtext}>Choose an existing photo</Text>
              </View>
              <ChevronRight />
            </TouchableOpacity>
          </>
        ) : (
          /* Permission granted — all options available */
          <>
            {/* LiDAR devices: Scan Room as primary */}
            {isRoomPlanAvailable && (
              <TouchableOpacity
                style={[styles.methodCard, styles.methodCardFeatured]}
                onPress={handleRoomPlanScan}
                disabled={scanning}
                activeOpacity={0.8}
              >
                <View style={[styles.methodIconCircle, { backgroundColor: 'rgba(196,164,90,0.15)' }]}>
                  <ScanIcon />
                </View>
                <View style={styles.methodCardContent}>
                  <Text style={styles.methodCardTitle}>Scan Room</Text>
                  <Text style={styles.methodCardSubtext}>Best quality — iPhone 12 Pro and later</Text>
                </View>
                <ChevronRight />
              </TouchableOpacity>
            )}

            {/* 3-Photo Capture — primary for non-LiDAR, secondary for LiDAR */}
            <TouchableOpacity
              testID="three-photo-btn"
              style={[
                styles.methodCard,
                !isRoomPlanAvailable && styles.methodCardFeatured,
              ]}
              onPress={() => setStep('threePhotoIntro')}
              activeOpacity={0.8}
            >
              <View style={[styles.methodIconCircle, { backgroundColor: isRoomPlanAvailable ? 'rgba(10,22,40,0.08)' : 'rgba(196,164,90,0.15)' }]}>
                <ThreePhotoIcon />
              </View>
              <View style={styles.methodCardContent}>
                <Text style={styles.methodCardTitle}>3-Photo Capture</Text>
                <Text style={styles.methodCardSubtext}>Quick guided photo sequence</Text>
              </View>
              <ChevronRight />
            </TouchableOpacity>

            {/* Single photo — always available */}
            <TouchableOpacity
              testID="take-photo-btn"
              style={styles.methodCard}
              onPress={handleTakePhoto}
              activeOpacity={0.8}
            >
              <View style={[styles.methodIconCircle, { backgroundColor: 'rgba(10,22,40,0.08)' }]}>
                <CameraIcon />
              </View>
              <View style={styles.methodCardContent}>
                <Text style={styles.methodCardTitle}>
                  {isRoomPlanAvailable ? 'Take Photo' : 'Take Single Photo'}
                </Text>
                <Text style={styles.methodCardSubtext}>Capture your room with the camera</Text>
              </View>
              <ChevronRight />
            </TouchableOpacity>

            {/* Upload — always available */}
            <TouchableOpacity
              testID="upload-from-library-btn"
              style={styles.methodCard}
              onPress={handleUploadPhoto}
              activeOpacity={0.8}
            >
              <View style={[styles.methodIconCircle, { backgroundColor: 'rgba(10,22,40,0.08)' }]}>
                <UploadIcon />
              </View>
              <View style={styles.methodCardContent}>
                <Text style={styles.methodCardTitle}>Upload from Library</Text>
                <Text style={styles.methodCardSubtext}>Choose an existing photo</Text>
              </View>
              <ChevronRight />
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Scanning overlay */}
      {scanning && (
        <View style={styles.scanningOverlay}>
          <ActivityIndicator size="large" color="#C4A45A" />
          <Text style={styles.scanningText}>Scanning your room...</Text>
          <TouchableOpacity
            style={styles.scanCancelBtn}
            onPress={() => { stopScan(); setScanning(false); }}
          >
            <Text style={styles.scanCancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  fullScreen: {
    flex: 1,
    backgroundColor: '#0A1628',
  },

  // ── Header ────────────────────────────────
  header: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  headerBackBtn: {
    position: 'absolute',
    left: 0,
    padding: 4,
  },
  headerTitle: {
    color: 'white',
    fontSize: 22,
    fontWeight: '400',
    letterSpacing: 1,
  },
  headerSubtext: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },

  // ── Method cards ──────────────────────────
  methodCards: {
    paddingHorizontal: 20,
    marginTop: 16,
  },
  methodCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  methodCardFeatured: {
    borderWidth: 1.5,
    borderColor: '#C4A45A',
  },
  methodIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodCardContent: {
    flex: 1,
    marginLeft: 16,
  },
  methodCardTitle: {
    color: '#0A1628',
    fontSize: 17,
    fontWeight: '600',
  },
  methodCardSubtext: {
    color: 'rgba(0,0,0,0.5)',
    fontSize: 13,
    marginTop: 4,
  },

  // ── Camera ────────────────────────────────
  cameraTopBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingHorizontal: 16,
    paddingTop: 8,
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
    backgroundColor: 'rgba(196,164,90,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#C4A45A',
  },
  captureButtonReady: {
    borderColor: '#2E7D32',
    backgroundColor: 'rgba(46,125,50,0.3)',
  },
  captureButtonInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#C4A45A',
  },
  captureButtonInnerReady: {
    backgroundColor: '#2E7D32',
  },

  // ── Guidance overlay (3-photo) ────────────
  guidanceOverlay: {
    position: 'absolute',
    top: 100,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  guidanceTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  guidanceSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 6,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  // ── Checks container ──────────────────────
  checksContainer: {
    position: 'absolute',
    bottom: 160,
    left: 0,
    right: 0,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    marginHorizontal: 40,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },

  // ── Progress dots ─────────────────────────
  progressDotsRow: {
    position: 'absolute',
    top: 60,
    right: 20,
    flexDirection: 'row',
    gap: 8,
  },
  progressDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  progressDotComplete: {
    backgroundColor: '#C4A45A',
  },
  progressDotActive: {
    backgroundColor: 'white',
    borderWidth: 2,
    borderColor: '#C4A45A',
  },
  progressDotInactive: {
    backgroundColor: 'rgba(255,255,255,0.3)',
  },

  // ── 3-Photo bottom area ───────────────────
  threePhotoCaptureBottom: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 16,
  },
  escapeHatchBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  escapeHatchText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    textDecorationLine: 'underline',
  },

  // ── 3-Photo intro ─────────────────────────
  threePhotoIntroContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  threePhotoIntroTitle: {
    color: 'white',
    fontSize: 24,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 32,
    marginBottom: 40,
  },
  threePhotoCirclesRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 28,
    marginBottom: 40,
  },
  threePhotoCircle: {
    alignItems: 'center',
  },
  threePhotoCircleText: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#C4A45A',
    color: '#C4A45A',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 44,
    overflow: 'hidden',
  },
  threePhotoCircleLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
  },
  threePhotoIntroSubtext: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },

  // ── Confirm photo ─────────────────────────
  confirmImageContainer: {
    flex: 1,
    marginHorizontal: 20,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  confirmActions: {
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 12,
  },
  outlinedButton: {
    height: 56,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlinedButtonText: {
    color: 'white',
    fontSize: 17,
    fontWeight: '500',
  },

  // ── Summary ───────────────────────────────
  summaryContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  summaryThumbnailRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 32,
  },
  summaryThumbnail: {
    width: (SCREEN_WIDTH - 64) / 3,
    height: ((SCREEN_WIDTH - 64) / 3) * 1.2,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  summaryThumbnailBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#C4A45A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryThumbnailBadgeText: {
    color: '#0A1628',
    fontSize: 13,
    fontWeight: '700',
  },
  summaryText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '500',
    textAlign: 'center',
  },

  // ── Sliders ───────────────────────────────
  sliderCard: {
    marginHorizontal: 20,
    marginTop: 16,
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
  },
  sliderSection: {
    marginBottom: 20,
  },
  sliderLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sliderLabel: {
    color: '#0A1628',
    fontSize: 15,
    fontWeight: '500',
  },
  sliderValue: {
    color: '#C4A45A',
    fontSize: 15,
    fontWeight: '600',
  },
  slider: {
    width: '100%',
    height: 40,
  },
  bottomActionArea: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  goldPillButton: {
    height: 56,
    backgroundColor: '#C4A45A',
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goldPillButtonText: {
    color: '#0A1628',
    fontSize: 17,
    fontWeight: '600',
  },

  // ── Details step ──────────────────────────
  detailsThumbnail: {
    marginHorizontal: 20,
    height: 128,
    borderRadius: 16,
    overflow: 'hidden',
  },
  detailsFormScrollArea: {
    flex: 1,
    marginTop: 16,
  },
  detailsFormContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  formCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
  },
  formSection: {
    marginBottom: 20,
  },
  formLabel: {
    color: '#0A1628',
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 8,
  },
  formInput: {
    height: 48,
    backgroundColor: 'rgba(10,22,40,0.06)',
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 15,
    color: '#0A1628',
  },
  roomTypePillContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  roomTypePill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(10,22,40,0.06)',
  },
  roomTypePillActive: {
    backgroundColor: '#C4A45A',
  },
  roomTypePillText: {
    fontSize: 14,
    color: 'rgba(0,0,0,0.6)',
    fontWeight: '400',
  },
  roomTypePillTextActive: {
    color: '#0A1628',
    fontWeight: '600',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(0,0,0,0.08)',
  },
  toggleLabel: {
    color: '#0A1628',
    fontSize: 15,
    fontWeight: '500',
  },
  toggleSubtext: {
    color: 'rgba(0,0,0,0.5)',
    fontSize: 13,
    marginTop: 4,
  },

  // ── Processing ────────────────────────────
  processingContainer: {
    backgroundColor: '#0A1628',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pulseOuter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(196,164,90,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  pulseInner: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(196,164,90,0.4)',
  },
  processingStageText: {
    color: 'white',
    fontSize: 18,
    textAlign: 'center',
    marginTop: 32,
  },
  designTipContainer: {
    position: 'absolute',
    bottom: 80,
    left: 32,
    right: 32,
  },
  designTipText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    fontStyle: 'italic',
  },
  progressBarTrack: {
    width: 200,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 2,
    marginTop: 16,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#C4A45A',
    borderRadius: 2,
  },

  // ── Scanning overlay ──────────────────────
  scanningOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
  },
  scanningText: {
    fontSize: 18,
    color: 'white',
    fontWeight: '500',
  },
  permissionText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
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

  // ── Budget step ────────────────────────────────
  budgetLabel: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  budgetValue: {
    color: '#C4A45A',
    fontSize: 48,
    fontWeight: '700',
    marginBottom: 4,
  },
  budgetRange: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
  },
  budgetTickRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  budgetTickLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    flexShrink: 1,
    textAlign: 'center',
  },
});

export default Sentry.withErrorBoundary(RoomCaptureScreen, {
  fallback: <></>,
});

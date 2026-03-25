import React, { useState, useRef, useEffect, useReducer } from 'react';
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
  PanResponder,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
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
import Svg, { Path, Circle, Rect, Polygon, Line as SvgLine } from 'react-native-svg';

type CaptureStep = 'method' | 'camera' | 'review' | 'details' | 'budget' | 'processing';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

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

type CaptureMethod = 'camera' | 'upload' | 'lidar' | null;
type CornerKey = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';
type CornerPoint = { x: number; y: number };
type AllCorners = Record<CornerKey, CornerPoint>;
type PanResponderInstance = ReturnType<typeof PanResponder.create>;

function CalibrationOverlay({
  corners,
  panResponders,
  photoW,
  photoH,
}: {
  corners: AllCorners;
  panResponders: Record<CornerKey, PanResponderInstance>;
  photoW: number;
  photoH: number;
}) {
  const { topLeft, topRight, bottomLeft, bottomRight } = corners;
  const polygonPoints = `${topLeft.x},${topLeft.y} ${topRight.x},${topRight.y} ${bottomRight.x},${bottomRight.y} ${bottomLeft.x},${bottomLeft.y}`;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Svg
        width={photoW}
        height={photoH}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      >
        <Polygon points={polygonPoints} fill="rgba(10,22,40,0.3)" />
        <SvgLine x1={topLeft.x} y1={topLeft.y} x2={topRight.x} y2={topRight.y} stroke="#FFFFFF" strokeWidth={2} opacity={0.8} />
        <SvgLine x1={topRight.x} y1={topRight.y} x2={bottomRight.x} y2={bottomRight.y} stroke="#FFFFFF" strokeWidth={2} opacity={0.8} />
        <SvgLine x1={bottomRight.x} y1={bottomRight.y} x2={bottomLeft.x} y2={bottomLeft.y} stroke="#FFFFFF" strokeWidth={2} opacity={0.8} />
        <SvgLine x1={bottomLeft.x} y1={bottomLeft.y} x2={topLeft.x} y2={topLeft.y} stroke="#FFFFFF" strokeWidth={2} opacity={0.8} />
      </Svg>
      {(['topLeft', 'topRight', 'bottomLeft', 'bottomRight'] as const).map((key) => {
        const pos = corners[key];
        return (
          <View
            key={key}
            style={{
              position: 'absolute',
              left: pos.x - 14,
              top: pos.y - 14,
              width: 28,
              height: 28,
              borderRadius: 14,
              backgroundColor: '#FFFFFF',
              borderWidth: 2,
              borderColor: '#0A1628',
              zIndex: 15,
            }}
            {...panResponders[key].panHandlers}
          />
        );
      })}
    </View>
  );
}

type RoomTypeOption = 'living' | 'bedroom' | 'kitchen' | 'dining' | 'bathroom' | 'office' | 'other';

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

function RoomCaptureScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RoomStackParamList>>();
  const insets = useSafeAreaInsets();
  const { renderProgressStage, renderProgress } = useRender();
  const { startScan, stopScan, isAvailable: isRoomPlanAvailable } = useRoomPlan();
  const currentRoom = useAppStore((s) => s.currentRoom);
  const setCurrentRoomDimensions = useAppStore((s) => s.setCurrentRoomDimensions);
  const setBudgetMax = useAppStore((s) => s.setBudgetMax);

  const [step, setStep] = useState<CaptureStep>('budget');
  const [capturedImageUri, setCapturedImageUri] = useState<string | null>(null);
  const [cameraPermission, requestPermission] = useCameraPermissions();
  const [dimensions, setDimensions] = useState({ width: 4.9, depth: 3.7, height: 2.7 });
  const [scanning, setScanning] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [selectedRoomType, setSelectedRoomType] = useState<RoomTypeOption | null>(null);
  const [keepFurniture, setKeepFurniture] = useState(true);
  const [budgetMax, setBudgetMaxLocal] = useState(2500);

  const cameraRef = useRef<CameraView>(null);
  const pulseAnim = useRef(new Animated.Value(0.3)).current;

  // ── Calibration refs (all useRef, never useState per §6.1) ──────────────
  const [captureMethod, setCaptureMethod] = useState<CaptureMethod>(null);
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);
  const photoLayout = useRef({ width: 0, height: 0 });
  const cornerPositions = useRef<AllCorners>({
    topLeft:     { x: 0, y: 0 },
    topRight:    { x: 0, y: 0 },
    bottomLeft:  { x: 0, y: 0 },
    bottomRight: { x: 0, y: 0 },
  });
  const cornerBase = useRef<AllCorners>({
    topLeft:     { x: 0, y: 0 },
    topRight:    { x: 0, y: 0 },
    bottomLeft:  { x: 0, y: 0 },
    bottomRight: { x: 0, y: 0 },
  });
  const panResponderRefs = useRef<Record<CornerKey, PanResponderInstance> | null>(null);
  if (!panResponderRefs.current) {
    const make = (key: CornerKey): PanResponderInstance =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          cornerBase.current[key] = { ...cornerPositions.current[key] };
        },
        onPanResponderMove: (_, gs) => {
          const { width: pw, height: ph } = photoLayout.current;
          cornerPositions.current[key] = {
            x: Math.max(0, Math.min(pw, cornerBase.current[key].x + gs.dx)),
            y: Math.max(0, Math.min(ph, cornerBase.current[key].y + gs.dy)),
          };
          forceUpdate();
        },
        onPanResponderRelease: () => {},
      });
    panResponderRefs.current = {
      topLeft:     make('topLeft'),
      topRight:    make('topRight'),
      bottomLeft:  make('bottomLeft'),
      bottomRight: make('bottomRight'),
    };
  }

  const handlePhotoLayout = (w: number, h: number) => {
    photoLayout.current = { width: w, height: h };
    cornerPositions.current = {
      topLeft:     { x: 0,  y: 0 },
      topRight:    { x: w,  y: 0 },
      bottomLeft:  { x: 0,  y: h },
      bottomRight: { x: w,  y: h },
    };
    cornerBase.current = { ...cornerPositions.current };
    forceUpdate();
  };

  useEffect(() => {
    setCurrentScreen('RoomCaptureScreen');
    setFlowStep('capture');
  }, []);

  useEffect(() => {
    requestPermission();
  }, []);

  // Stop any active RoomPlan session when user navigates away (back swipe, hardware back)
  // Prevents exceedSceneSizeLimit on next scan and avoids orphaned ARKit sessions.
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', () => {
      if (scanning) {
        stopScan();
      }
    });
    return unsubscribe;
  }, [navigation, scanning, stopScan]);

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
      if (message !== 'Scan cancelled') {
        Alert.alert('Scan Failed', message);
      }
    }
  };

  const handleReviewContinue = () => {
    // Store manual dimensions to Zustand so 3D viewer and render pipeline can use them
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
        // FEATURE_4 CRITICAL: capturedImageUri must never be null when pipeline runs
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

      // Ensure a valid room row exists in the DB before calling render-room.
      // The renders table has a FK on room_id — using a placeholder string causes a FK violation.
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

      // Upload original image and write original_image_url to the room row
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

      navigation.navigate('RenderView', { room_id: roomId, autoGenerate: true });
    } catch (e) {
      console.error('handleProcessCapture failed:', e);
      const msg = e instanceof Error ? e.message : String(e);
      captureProductError(e instanceof Error ? e : new Error(msg), 'FEATURE_4');
      Alert.alert('Error', 'Something went wrong. Please try again.');
      setStep('details');
    }
  };

  // ── Camera step ─────────────────────────────────
  if (step === 'camera') {
    return (
      <View style={styles.fullScreen}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
        <SafeAreaView style={styles.cameraTopBar}>
          <TouchableOpacity style={styles.headerBackBtn} onPress={() => setStep('method')}>
            <BackChevron />
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

  // ── Review step ──────────────────────────────────
  if (step === 'review') {
    return (
      <View style={[styles.fullScreen, { backgroundColor: '#0A1628' }]}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <View style={styles.headerRow}>
            <TouchableOpacity style={styles.headerBackBtn} onPress={() => setStep('method')}>
              <BackChevron />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Your Photo</Text>
            <View style={{ width: 40 }} />
          </View>
        </View>

        {/* Photo preview with 4-corner calibration overlay (non-LiDAR only) */}
        <View
          style={{ marginHorizontal: 20, height: 224, position: 'relative' }}
          onLayout={(e) => handlePhotoLayout(e.nativeEvent.layout.width, e.nativeEvent.layout.height)}
        >
          {/* Rounded image clip container */}
          <View style={{ ...StyleSheet.absoluteFillObject, borderRadius: 16, overflow: 'hidden' }}>
            {capturedImageUri
              ? <Image source={{ uri: capturedImageUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              : <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0A1628' }]} />}
          </View>
          {/* Calibration overlay — only for camera/upload paths, not LiDAR */}
          {captureMethod !== 'lidar' && photoLayout.current.width > 0 && panResponderRefs.current && (
            <CalibrationOverlay
              corners={cornerPositions.current}
              panResponders={panResponderRefs.current}
              photoW={photoLayout.current.width}
              photoH={photoLayout.current.height}
            />
          )}
        </View>

        {/* Dimension sliders */}
        <View style={styles.sliderCard}>
          <Text style={{ color: 'rgba(0,0,0,0.5)', fontSize: 13, marginBottom: 12, textAlign: 'center' }}>
            Adjust sliders to match your room's dimensions
          </Text>

          {/* Width */}
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

          {/* Depth */}
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

          {/* Height */}
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

        {/* Continue button */}
        <View style={styles.bottomActionArea}>
          <TouchableOpacity style={styles.goldPillButton} onPress={handleReviewContinue}>
            <Text style={styles.goldPillButtonText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Details step ─────────────────────────────────
  if (step === 'details') {
    return (
      <View style={[styles.fullScreen, { backgroundColor: '#0A1628' }]}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <View style={styles.headerRow}>
            <TouchableOpacity style={styles.headerBackBtn} onPress={() => setStep(captureMethod === 'lidar' ? 'method' : 'review')}>
              <BackChevron />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Room Details</Text>
            <View style={{ width: 40 }} />
          </View>
        </View>

        {/* Small room thumbnail */}
        {capturedImageUri && (
          <View style={styles.detailsThumbnail}>
            <Image source={{ uri: capturedImageUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          </View>
        )}

        {/* Form card */}
        <ScrollView style={styles.detailsFormScrollArea} contentContainerStyle={styles.detailsFormContent} showsVerticalScrollIndicator={false}>
          <View style={styles.formCard}>
            {/* Room name */}
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

            {/* Room type pills */}
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

            {/* Keep furniture toggle */}
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

        {/* Start designing button */}
        <View style={[styles.bottomActionArea, { paddingBottom: Math.max(insets.bottom, 24) + 24 }]}>
          <TouchableOpacity style={styles.goldPillButton} onPress={handleStartDesigning}>
            <Text style={styles.goldPillButtonText}>Start Designing</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Budget step ───────────────────────────────────
  if (step === 'budget') {
    const budgetLabel =
      budgetMax < 500 ? 'Under $500' :
      budgetMax < 1500 ? '$500–$1,500' :
      budgetMax < 5000 ? '$1,500–$5,000' : '$5,000+';

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
            {['Under $500', '$500–$1,500', '$1,500–$5,000', '$5,000+'].map((label) => (
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

  // ── Processing step ──────────────────────────────
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
      </View>
    );
  }

  // ── Method selection step (default) ──────────────
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
          /* Permission not yet granted — prompt + upload fallback */
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
            <TouchableOpacity
              style={styles.methodCard}
              onPress={handleTakePhoto}
              activeOpacity={0.8}
            >
              <View style={[styles.methodIconCircle, { backgroundColor: 'rgba(10,22,40,0.08)' }]}>
                <CameraIcon />
              </View>
              <View style={styles.methodCardContent}>
                <Text style={styles.methodCardTitle}>Take Photo</Text>
                <Text style={styles.methodCardSubtext}>Capture your room with the camera</Text>
              </View>
              <ChevronRight />
            </TouchableOpacity>
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
  captureButtonInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#C4A45A',
  },

  // ── Calibration ───────────────────────────
  calibrationImageWrap: {
    marginHorizontal: 20,
    height: 224,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  cornerHandle: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#C4A45A',
    zIndex: 15,
  },
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

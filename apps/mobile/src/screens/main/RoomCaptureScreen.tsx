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
  ActivityIndicator,
  Switch,
  TextInput,
  ScrollView,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import Slider from '@react-native-community/slider';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RoomStackParamList } from '../../navigation/RoomNavigator';
import { useRender } from '../../hooks/useRender';
import { useRoomPlan } from '../../hooks/useRoomPlan';
import { useAppStore } from '../../store';
import { supabase } from '../../lib/supabase';
import type { Room } from '@cova/shared';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Circle, Rect } from 'react-native-svg';

type CaptureStep = 'method' | 'camera' | 'review' | 'details' | 'processing' | 'choice';

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

type RoomTypeOption = 'living' | 'bedroom' | 'kitchen' | 'dining' | 'bathroom' | 'office' | 'other';

const ROOM_TYPES: { id: RoomTypeOption; label: string }[] = [
  { id: 'living', label: 'Living Room' },
  { id: 'bedroom', label: 'Bedroom' },
  { id: 'kitchen', label: 'Kitchen' },
  { id: 'dining', label: 'Dining' },
  { id: 'bathroom', label: 'Bathroom' },
  { id: 'office', label: 'Office' },
  { id: 'other', label: 'Other' },
];

export default function RoomCaptureScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RoomStackParamList>>();
  const insets = useSafeAreaInsets();
  const { startRender, renderProgressStage, renderProgress } = useRender();
  const { startScan, stopScan, isAvailable: isRoomPlanAvailable } = useRoomPlan();
  const currentRoom = useAppStore((s) => s.currentRoom);
  const setCurrentRoomDimensions = useAppStore((s) => s.setCurrentRoomDimensions);

  const [step, setStep] = useState<CaptureStep>('method');
  const [capturedImageUri, setCapturedImageUri] = useState<string | null>(null);
  const [cameraPermission, requestPermission] = useCameraPermissions();
  const [dimensions, setDimensions] = useState({ width: 4.9, depth: 3.7, height: 2.7 });
  const [scanning, setScanning] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [selectedRoomType, setSelectedRoomType] = useState<RoomTypeOption | null>(null);
  const [keepFurniture, setKeepFurniture] = useState(true);

  const cameraRef = useRef<CameraView>(null);
  const pulseAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    if (step === 'processing') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0.3, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
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
    if (!isRoomPlanAvailable) {
      Alert.alert(
        '3D Scanning Unavailable',
        '3D scanning requires iPhone 12 Pro or later with LiDAR. Please use a photo instead.',
      );
      return;
    }
    try {
      setScanning(true);
      const data = await startScan();
      setScanning(false);
      setDimensions({
        width: data.width,
        depth: data.depth,
        height: data.height,
      });
      setCurrentRoomDimensions({ width: data.width, depth: data.depth, height: data.height, unit: 'm' });
      setCapturedImageUri(null);
      setStep('processing');
    } catch (e: unknown) {
      setScanning(false);
      const message = e instanceof Error ? e.message : 'Could not complete the room scan.';
      if (message !== 'Scan cancelled') {
        Alert.alert('Scan Failed', message);
      }
    }
  };

  const handleReviewContinue = () => {
    setStep('details');
  };

  const handleStartDesigning = () => {
    setStep('processing');
  };

  const handleProcessCapture = async () => {
    try {
      if (!capturedImageUri) {
        setStep('choice');
        return;
      }

      useAppStore.getState().setCapturedImageUri(capturedImageUri);

      const compressed = await ImageManipulator.manipulateAsync(
        capturedImageUri,
        [{ resize: { width: 1024 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      if (!compressed.base64) {
        throw new Error('Image compression failed — no base64 output.');
      }
      const imageBase64 = `data:image/jpeg;base64,${compressed.base64}`;

      const blend = currentRoom?.style_blend ?? { coastal: 0.2, japandi: 0.2, bohemian: 0.2, mid_century: 0.2, minimalist: 0.2 };
      const roomType = (selectedRoomType ?? currentRoom?.room_type ?? 'living_room') as string;

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

      await startRender({
        roomId,
        roomType,
        styleBlend: blend,
        imageBase64,
        renderType: 'draft',
        dimensions: { width: dimensions.width, depth: dimensions.depth, height: dimensions.height, unit: 'm' },
      });
      setStep('choice');
    } catch (e) {
      console.error('handleProcessCapture failed:', e);
      Alert.alert('Error', 'Something went wrong. Please try again.');
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

        {/* Photo preview — read-only, no corner handles */}
        <View style={styles.calibrationImageWrap}>
          <Image source={{ uri: capturedImageUri! }} style={StyleSheet.absoluteFill} resizeMode="cover" />
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
            <TouchableOpacity style={styles.headerBackBtn} onPress={() => setStep('review')}>
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

  // ── Choice step ───────────────────────────────────
  if (step === 'choice') {
    const roomId = currentRoom?.id;
    return (
      <View style={[styles.fullScreen, { backgroundColor: '#0A1628', justifyContent: 'center', paddingHorizontal: 24 }]}>
        <Text style={{ color: 'white', fontSize: 26, fontWeight: '600', textAlign: 'center', marginBottom: 8 }}>
          ✨ Your room is ready
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 15, textAlign: 'center', marginBottom: 48 }}>
          How would you like to continue?
        </Text>

        {/* Primary — View AI Render */}
        <TouchableOpacity
          style={styles.choicePrimary}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('RenderView', { room_id: roomId, autoGenerate: true })}
        >
          <Text style={styles.choicePrimaryTitle}>View AI Render</Text>
          <Text style={styles.choicePrimarySubtext}>See your room reimagined</Text>
        </TouchableOpacity>

        {/* Secondary — Arrange Furniture */}
        <TouchableOpacity
          style={styles.choiceSecondary}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('Viewer3D', { room_id: roomId })}
        >
          <Text style={styles.choiceSecondaryTitle}>Arrange Furniture</Text>
          <Text style={styles.choiceSecondarySubtext}>Move pieces before rendering</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Method selection step (default) ──────────────
  return (
    <View style={[styles.fullScreen, { backgroundColor: '#0A1628' }]}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.headerBackBtn} onPress={() => navigation.goBack()}>
            <BackChevron />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Capture Your Room</Text>
          <View style={{ width: 40 }} />
        </View>
        <Text style={styles.headerSubtext}>Choose how to capture your space</Text>
      </View>

      <View style={styles.methodCards}>
        {/* 3D Scan card */}
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
              <Text style={styles.methodCardTitle}>3D Room Scan</Text>
              <Text style={styles.methodCardSubtext}>Best quality — iPhone 12 Pro and later</Text>
            </View>
            <ChevronRight />
          </TouchableOpacity>
        )}

        {/* Take photo card */}
        <TouchableOpacity
          style={styles.methodCard}
          onPress={handleTakePhoto}
          activeOpacity={0.8}
        >
          <View style={[styles.methodIconCircle, { backgroundColor: 'rgba(10,22,40,0.08)' }]}>
            <CameraIcon />
          </View>
          <View style={styles.methodCardContent}>
            <Text style={styles.methodCardTitle}>Take a Photo</Text>
            <Text style={styles.methodCardSubtext}>Capture your room with the camera</Text>
          </View>
          <ChevronRight />
        </TouchableOpacity>

        {/* Upload card */}
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

  // ── Choice step ────────────────────────────────
  choicePrimary: {
    backgroundColor: '#C47B3C',
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
  },
  choicePrimaryTitle: {
    color: '#0A1628',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  choicePrimarySubtext: {
    color: 'rgba(10,22,40,0.7)',
    fontSize: 14,
  },
  choiceSecondary: {
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 16,
    padding: 24,
  },
  choiceSecondaryTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 4,
  },
  choiceSecondarySubtext: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 14,
  },
});

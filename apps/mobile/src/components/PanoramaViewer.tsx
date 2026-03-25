import React, { useRef, useEffect, useState, memo } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  PanResponder,
  ActivityIndicator,
  Text,
  TouchableOpacity,
  type ViewStyle,
} from 'react-native';
import { Canvas, useFrame, useThree } from '@react-three/fiber/native';
import * as THREE from 'three';

// ── Tunable constant ──────────────────────────────────────────────────────────
// PAN_SENSITIVITY: 0.005 — increase for faster look-around, decrease for slower
const PAN_SENSITIVITY = 0.005;

// ── Camera state shape ────────────────────────────────────────────────────────
// ⚠️ ASSERTION: ALL values stored in useRef — NEVER useState.
// useState triggers re-renders that conflict with useFrame at 60fps.
interface CameraState {
  yaw: number;           // horizontal rotation (radians) — unclamped, full 360°
  pitch: number;         // vertical rotation (radians) — clamped −0.5 to +0.5
  fov: number;           // field of view (degrees) — clamped 40–90
  lastPinchDist: number | null;
  velocityYaw: number;   // momentum carry-over for yaw
  velocityPitch: number; // momentum carry-over for pitch
}

// ── SphereScene — inner R3F component, memo prevents needless re-renders ──────
interface SphereSceneProps {
  cameraState: React.MutableRefObject<CameraState>;
  texture: THREE.Texture | null;
}

const SphereScene = memo(function SphereScene({ cameraState, texture }: SphereSceneProps) {
  const { camera } = useThree();
  const meshRef = useRef<THREE.Mesh>(null);

  // Dispose geometry on unmount — prevents VRAM leaks
  useEffect(() => {
    return () => {
      if (meshRef.current) {
        meshRef.current.geometry.dispose();
      }
    };
  }, []);

  useFrame(() => {
    const s = cameraState.current;

    // ── Momentum decay (0.88 per frame) ─────────────────────────────────────
    if (Math.abs(s.velocityYaw) > 0.001 || Math.abs(s.velocityPitch) > 0.001) {
      s.yaw += s.velocityYaw;
      s.pitch = Math.max(-0.5, Math.min(0.5, s.pitch + s.velocityPitch));
      s.velocityYaw *= 0.88;
      s.velocityPitch *= 0.88;
      if (Math.abs(s.velocityYaw) < 0.001) s.velocityYaw = 0;
      if (Math.abs(s.velocityPitch) < 0.001) s.velocityPitch = 0;
    }

    // ── Camera rotation — YXZ order prevents gimbal lock ────────────────────
    camera.rotation.order = 'YXZ';
    camera.rotation.y = -s.yaw;
    camera.rotation.x = s.pitch;

    // ── FOV update (pinch zoom — camera position never changes) ─────────────
    const perspCam = camera as THREE.PerspectiveCamera;
    if (Math.abs(perspCam.fov - s.fov) > 0.01) {
      perspCam.fov = s.fov;
      perspCam.updateProjectionMatrix();
    }
  });

  return (
    // scale={[-1, 1, 1]} inverts normals so texture faces inward.
    // More stable on iOS than THREE.BackSide material flag.
    <mesh ref={meshRef} scale={[-1, 1, 1]}>
      <sphereGeometry args={[500, 60, 40]} />
      <meshBasicMaterial map={texture ?? undefined} />
    </mesh>
  );
});

// ── PanoramaViewer ────────────────────────────────────────────────────────────
export interface PanoramaViewerProps {
  imageUrl: string;
  pointerEnabled: boolean; // when false, PanResponder ignores all touches
  onTap: () => void;       // fired on single-tap with minimal movement (HUD toggle)
  onFallback?: () => void; // fired if Canvas fails to initialize
}

export default function PanoramaViewer({
  imageUrl,
  pointerEnabled,
  onTap,
  onFallback,
}: PanoramaViewerProps) {
  const [loadState, setLoadState] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [retryCount, setRetryCount] = useState(0);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  const canvasOpacity = useRef(new Animated.Value(0)).current;
  const textureRef = useRef<THREE.Texture | null>(null);

  // ⚠️ ASSERTION: ALL camera values in useRef — NEVER useState
  const cameraState = useRef<CameraState>({
    yaw: 0,
    pitch: 0,
    fov: 75,
    lastPinchDist: null,
    velocityYaw: 0,
    velocityPitch: 0,
  });

  // Per-gesture tracking refs
  const lastTouchXRef = useRef(0);
  const lastTouchYRef = useRef(0);
  const lastFrameDyawRef = useRef(0);
  const lastFrameDpitchRef = useRef(0);

  // Stable ref for onTap — avoids stale closure inside PanResponder.create
  const onTapRef = useRef(onTap);
  onTapRef.current = onTap;

  // ── Texture loading ─────────────────────────────────────────────────────────
  // Runs once per imageUrl; retryCount increments force a fresh attempt
  useEffect(() => {
    if (!imageUrl) return;
    setLoadState('loading');
    canvasOpacity.setValue(0);
    let cancelled = false;

    const loader = new THREE.TextureLoader();
    loader.load(
      imageUrl,
      (t) => {
        if (cancelled) { t.dispose(); return; }
        t.minFilter = THREE.LinearFilter;
        t.magFilter = THREE.LinearFilter;
        t.generateMipmaps = false;       // prevents iOS texture artifacts
        t.colorSpace = THREE.SRGBColorSpace; // preserves FLUX color accuracy (Three.js 0.152+ API)
        if (textureRef.current) textureRef.current.dispose();
        textureRef.current = t;
        setTexture(t);
        setLoadState('loaded');
        // Fade sphere in over 300ms — never show a blank sphere
        Animated.timing(canvasOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start();
      },
      undefined,
      () => { if (!cancelled) setLoadState('error'); },
    );

    return () => { cancelled = true; };
  }, [imageUrl, retryCount]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cleanup on unmount ──────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (textureRef.current) { textureRef.current.dispose(); textureRef.current = null; }
    };
  }, []);

  // ── PanResponder ────────────────────────────────────────────────────────────
  // ⚠️ ASSERTION: this View MUST be a SIBLING of the Canvas View — never parent/child
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,

      onPanResponderGrant: (evt) => {
        const touches = evt.nativeEvent.touches;
        // Stop momentum on new touch
        cameraState.current.velocityYaw = 0;
        cameraState.current.velocityPitch = 0;
        lastFrameDyawRef.current = 0;
        lastFrameDpitchRef.current = 0;

        if (touches.length >= 2) {
          const t1 = touches[0]; const t2 = touches[1];
          cameraState.current.lastPinchDist = Math.hypot(
            t1.pageX - t2.pageX,
            t1.pageY - t2.pageY,
          );
        } else if (touches.length === 1) {
          cameraState.current.lastPinchDist = null;
          lastTouchXRef.current = touches[0].pageX;
          lastTouchYRef.current = touches[0].pageY;
        }
      },

      onPanResponderMove: (evt) => {
        const touches = evt.nativeEvent.touches;

        if (touches.length >= 2) {
          // ── Pinch: zoom via FOV only — camera position never changes ────────
          const t1 = touches[0]; const t2 = touches[1];
          const dist = Math.hypot(t1.pageX - t2.pageX, t1.pageY - t2.pageY);
          const prev = cameraState.current.lastPinchDist;
          if (prev !== null && prev > 0) {
            const scale = dist / prev;
            cameraState.current.fov = Math.max(40, Math.min(90, cameraState.current.fov / scale));
          }
          // Update every move event — keeps delta incremental, prevents jumpy zoom
          cameraState.current.lastPinchDist = dist;
        } else if (touches.length === 1) {
          // ── Single finger: look around ────────────────────────────────────
          const tx = touches[0].pageX;
          const ty = touches[0].pageY;
          // Per-event delta from tracked position (not cumulative gestureState.dx)
          const deltaDx = tx - lastTouchXRef.current;
          const deltaDy = ty - lastTouchYRef.current;
          lastTouchXRef.current = tx;
          lastTouchYRef.current = ty;

          // SENSITIVITY: tune PAN_SENSITIVITY at top of file
          const dyaw = deltaDx * PAN_SENSITIVITY;
          const dpitch = deltaDy * PAN_SENSITIVITY;

          cameraState.current.yaw += dyaw;
          // Vertical: clamp −0.5 to +0.5 rad (~−28° to +28°) — prevents over-rotation
          cameraState.current.pitch = Math.max(-0.5, Math.min(0.5, cameraState.current.pitch + dpitch));

          lastFrameDyawRef.current = dyaw;
          lastFrameDpitchRef.current = dpitch;
        }
      },

      onPanResponderRelease: (_, gestureState) => {
        cameraState.current.lastPinchDist = null;

        // Tap: minimal movement → HUD toggle
        if (Math.abs(gestureState.dx) < 8 && Math.abs(gestureState.dy) < 8) {
          onTapRef.current();
          return;
        }

        // Momentum: continue at 60% of last delta, decaying 0.88 per frame
        cameraState.current.velocityYaw = lastFrameDyawRef.current * 0.6;
        cameraState.current.velocityPitch = lastFrameDpitchRef.current * 0.6;
      },

      onPanResponderTerminate: () => {
        cameraState.current.lastPinchDist = null;
      },
    }),
  ).current;

  if (!imageUrl) {
    return (
      <View style={styles.root}>
        <Text style={styles.msgText}>Render not available</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* ── Canvas (absoluteFill) — opacity 0 until texture loads ──────────── */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: canvasOpacity }]}>
        <Canvas
          style={StyleSheet.absoluteFill as ViewStyle}
          camera={{ fov: 75, near: 0.1, far: 1000, position: [0, 0, 0] }}
          gl={{
            powerPreference: 'high-performance',
            antialias: false,             // too expensive on mobile
            preserveDrawingBuffer: false, // not needed for panorama viewer
          }}
          onCreated={({ gl }) => {
            try {
              gl.setClearColor(0x0a1628);
            } catch {
              onFallback?.();
            }
          }}
        >
          <color attach="background" args={['#0A1628']} />
          <SphereScene cameraState={cameraState} texture={texture} />
        </Canvas>
      </Animated.View>

      {/* ── PanResponder View — absoluteFill SIBLING to Canvas View ────────── */}
      {/* ⚠️ ASSERTION: Must remain a sibling — never parent or child of Canvas */}
      <View
        style={StyleSheet.absoluteFill}
        {...panResponder.panHandlers}
        pointerEvents={pointerEnabled ? 'box-only' : 'none'}
      />

      {/* ── Loading spinner — visible until texture.onLoad fires ────────────── */}
      {loadState === 'loading' && (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator size="large" color="#C4A45A" />
        </View>
      )}

      {/* ── Error state — retry up to 2 times ─────────────────────────────── */}
      {loadState === 'error' && (
        <View style={styles.overlay}>
          <Text style={styles.msgText}>Could not load render</Text>
          <TouchableOpacity
            style={[styles.retryBtn, retryCount >= 2 && { opacity: 0.5 }]}
            onPress={() => setRetryCount((n) => n + 1)}
            disabled={retryCount >= 2}
          >
            <Text style={styles.retryBtnText}>{retryCount >= 2 ? 'Load failed' : 'Retry'}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A1628' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0A1628',
  },
  msgText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
    marginBottom: 16,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  retryBtn: {
    backgroundColor: '#C4A45A',
    borderRadius: 24,
    paddingHorizontal: 28,
    paddingVertical: 12,
  },
  retryBtnText: { color: '#0A1628', fontSize: 16, fontWeight: '600' },
});

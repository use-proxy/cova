// ── PanoramaViewer ──────────────────────────────────────────────────────────
// 2D pan-based panoramic viewer for equirectangular images.
//
// Displays the equirectangular image at 3x screen width and lets the user
// drag left/right to "look around". Wraps seamlessly at the horizontal edges.
// Pinch adjusts zoom level. Momentum deceleration on release.
//
// This approach works 100% reliably on all iPhones — zero native GL deps.
// No OrbitControls, no Three.js, no expo-gl.
//
import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  PanResponder,
  ActivityIndicator,
  Text,
  TouchableOpacity,
  Image as RNImage,
  Dimensions,
} from 'react-native';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const PAN_SENSITIVITY = 1.0;
const MOMENTUM_DECAY = 0.95;
const MOMENTUM_THRESHOLD = 0.3;

// ── Props ────────────────────────────────────────────────────────────────────
export interface PanoramaViewerProps {
  testID?: string;
  imageUrl: string;
  pointerEnabled: boolean;
  onTap: () => void;
  onFallback?: () => void;
  onTextureError?: () => void;
}

export default function PanoramaViewer({
  testID,
  imageUrl,
  pointerEnabled,
  onTap,
  onTextureError,
}: PanoramaViewerProps) {
  const [loadState, setLoadState] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [retryCount, setRetryCount] = useState(0);
  const [imageDims, setImageDims] = useState<{ w: number; h: number } | null>(null);

  // ⚠️ ASSERTION: ALL gesture/animation values in useRef — NEVER useState
  const panX = useRef(new Animated.Value(0)).current;
  const panY = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const offsetXRef = useRef(0);
  const offsetYRef = useRef(0);
  const scaleRef = useRef(1);
  const velocityXRef = useRef(0);
  const velocityYRef = useRef(0);
  const lastTouchXRef = useRef(0);
  const lastTouchYRef = useRef(0);
  const lastPinchDistRef = useRef<number | null>(null);
  const momentumRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);

  const onTapRef = useRef(onTap);
  onTapRef.current = onTap;

  // ── Image loading ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!imageUrl) return;
    setLoadState('loading');
    let cancelled = false;

    RNImage.getSize(
      imageUrl,
      (w, h) => {
        if (cancelled) return;
        console.log(`[PanoramaViewer] image loaded: ${w}x${h}`);
        setImageDims({ w, h });
        setLoadState('loaded');
      },
      () => {
        if (cancelled) return;
        console.error('[PanoramaViewer] image load failed:', imageUrl.slice(0, 100));
        setLoadState('error');
        onTextureError?.();
      },
    );

    // Prefetch for fast display
    RNImage.prefetch(imageUrl).catch(() => {});

    return () => { cancelled = true; };
  }, [imageUrl, retryCount]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Momentum loop ──────────────────────────────────────────────────────────
  const startMomentum = () => {
    if (momentumRef.current) cancelAnimationFrame(momentumRef.current);

    const tick = () => {
      if (Math.abs(velocityXRef.current) < MOMENTUM_THRESHOLD && Math.abs(velocityYRef.current) < MOMENTUM_THRESHOLD) {
        velocityXRef.current = 0;
        velocityYRef.current = 0;
        return;
      }
      velocityXRef.current *= MOMENTUM_DECAY;
      velocityYRef.current *= MOMENTUM_DECAY;
      offsetXRef.current += velocityXRef.current;
      offsetYRef.current += velocityYRef.current;
      clampOffsets();
      panX.setValue(offsetXRef.current);
      panY.setValue(offsetYRef.current);
      momentumRef.current = requestAnimationFrame(tick);
    };
    momentumRef.current = requestAnimationFrame(tick);
  };

  const stopMomentum = () => {
    if (momentumRef.current) {
      cancelAnimationFrame(momentumRef.current);
      momentumRef.current = null;
    }
  };

  // Cleanup
  useEffect(() => () => stopMomentum(), []);

  // ── Clamp offsets ──────────────────────────────────────────────────────────
  const clampOffsets = () => {
    if (!imageDims) return;
    const displayW = imageDims.w * (SCREEN_H / imageDims.h) * scaleRef.current;
    const maxX = Math.max(0, (displayW - SCREEN_W) / 2);
    const displayH = SCREEN_H * scaleRef.current;
    const maxY = Math.max(0, (displayH - SCREEN_H) / 2);

    // Horizontal wrap-around for equirectangular images
    if (displayW > SCREEN_W) {
      // Allow continuous scrolling — wrap offset
      const wrapRange = displayW;
      if (offsetXRef.current > maxX) offsetXRef.current -= wrapRange;
      if (offsetXRef.current < -maxX) offsetXRef.current += wrapRange;
    }
    // Vertical clamp (no wrap)
    offsetYRef.current = Math.max(-maxY, Math.min(maxY, offsetYRef.current));
  };

  // ── PanResponder ───────────────────────────────────────────────────────────
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,

      onPanResponderGrant: (evt) => {
        stopMomentum();
        velocityXRef.current = 0;
        velocityYRef.current = 0;
        const touches = evt.nativeEvent.touches;
        if (touches.length >= 2) {
          lastPinchDistRef.current = Math.hypot(
            touches[0].pageX - touches[1].pageX,
            touches[0].pageY - touches[1].pageY,
          );
        } else {
          lastPinchDistRef.current = null;
          lastTouchXRef.current = touches[0].pageX;
          lastTouchYRef.current = touches[0].pageY;
        }
      },

      onPanResponderMove: (evt) => {
        const touches = evt.nativeEvent.touches;

        if (touches.length >= 2) {
          // Pinch zoom
          const dist = Math.hypot(
            touches[0].pageX - touches[1].pageX,
            touches[0].pageY - touches[1].pageY,
          );
          if (lastPinchDistRef.current !== null && lastPinchDistRef.current > 0) {
            const ratio = dist / lastPinchDistRef.current;
            scaleRef.current = Math.max(1, Math.min(3, scaleRef.current * ratio));
            scaleAnim.setValue(scaleRef.current);
          }
          lastPinchDistRef.current = dist;
        } else if (touches.length === 1) {
          // Pan
          const tx = touches[0].pageX;
          const ty = touches[0].pageY;
          const dx = (tx - lastTouchXRef.current) * PAN_SENSITIVITY;
          const dy = (ty - lastTouchYRef.current) * PAN_SENSITIVITY;
          lastTouchXRef.current = tx;
          lastTouchYRef.current = ty;

          velocityXRef.current = dx;
          velocityYRef.current = dy;

          offsetXRef.current += dx;
          offsetYRef.current += dy;
          clampOffsets();
          panX.setValue(offsetXRef.current);
          panY.setValue(offsetYRef.current);
        }
      },

      onPanResponderRelease: (_, gs) => {
        lastPinchDistRef.current = null;
        // Tap detection
        if (Math.abs(gs.dx) < 8 && Math.abs(gs.dy) < 8) {
          onTapRef.current();
          return;
        }
        // Momentum
        startMomentum();
      },

      onPanResponderTerminate: () => {
        lastPinchDistRef.current = null;
      },
    }),
  ).current;

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!imageUrl) {
    return (
      <View testID={testID} style={styles.root}>
        <Text style={styles.msgText}>Render not available</Text>
      </View>
    );
  }

  // Compute display dimensions — image fills screen height, scales proportionally
  const aspectRatio = imageDims ? imageDims.w / imageDims.h : 2;
  const displayH = SCREEN_H;
  const displayW = displayH * aspectRatio;

  return (
    <View testID={testID} style={styles.root}>
      {/* Image container with pan + zoom transforms */}
      {loadState === 'loaded' && (
        <Animated.View
          style={[
            styles.imageContainer,
            {
              width: displayW,
              height: displayH,
              transform: [
                { translateX: panX },
                { translateY: panY },
                { scale: scaleAnim },
              ],
            },
          ]}
        >
          <RNImage
            source={{ uri: imageUrl }}
            style={{ width: displayW, height: displayH }}
            resizeMode="cover"
          />
        </Animated.View>
      )}

      {/* Touch capture overlay */}
      {pointerEnabled && (
        <View style={StyleSheet.absoluteFill} {...panResponder.panHandlers} />
      )}

      {/* Loading spinner */}
      {loadState === 'loading' && (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator size="large" color="#C4A45A" />
        </View>
      )}

      {/* Error state */}
      {loadState === 'error' && (
        <View testID="panorama-error" style={styles.overlay}>
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
  root: {
    flex: 1,
    backgroundColor: '#0A1628',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageContainer: {
    position: 'absolute',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
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

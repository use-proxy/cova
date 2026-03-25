import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Sentry, logProductDeviation, setCurrentScreen, setFlowStep, setRenderState } from '../../lib/sentry';
import {
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  Dimensions,
  Animated,
  PanResponder,
  Share,
  Easing,
  FlatList,
  Image,
  Modal,
  Alert,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';
import Svg, { Path, Circle as SvgCircle, Line, Polyline } from 'react-native-svg';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import Slider from '@react-native-community/slider';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RoomStackParamList } from '../../navigation/RoomNavigator';
import { useRender } from '../../hooks/useRender';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store';
import BeforeAfterSlider from '../../components/BeforeAfterSlider';
import PanoramaViewer from '../../components/PanoramaViewer';
import ChatPanel from '../../components/ChatPanel';
import type { Product } from '@cova/shared';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const BG = '#0A1628';
const GOLD = '#C4A45A';

function getTouchDistance(touches: { pageX: number; pageY: number }[]): number {
  const dx = touches[0].pageX - touches[1].pageX;
  const dy = touches[0].pageY - touches[1].pageY;
  return Math.sqrt(dx * dx + dy * dy);
}

function clampTranslate(tx: number, ty: number, scale: number): { x: number; y: number } {
  const maxX = (SCREEN_WIDTH * (scale - 1)) / 2;
  const maxY = (SCREEN_HEIGHT * (scale - 1)) / 2;
  return {
    x: Math.max(-maxX, Math.min(maxX, tx)),
    y: Math.max(-maxY, Math.min(maxY, ty)),
  };
}

// §8.3 — 4 stages per PRODUCT_TRUTH
const LOADING_STAGES = [
  'Analyzing your room',
  'Applying your style',
  'Generating',
  'Done',
];

function RenderViewScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RoomStackParamList>>();
  const route = useRoute<RouteProp<RoomStackParamList, 'RenderView'>>();
  const insets = useSafeAreaInsets();

  const { startRender, pollRenderStatus, renderStatus, renderProgressStage, renderProgress, renderError, currentRender } = useRender();
  const { matchedProducts, addToCart, cartItems, setRenderStatus, currentRoom, capturedImageUri, budget_max } = useAppStore();

  // route.params.room_id is only populated when navigating directly within RoomNavigator.
  // When arriving via HomeStack's nested Room screen, room_id is in the parent route and
  // not forwarded — fall back to currentRoom.id (always set before navigation).
  const room_id = route.params?.room_id ?? currentRoom?.id ?? 'default';
  const autoGenerate = route.params?.autoGenerate ?? false;

  const [showControls, setShowControls] = useState(true);
  const [showBeforeAfter, setShowBeforeAfter] = useState(false);
  // ⚠️ viewModeRef: useRef not useState — mode changes must not trigger 60fps re-renders.
  // forceUpdate is only called on deliberate user toggle, not on every frame.
  const viewModeRef = useRef<'immersive' | 'flat'>('immersive');
  const [, forceUpdate] = useState(0);
  const [showProductPanel, setShowProductPanel] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [similarCategory, setSimilarCategory] = useState<string | null>(null);
  const [budgetOverride, setBudgetOverride] = useState<number | null>(null);
  const [showBudgetSlider, setShowBudgetSlider] = useState(false);
  const [tapCoords, setTapCoords] = useState<{ x: number; y: number } | null>(null);
  const [localStageIndex, setLocalStageIndex] = useState(0);

  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const imageDimsRef = useRef({ width: SCREEN_WIDTH, height: SCREEN_HEIGHT });
  const panOffset = useRef(new Animated.ValueXY()).current;
  const scaleVal = useRef(new Animated.Value(1)).current;
  const controlsOpacity = useRef(new Animated.Value(1)).current;

  const scaleRef = useRef(1);
  const translateXRef = useRef(0);
  const translateYRef = useRef(0);
  const pinchStartDistRef = useRef(0);
  const isPinchingRef = useRef(false);
  const panStartXRef = useRef(0);
  const panStartYRef = useRef(0);
  const productPanelX = useRef(new Animated.Value(-SCREEN_WIDTH * 0.75)).current;
  const pulseOpacity = useRef(new Animated.Value(0.4)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const hasAutoStartedRef = useRef(false);
  const hasAttemptedRecoveryRef = useRef(false);

  const roomBudgetDollars = budget_max;
  const activeBudgetDollars = budgetOverride ?? roomBudgetDollars;

  const filteredProducts = useMemo(() => {
    const maxCents = activeBudgetDollars * 100;
    return matchedProducts.filter((p) => p.price <= maxCents);
  }, [matchedProducts, activeBudgetDollars]);

  const similarProducts = useMemo(() => {
    if (!similarCategory) return [];
    return matchedProducts.filter((p) => p.category === similarCategory);
  }, [matchedProducts, similarCategory]);

  // Register screen context for Sentry
  useEffect(() => {
    setCurrentScreen('RenderViewScreen');
    setFlowStep('render');
  }, []);

  // Mirror render pipeline status into Sentry tags
  useEffect(() => {
    if (renderStatus === 'processing') {
      setRenderState('rendering');
    } else if (renderStatus === 'failed') {
      setRenderState('failed');
      // FEATURE_6 CRITICAL: render must appear after room capture
      logProductDeviation(
        'FEATURE_6',
        'After room capture → automatic first render generated immediately, no button needed',
        `Render pipeline entered failed state — render never appeared for the user`,
        'CRITICAL_DEVIATION',
      );
    } else {
      setRenderState('idle');
    }
  }, [renderStatus]);

  // FEATURE_6 check: before/after slider must never show the same image on both sides
  useEffect(() => {
    const beforeUrl = currentRoom?.original_image_url;
    const afterUrl = currentRender?.image_url;
    if (beforeUrl && afterUrl && beforeUrl === afterUrl) {
      logProductDeviation(
        'FEATURE_6',
        'Before/after slider: LEFT = original room photo, RIGHT = AI render — never the same image on both sides',
        'original_image_url and render image_url are identical — both slider sides show the same image',
        'HIGH_DEVIATION',
      );
    }
  }, [currentRoom?.original_image_url, currentRender?.image_url]);

  // Cycle loading stage text when store stage is empty
  useEffect(() => {
    if (renderStatus !== 'processing') return;
    const iv = setInterval(() => setLocalStageIndex((p) => (p + 1) % LOADING_STAGES.length), 1500);
    return () => clearInterval(iv);
  }, [renderStatus]);

  // On mount: attempt to recover an in-progress render for this room (e.g. after force-quit).
  // If a processing render row exists, resume polling. Sets hasAttemptedRecoveryRef when done
  // so the goBack effect knows it is safe to navigate away if nothing was found.
  useEffect(() => {
    if (hasAttemptedRecoveryRef.current) return;
    if (currentRender) { hasAttemptedRecoveryRef.current = true; return; }
    const roomId = route.params?.room_id ?? currentRoom?.id;
    if (!roomId) { hasAttemptedRecoveryRef.current = true; return; }
    void (async () => {
      try {
        const { data } = await supabase
          .from('renders')
          .select('id, replicate_prediction_id, room_id')
          .eq('room_id', roomId)
          .eq('status', 'processing')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        if (data?.id) {
          const roomType = currentRoom?.room_type ?? 'living_room';
          const styleBlend = currentRoom?.style_blend ?? { coastal: 0.2, japandi: 0.2, bohemian: 0.2, mid_century: 0.2, minimalist: 0.2 };
          const budget = budget_max ?? 2500;
          pollRenderStatus(data.id, roomType, styleBlend, budget);
        }
      } catch { /* no processing render found — proceed normally */ }
      hasAttemptedRecoveryRef.current = true;
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — runs once on mount only

  // Navigate away only when idle with no render loaded, not auto-generating, and recovery has been attempted
  useEffect(() => {
    if (autoGenerate) return;
    if (!hasAttemptedRecoveryRef.current) return;
    if (renderStatus === 'idle' && !currentRender) navigation.goBack();
  }, [renderStatus, currentRender, navigation, autoGenerate]);

  // Auto-generate first render when arriving from room capture (autoGenerate=true).
  // hasAutoStartedRef prevents double-firing if the effect re-runs.
  useEffect(() => {
    if (!autoGenerate) return;
    if (hasAutoStartedRef.current) return;
    if (currentRender) return;
    hasAutoStartedRef.current = true;
    const blend = currentRoom?.style_blend ?? { coastal: 0.2, japandi: 0.2, bohemian: 0.2, mid_century: 0.2, minimalist: 0.2 };
    void (async () => {
      let imageBase64 = '';
      if (capturedImageUri) {
        try {
          const compressed = await ImageManipulator.manipulateAsync(
            capturedImageUri,
            [{ resize: { width: 1024 } }],
            { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
          );
          const raw = await FileSystem.readAsStringAsync(compressed.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          imageBase64 = `data:image/jpeg;base64,${raw}`;
        } catch { /* capturedImageUri inaccessible — proceed without image */ }
      }
      startRender({
        roomId: room_id,
        roomType: currentRoom?.room_type ?? 'living_room',
        styleBlend: blend,
        imageBase64,
        renderType: 'draft',
      });
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — fires once on mount only

  // Pulse animation for loading circles
  useEffect(() => {
    if (renderStatus === 'processing') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseOpacity, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: 0.4, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      ).start();
    }
  }, [renderStatus, pulseOpacity]);

  // Animate progress bar
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: renderProgress,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [renderProgress, progressAnim]);

  // Controls auto-hide
  const resetControlsTimer = useCallback(() => {
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    controlsOpacity.setValue(1);
    setShowControls(true);
    controlsTimer.current = setTimeout(() => {
      Animated.timing(controlsOpacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => setShowControls(false));
    }, 3000);
  }, [controlsOpacity]);

  useEffect(() => {
    if (renderStatus === 'completed') resetControlsTimer();
    return () => { if (controlsTimer.current) clearTimeout(controlsTimer.current); };
  }, [renderStatus, resetControlsTimer]);

  // Pan + pinch responder for completed image
  const imagePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (e, gs) =>
        e.nativeEvent.touches.length >= 2 ||
        Math.abs(gs.dx) > 5 ||
        Math.abs(gs.dy) > 5,

      onPanResponderGrant: (e) => {
        const touches = e.nativeEvent.touches;
        panStartXRef.current = translateXRef.current;
        panStartYRef.current = translateYRef.current;
        isPinchingRef.current = false;
        if (touches.length >= 2) {
          isPinchingRef.current = true;
          pinchStartDistRef.current = getTouchDistance(touches as { pageX: number; pageY: number }[]);
        }
      },

      onPanResponderMove: (e, gs) => {
        const touches = e.nativeEvent.touches;

        if (touches.length >= 2) {
          // Pinch
          isPinchingRef.current = true;
          if (pinchStartDistRef.current === 0) {
            pinchStartDistRef.current = getTouchDistance(touches as { pageX: number; pageY: number }[]);
            return;
          }
          const currentDist = getTouchDistance(touches as { pageX: number; pageY: number }[]);
          const rawScale = scaleRef.current * (currentDist / pinchStartDistRef.current);
          const newScale = Math.max(1.0, Math.min(2.5, rawScale));
          // FEATURE_6 check: zoom must stay within [1×, 2.5×]; NaN/Infinity means pinch gesture broke
          if (!Number.isFinite(rawScale) || rawScale !== rawScale) {
            logProductDeviation(
              'FEATURE_6',
              'Pinch = zoom in/out, min 1x, max 2.5x',
              `Pinch zoom produced invalid scale (${rawScale}) — gesture likely broken; pinchStartDistRef may be zero`,
              'HIGH_DEVIATION',
            );
          }
          scaleVal.setValue(newScale);
          const clamped = clampTranslate(translateXRef.current, translateYRef.current, newScale);
          panOffset.setValue(clamped);
          translateXRef.current = clamped.x;
          translateYRef.current = clamped.y;
          // ⚠️ Update pinchStartDistRef each move to keep delta incremental (prevents jumpy zoom — §15.1)
          pinchStartDistRef.current = currentDist;
          scaleRef.current = newScale;
        } else if (touches.length === 1) {
          // Single-finger pan
          if (isPinchingRef.current) return; // skip pan frame immediately after lifting second finger
          const newTX = panStartXRef.current + gs.dx;
          const newTY = panStartYRef.current + gs.dy;
          const clamped = clampTranslate(newTX, newTY, scaleRef.current);
          panOffset.setValue(clamped);
          translateXRef.current = clamped.x;
          translateYRef.current = clamped.y;
        }
      },

      onPanResponderRelease: (e, gs) => {
        isPinchingRef.current = false;
        pinchStartDistRef.current = 0;

        // Snap to center if scale is back at 1
        if (scaleRef.current <= 1.001) {
          scaleRef.current = 1.0;
          scaleVal.setValue(1.0);
          panOffset.setValue({ x: 0, y: 0 });
          translateXRef.current = 0;
          translateYRef.current = 0;
        }

        // Tap detection — preserved for HUD toggle (single touch, minimal movement)
        if (e.nativeEvent.touches.length === 0 && Math.abs(gs.dx) < 5 && Math.abs(gs.dy) < 5) {
          if (showControls) {
            Animated.timing(controlsOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setShowControls(false));
          } else {
            resetControlsTimer();
          }
        }
      },
    }),
  ).current;

  const toggleProductPanel = (show: boolean) => {
    setShowProductPanel(show);
    Animated.timing(productPanelX, {
      toValue: show ? 0 : -SCREEN_WIDTH * 0.75,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const handleSave = async () => {
    if (!currentRender?.image_url) return;
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission required', 'Camera roll access is needed to save.'); return; }
    try {
      // saveToLibraryAsync requires a local file URI — download signed URL first
      const localUri = `${FileSystem.cacheDirectory}render_${Date.now()}.jpg`;
      const { uri } = await FileSystem.downloadAsync(currentRender.image_url, localUri);
      await MediaLibrary.saveToLibraryAsync(uri);
      Alert.alert('Saved', 'Saved to camera roll');
    } catch { Alert.alert('Error', 'Could not save image'); }
  };

  const handleShare = async () => {
    if (!currentRender?.image_url) return;
    try {
      await Share.share({ url: currentRender.image_url, message: 'Check out my room design from Cova' });
    } catch { /* cancelled */ }
  };

  const handleRegenerate = async () => {
    const blend = currentRoom?.style_blend ?? { coastal: 0.2, japandi: 0.2, bohemian: 0.2, mid_century: 0.2, minimalist: 0.2 };
    let imageBase64 = '';
    // Re-read the original captured image as base64 for the render pipeline
    if (capturedImageUri) {
      try {
        const compressed = await ImageManipulator.manipulateAsync(
          capturedImageUri,
          [{ resize: { width: 1024 } }],
          { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
        );
        const raw = await FileSystem.readAsStringAsync(compressed.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        imageBase64 = `data:image/jpeg;base64,${raw}`;
      } catch {
        // capturedImageUri no longer accessible (e.g. returning user); send empty
      }
    }
    startRender({
      roomId: room_id,
      roomType: currentRoom?.room_type ?? 'living_room',
      styleBlend: blend,
      imageBase64,
      renderType: 'draft',
    });
  };

  const handleAddAllToCart = useCallback(() => {
    const existing = new Set(cartItems.map((c) => c.id));
    filteredProducts.forEach((p) => {
      if (!existing.has(p.id)) addToCart({ id: p.id, product: p, quantity: 1, added_at: new Date().toISOString() });
    });
  }, [filteredProducts, cartItems, addToCart]);

  const handleImageLayout = useCallback((e: LayoutChangeEvent) => {
    imageDimsRef.current = { width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height };
  }, []);

  const handleImageTap = useCallback((e: GestureResponderEvent) => {
    const { locationX, locationY } = e.nativeEvent;
    const { width, height } = imageDimsRef.current;
    if (width > 0 && height > 0) setTapCoords({ x: (locationX / width) * 100, y: (locationY / height) * 100 });
  }, []);

  // Tap from sphere PanResponder — mirrors flat-image tap handling for HUD toggle
  const handlePanoramaTap = useCallback(() => {
    if (showControls) {
      Animated.timing(controlsOpacity, { toValue: 0, duration: 200, useNativeDriver: true })
        .start(() => setShowControls(false));
    } else {
      resetControlsTimer();
    }
  }, [showControls, controlsOpacity, resetControlsTimer]);

  const handleToggleViewMode = useCallback(() => {
    viewModeRef.current = viewModeRef.current === 'immersive' ? 'flat' : 'immersive';
    forceUpdate((n) => n + 1);
  }, []);

  const stageText = renderProgressStage || LOADING_STAGES[localStageIndex];
  const formatPrice = (p: number) => `$${p.toLocaleString()}`;
  const formatBudget = (b: number) => `$${b.toLocaleString()}`;

  const renderProductCard = ({ item }: { item: Product }) => (
    <View style={styles.productCard}>
      <Image source={{ uri: item.image_url }} style={styles.productImage} resizeMode="cover" />
      <View style={styles.productInfo}>
        <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
        <Text style={styles.productPrice}>{formatPrice(item.price)}</Text>
        <Text style={styles.productRetailer}>{item.retailer}</Text>
        <View style={styles.productActions}>
          <TouchableOpacity style={styles.addToCartBtn} onPress={() => addToCart({ id: item.id, product: item, quantity: 1, added_at: new Date().toISOString() })}>
            <Text style={styles.addToCartText}>Add to Cart</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.viewSimilarBtn} onPress={() => setSimilarCategory(item.category)}>
            <Text style={styles.viewSimilarText}>View Similar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  // ═══════════════════════════════
  // Loading state
  // ═══════════════════════════════
  if (renderStatus === 'processing') {
    return (
      <View style={styles.root}>
        {/* Top bar */}
        <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.topBarBtn} onPress={() => { setRenderStatus('idle'); navigation.goBack(); }}>
            <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
              <Path d="M15 18l-6-6 6-6" stroke="white" strokeWidth={2} />
            </Svg>
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>{currentRoom?.name ?? 'Room'}</Text>
          <View style={styles.tokenPill}>
            <View style={styles.tokenDot} />
            <Text style={styles.tokenText}>999</Text>
          </View>
        </View>

        {/* Pulsing loader */}
        <View style={styles.loaderCenter}>
          <View style={{ width: 80, height: 80, alignItems: 'center', justifyContent: 'center' }}>
            <Animated.View style={[styles.pulseOuter, { opacity: pulseOpacity }]} />
            <View style={styles.pulseInner} />
          </View>
          <Text style={styles.stageText}>{stageText}</Text>
          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressFill, { width: progressAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) }]} />
          </View>
        </View>
      </View>
    );
  }

  // ═══════════════════════════════
  // Error state
  // ═══════════════════════════════
  if (renderStatus === 'failed') {
    return (
      <View style={[styles.root, styles.centerContent]}>
        <Text style={styles.errorText}>{renderError ?? 'Something went wrong.'}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={handleRegenerate}>
          <Text style={styles.retryBtnText}>Try Again</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.backLink} onPress={() => navigation.goBack()}>
          <Text style={styles.backLinkText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ═══════════════════════════════
  // Completed render
  // ═══════════════════════════════
  return (
    <View testID="render-view-screen" style={styles.root}>
      {/* ── Flat image base layer ─────────────────────────────────────────────── */}
      {/* Always rendered as a base layer. In immersive mode it sits behind the   */}
      {/* panorama sphere — if the sphere texture fails (e.g. Simulator), this    */}
      {/* flat image shows through as a fallback. In flat mode it's the primary.  */}
      <View
        style={StyleSheet.absoluteFill}
        pointerEvents={viewModeRef.current === 'flat' ? 'box-none' : 'none'}
        onLayout={handleImageLayout}
      >
        <TouchableWithoutFeedback onPress={handleImageTap}>
          <View style={StyleSheet.absoluteFill}>
            {currentRender?.image_url ? (
              <Animated.Image
                testID="render-flat-image"
                source={{ uri: currentRender.image_url }}
                style={[StyleSheet.absoluteFill, viewModeRef.current === 'flat'
                  ? { transform: [...panOffset.getTranslateTransform(), { scale: scaleVal }] }
                  : undefined]}
                resizeMode="cover"
                {...(viewModeRef.current === 'flat' ? imagePanResponder.panHandlers : {})}
              />
            ) : (
              <View style={[StyleSheet.absoluteFill, styles.renderUnavailable]}>
                <Text style={styles.renderUnavailableText}>Render not available</Text>
                <TouchableOpacity style={styles.retryBtn} onPress={handleRegenerate}>
                  <Text style={styles.retryBtnText}>Regenerate</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </TouchableWithoutFeedback>
      </View>

      {/* ── Immersive sphere viewer (Mode 1 — default) ─────────────────────── */}
      {/* Overlays the flat image. When sphere texture renders, it covers the    */}
      {/* flat image. If it fails, the flat image shows through as fallback.     */}
      {viewModeRef.current === 'immersive' && currentRender?.image_url ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <PanoramaViewer
            testID="panorama-viewer"
            imageUrl={currentRender.image_url}
            pointerEnabled={viewModeRef.current === 'immersive'}
            onTap={handlePanoramaTap}
            onFallback={() => {
              // Canvas failed to initialize — switch to flat view
              viewModeRef.current = 'flat';
              forceUpdate((n) => n + 1);
            }}
            onTextureError={() => {
              // Texture loading failed — switch to flat view (works on Simulator)
              viewModeRef.current = 'flat';
              forceUpdate((n) => n + 1);
            }}
          />
        </View>
      ) : null}

      {/* Tap pin */}
      {tapCoords && (
        <View style={[styles.tapPin, { left: (tapCoords.x / 100) * imageDimsRef.current.width - 12, top: (tapCoords.y / 100) * imageDimsRef.current.height - 24 }]} pointerEvents="none">
          <Text style={{ fontSize: 24 }}>📍</Text>
        </View>
      )}

      {/* ── Top safe-area bar ── */}
      {showControls && (
        <Animated.View testID="hud-container" style={[styles.topBar, { paddingTop: insets.top + 12, opacity: controlsOpacity, backgroundColor: 'rgba(10,22,40,0.85)' }]} pointerEvents="box-none">
          <TouchableOpacity testID="back-button" style={styles.topBarBtn} onPress={() => navigation.goBack()}>
            <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
              <Path d="M15 18l-6-6 6-6" stroke="white" strokeWidth={2} />
            </Svg>
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>{currentRoom?.name ?? 'Room'}</Text>
          <View style={styles.tokenPill}>
            <View style={styles.tokenDot} />
            <Text style={styles.tokenText}>999</Text>
          </View>
        </Animated.View>
      )}

      {/* ── Left edge pull tab ── */}
      {!showProductPanel && (
        <TouchableOpacity style={styles.pullTab} onPress={() => toggleProductPanel(true)} />
      )}

      {/* ── Floating chat bubble ── */}
      {!showChat && !showProductPanel && (
        <TouchableOpacity testID="chat-fab" style={styles.chatFab} activeOpacity={0.85} onPress={() => setShowChat(true)}>
          <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
            <Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke={BG} strokeWidth={2} />
          </Svg>
        </TouchableOpacity>
      )}

      {/* ── Bottom action bar ── */}
      {showControls && (
        <Animated.View style={[styles.bottomBar, { opacity: controlsOpacity }]}>
          <View style={styles.bottomBarRow}>
            {/* Save */}
            <TouchableOpacity style={styles.barAction} onPress={handleSave}>
              <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
                <Path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" stroke="white" strokeWidth={1.5} />
                <Polyline points="17,21 17,13 7,13 7,21" stroke="white" strokeWidth={1.5} fill="none" />
                <Polyline points="7,3 7,8 15,8" stroke="white" strokeWidth={1.5} fill="none" />
              </Svg>
              <Text style={styles.barLabel}>Save</Text>
            </TouchableOpacity>

            {/* Share */}
            <TouchableOpacity style={styles.barAction} onPress={handleShare}>
              <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
                <SvgCircle cx={18} cy={5} r={3} stroke="white" strokeWidth={1.5} />
                <SvgCircle cx={6} cy={12} r={3} stroke="white" strokeWidth={1.5} />
                <SvgCircle cx={18} cy={19} r={3} stroke="white" strokeWidth={1.5} />
                <Line x1={8.59} y1={13.51} x2={15.42} y2={17.49} stroke="white" strokeWidth={1.5} />
                <Line x1={15.41} y1={6.51} x2={8.59} y2={10.49} stroke="white" strokeWidth={1.5} />
              </Svg>
              <Text style={styles.barLabel}>Share</Text>
            </TouchableOpacity>

            {/* Regenerate */}
            <TouchableOpacity style={styles.regenBtn} activeOpacity={0.85} onPress={handleRegenerate}>
              <Text style={styles.regenBtnText}>Regenerate</Text>
            </TouchableOpacity>

            {/* Arrange Furniture — navigate to 3D viewer */}
            <TouchableOpacity style={styles.barAction} onPress={() => navigation.navigate('Viewer3D', { room_id })}>
              <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
                <Path d="M12 2L2 7l10 5 10-5-10-5z" stroke="white" strokeWidth={1.5} fill="none" />
                <Path d="M2 17l10 5 10-5" stroke="white" strokeWidth={1.5} fill="none" />
                <Path d="M2 12l10 5 10-5" stroke="white" strokeWidth={1.5} fill="none" />
              </Svg>
              <Text style={styles.barLabel}>Arrange</Text>
            </TouchableOpacity>

            {/* Chat */}
            <TouchableOpacity style={styles.barAction} onPress={() => setShowChat(true)}>
              <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
                <Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="white" strokeWidth={1.5} />
              </Svg>
              <Text style={styles.barLabel}>Chat</Text>
            </TouchableOpacity>

            {/* Shop */}
            <TouchableOpacity style={styles.barAction} onPress={() => toggleProductPanel(true)}>
              <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
                <Path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" stroke="white" strokeWidth={1.5} />
                <Line x1={3} y1={6} x2={21} y2={6} stroke="white" strokeWidth={1.5} />
                <Path d="M16 10a4 4 0 0 1-8 0" stroke="white" strokeWidth={1.5} />
              </Svg>
              <Text style={styles.barLabel}>Shop</Text>
            </TouchableOpacity>

            {/* Compare (before/after) — only shown when original image exists */}
            {!!currentRoom?.original_image_url && (
              <TouchableOpacity style={styles.barAction} onPress={() => setShowBeforeAfter((v) => !v)}>
                <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
                  <Line x1={12} y1={3} x2={12} y2={21} stroke={showBeforeAfter ? '#C4A45A' : 'white'} strokeWidth={2} />
                  <Path d="M8 7l-4 5 4 5" stroke={showBeforeAfter ? '#C4A45A' : 'white'} strokeWidth={1.5} fill="none" />
                  <Path d="M16 7l4 5-4 5" stroke={showBeforeAfter ? '#C4A45A' : 'white'} strokeWidth={1.5} fill="none" />
                </Svg>
                <Text style={[styles.barLabel, showBeforeAfter && { color: '#C4A45A' }]}>Compare</Text>
              </TouchableOpacity>
            )}

            {/* View mode toggle */}
            <TouchableOpacity style={styles.barAction} onPress={handleToggleViewMode}>
              <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
                {viewModeRef.current === 'immersive' ? (
                  // Icon for "switch to 2D" — a flat image frame
                  <Path d="M3 3h18v18H3z M3 9h18 M3 15h18" stroke="white" strokeWidth={1.5} fill="none" />
                ) : (
                  // Icon for "switch to Immersive" — a sphere/globe
                  <>
                    <SvgCircle cx={12} cy={12} r={9} stroke="white" strokeWidth={1.5} />
                    <Path d="M12 3c-2 4-2 14 0 18M12 3c2 4 2 14 0 18M3 12h18" stroke="white" strokeWidth={1.5} />
                  </>
                )}
              </Svg>
              <Text style={styles.barLabel}>
                {viewModeRef.current === 'immersive' ? '2D View' : 'Immersive'}
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}

      {/* ── Product panel ── */}
      <Animated.View style={[styles.productPanel, { transform: [{ translateX: productPanelX }] }]}>
        <View style={[styles.ppHeader, { paddingTop: insets.top + 12 }]}>
          <Text style={styles.ppTitle}>Matched Products</Text>
          <TouchableOpacity onPress={() => toggleProductPanel(false)}>
            <Text style={styles.ppClose}>✕</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.budgetRow}>
          <Text style={styles.budgetLabel}>Budget: {formatBudget(activeBudgetDollars)}</Text>
          <TouchableOpacity onPress={() => setShowBudgetSlider(!showBudgetSlider)}>
            <Text style={{ fontSize: 16 }}>✏️</Text>
          </TouchableOpacity>
        </View>
        {showBudgetSlider && (
          <View style={styles.budgetSliderWrap}>
            <Slider style={styles.budgetSlider} minimumValue={500} maximumValue={10000} step={500} value={activeBudgetDollars} onValueChange={(v: number) => setBudgetOverride(v)} minimumTrackTintColor={GOLD} maximumTrackTintColor="#E8E0D0" thumbTintColor={GOLD} />
            <View style={styles.budgetSliderLabels}>
              <Text style={styles.budgetTick}>$500</Text>
              <Text style={styles.budgetTick}>$10,000</Text>
            </View>
          </View>
        )}

        {filteredProducts.length > 0 && (
          <TouchableOpacity style={styles.addAllBtn} onPress={handleAddAllToCart}>
            <Text style={styles.addAllBtnText}>Add All to Cart ({filteredProducts.length})</Text>
          </TouchableOpacity>
        )}

        <FlatList data={filteredProducts} renderItem={renderProductCard} keyExtractor={(i) => i.id} contentContainerStyle={{ padding: 12 }} ListEmptyComponent={<Text style={styles.emptyText}>No matched products yet.</Text>} />
      </Animated.View>

      {/* ── Overlays ── */}
      {/* Before/after slider — always mounted when original_image_url exists,   */}
      {/* hidden via opacity+pointerEvents so it never reloads on toggle.         */}
      {/* Right side shows through to whichever viewer is active behind it.       */}
      {!!currentRoom?.original_image_url && (
        <View
          style={[StyleSheet.absoluteFill, { opacity: showBeforeAfter ? 1 : 0 }]}
          pointerEvents={showBeforeAfter ? 'box-none' : 'none'}
        >
          <BeforeAfterSlider
            testID="before-after-slider"
            beforeImageUri={currentRoom.original_image_url}
            onClose={() => setShowBeforeAfter(false)}
          />
        </View>
      )}

      {showChat && (
        <ChatPanel
          testID="chat-panel"
          roomId={room_id}
          renderImageUrl={currentRender?.image_url ?? undefined}
          tapX={tapCoords?.x}
          tapY={tapCoords?.y}
          onClose={() => setShowChat(false)}
          onMessageSent={() => setTapCoords(null)}
        />
      )}

      {/* Similar items sheet */}
      <Modal visible={similarCategory !== null} transparent animationType="slide">
        <View style={styles.similarOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setSimilarCategory(null)} />
          <View style={styles.similarSheet}>
            <View style={styles.similarHeader}>
              <Text style={styles.similarTitle}>Similar {similarCategory?.replace(/_/g, ' ') ?? ''} Items</Text>
              <TouchableOpacity onPress={() => setSimilarCategory(null)}><Text style={styles.similarClose}>✕</Text></TouchableOpacity>
            </View>
            <FlatList
              data={similarProducts}
              renderItem={renderProductCard}
              keyExtractor={(i) => i.id}
              contentContainerStyle={{ padding: 12 }}
              ListEmptyComponent={<Text style={styles.emptyText}>No similar items found.</Text>}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  centerContent: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  renderUnavailable: { justifyContent: 'center', alignItems: 'center', backgroundColor: BG },
  renderUnavailableText: { color: 'rgba(255,255,255,0.6)', fontSize: 16, marginBottom: 20 },

  // ── Top bar ──
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingBottom: 12,
    backgroundColor: 'rgba(10,22,40,0.85)',
  },
  topBarBtn: { padding: 4 },
  topBarTitle: { flex: 1, textAlign: 'center', color: 'white', fontSize: 17, letterSpacing: 1 },
  tokenPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  tokenDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: GOLD },
  tokenText: { color: 'white', fontSize: 14 },

  // ── Loader ──
  loaderCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  pulseOuter: {
    position: 'absolute', width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(196,164,90,0.2)',
  },
  pulseInner: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(196,164,90,0.4)',
  },
  stageText: { color: 'white', fontSize: 18, marginTop: 32, textAlign: 'center' },
  progressTrack: {
    width: 200, height: 3, backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 2, marginTop: 16, overflow: 'hidden',
  },
  progressFill: { height: 3, backgroundColor: GOLD, borderRadius: 2 },

  // ── Error ──
  errorText: { fontSize: 18, color: 'white', textAlign: 'center', marginBottom: 24 },
  retryBtn: { backgroundColor: GOLD, borderRadius: 28, paddingHorizontal: 32, paddingVertical: 14, marginBottom: 16 },
  retryBtnText: { color: BG, fontSize: 17, fontWeight: '600' },
  backLink: { padding: 12 },
  backLinkText: { color: 'rgba(255,255,255,0.6)', fontSize: 15 },

  // ── Pull tab ──
  pullTab: {
    position: 'absolute', left: 0, top: '50%', zIndex: 20,
    width: 6, height: 48, backgroundColor: GOLD, borderRadius: 3,
    marginTop: -24,
  },

  // ── Chat FAB ──
  chatFab: {
    position: 'absolute', bottom: 100, right: 20, zIndex: 20,
    width: 56, height: 56, borderRadius: 28, backgroundColor: GOLD,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },

  // ── Bottom bar ──
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
    backgroundColor: 'rgba(10,22,40,0.85)',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32,
  },
  bottomBarRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  barAction: { alignItems: 'center', gap: 4 },
  barLabel: { color: 'white', fontSize: 11 },
  regenBtn: { backgroundColor: GOLD, borderRadius: 24, paddingHorizontal: 20, paddingVertical: 10 },
  regenBtnText: { color: BG, fontSize: 14, fontWeight: '600' },

  // ── B/A toggle ──
  baToggle: { position: 'absolute', top: 110, right: 16, zIndex: 20 },
  baToggleBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  baToggleBtnText: { color: 'white', fontSize: 13, fontWeight: '700' },

  // ── Tap pin ──
  tapPin: { position: 'absolute', zIndex: 5 },

  // ── Product panel ──
  productPanel: {
    position: 'absolute', left: 0, top: 0, bottom: 0, width: SCREEN_WIDTH * 0.75,
    backgroundColor: '#F5F0E8',
    shadowColor: '#000', shadowOffset: { width: 4, height: 0 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 10,
  },
  ppHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  ppTitle: { fontSize: 18, fontWeight: '700', color: BG },
  ppClose: { fontSize: 20, color: BG, fontWeight: '600' },

  budgetRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  budgetLabel: { fontSize: 14, fontWeight: '600', color: BG },
  budgetSliderWrap: { paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' },
  budgetSlider: { width: '100%', height: 32 },
  budgetSliderLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  budgetTick: { fontSize: 11, color: '#888' },
  addAllBtn: { marginHorizontal: 12, marginTop: 12, marginBottom: 4, backgroundColor: GOLD, borderRadius: 28, paddingVertical: 12, alignItems: 'center' },
  addAllBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  productCard: { backgroundColor: 'white', borderRadius: 12, marginBottom: 12, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3 },
  productImage: { width: '100%', height: 120 },
  productInfo: { padding: 12 },
  productName: { fontSize: 14, fontWeight: '600', color: '#1A1A1A', marginBottom: 4 },
  productPrice: { fontSize: 16, fontWeight: '800', color: GOLD, marginBottom: 2 },
  productRetailer: { fontSize: 12, color: '#888', marginBottom: 8 },
  productActions: { flexDirection: 'row', gap: 8 },
  addToCartBtn: { backgroundColor: BG, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 },
  addToCartText: { color: 'white', fontSize: 13, fontWeight: '700' },
  viewSimilarBtn: { borderWidth: 1.5, borderColor: GOLD, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 12 },
  viewSimilarText: { color: GOLD, fontSize: 13, fontWeight: '700' },
  emptyText: { textAlign: 'center', color: '#888', marginTop: 40, fontSize: 14 },

  // ── Similar sheet ──
  similarOverlay: { flex: 1, justifyContent: 'flex-end' },
  similarSheet: { backgroundColor: '#F5F0E8', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: SCREEN_HEIGHT * 0.6, paddingBottom: 32 },
  similarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.08)' },
  similarTitle: { fontSize: 18, fontWeight: '700', color: BG, textTransform: 'capitalize' },
  similarClose: { fontSize: 20, color: BG, fontWeight: '600' },
});

export default Sentry.withErrorBoundary(RenderViewScreen, {
  fallback: <></>,
});

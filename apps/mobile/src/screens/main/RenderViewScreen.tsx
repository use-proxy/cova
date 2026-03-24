import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
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
import Slider from '@react-native-community/slider';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RoomStackParamList } from '../../navigation/RoomNavigator';
import { useRender } from '../../hooks/useRender';
import { useAppStore } from '../../store';
import BeforeAfterSlider from '../../components/BeforeAfterSlider';
import ChatPanel from '../../components/ChatPanel';
import type { Product } from '@cova/shared';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const BG = '#0A1628';
const GOLD = '#C4A45A';

// §8.3 — 6 stages, must match useRender.ts exactly
const LOADING_STAGES = [
  'Analyzing your room...',
  'Measuring depth...',
  'Applying your style...',
  'Generating render...',
  'Adding finishing touches...',
  'Done!',
];

export default function RenderViewScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RoomStackParamList>>();
  const route = useRoute<RouteProp<RoomStackParamList, 'RenderView'>>();
  const insets = useSafeAreaInsets();

  const { startRender, renderStatus, renderProgressStage, renderProgress, renderError, currentRender } = useRender();
  const { matchedProducts, addToCart, cartItems, setRenderStatus, currentRoom, capturedImageUri } = useAppStore();

  // route.params.room_id is only populated when navigating directly within RoomNavigator.
  // When arriving via HomeStack's nested Room screen, room_id is in the parent route and
  // not forwarded — fall back to currentRoom.id (always set before navigation).
  const room_id = route.params?.room_id ?? currentRoom?.id ?? 'default';

  const [showControls, setShowControls] = useState(true);
  const [showBeforeAfter, setShowBeforeAfter] = useState(false);
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
  const productPanelX = useRef(new Animated.Value(-SCREEN_WIDTH * 0.75)).current;
  const pulseOpacity = useRef(new Animated.Value(0.4)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  const roomBudgetCents = currentRoom?.budget ?? 250000;
  const roomBudgetDollars = Math.round(roomBudgetCents / 100);
  const activeBudgetDollars = budgetOverride ?? roomBudgetDollars;

  const filteredProducts = useMemo(() => {
    const maxCents = activeBudgetDollars * 100;
    return matchedProducts.filter((p) => p.price <= maxCents);
  }, [matchedProducts, activeBudgetDollars]);

  const similarProducts = useMemo(() => {
    if (!similarCategory) return [];
    return matchedProducts.filter((p) => p.category === similarCategory);
  }, [matchedProducts, similarCategory]);

  // Cycle loading stage text when store stage is empty
  useEffect(() => {
    if (renderStatus !== 'processing') return;
    const iv = setInterval(() => setLocalStageIndex((p) => (p + 1) % LOADING_STAGES.length), 1500);
    return () => clearInterval(iv);
  }, [renderStatus]);

  // Navigate away only when idle with no render loaded (e.g. arrived without starting a render)
  useEffect(() => {
    if (renderStatus === 'idle' && !currentRender) navigation.goBack();
  }, [renderStatus, currentRender, navigation]);

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
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 5 || Math.abs(gs.dy) > 5,
      onPanResponderGrant: () => { panOffset.extractOffset(); },
      onPanResponderMove: Animated.event(
        [null, { dx: panOffset.x, dy: panOffset.y }],
        { useNativeDriver: false },
      ),
      onPanResponderRelease: (_, gs) => {
        panOffset.flattenOffset();
        if (Math.abs(gs.dx) < 5 && Math.abs(gs.dy) < 5) {
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
        const raw = await FileSystem.readAsStringAsync(capturedImageUri, {
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
    <View style={styles.root}>
      {/* Full-screen render image */}
      <View style={StyleSheet.absoluteFill} onLayout={handleImageLayout}>
        <TouchableWithoutFeedback onPress={handleImageTap}>
          {currentRender?.image_url ? (
            <Animated.Image
              source={{ uri: currentRender.image_url }}
              style={[StyleSheet.absoluteFill, { transform: [...panOffset.getTranslateTransform(), { scale: scaleVal }] }]}
              resizeMode="cover"
              {...imagePanResponder.panHandlers}
            />
          ) : null}
        </TouchableWithoutFeedback>
      </View>

      {/* Tap pin */}
      {tapCoords && (
        <View style={[styles.tapPin, { left: (tapCoords.x / 100) * imageDimsRef.current.width - 12, top: (tapCoords.y / 100) * imageDimsRef.current.height - 24 }]} pointerEvents="none">
          <Text style={{ fontSize: 24 }}>📍</Text>
        </View>
      )}

      {/* ── Top safe-area bar ── */}
      {showControls && (
        <Animated.View style={[styles.topBar, { paddingTop: insets.top + 12, opacity: controlsOpacity, backgroundColor: 'rgba(10,22,40,0.85)' }]} pointerEvents="box-none">
          <TouchableOpacity style={styles.topBarBtn} onPress={() => navigation.goBack()}>
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
        <TouchableOpacity style={styles.chatFab} activeOpacity={0.85} onPress={() => setShowChat(true)}>
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
          </View>
        </Animated.View>
      )}

      {/* Before/After toggle */}
      {showControls && (
        <Animated.View style={[styles.baToggle, { opacity: controlsOpacity }]}>
          <TouchableOpacity style={styles.baToggleBtn} onPress={() => setShowBeforeAfter(true)}>
            <Text style={styles.baToggleBtnText}>B/A</Text>
          </TouchableOpacity>
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
      {showBeforeAfter && (
        <BeforeAfterSlider
          beforeImageUri={capturedImageUri ?? currentRender?.image_url ?? ''}
          afterImageUri={currentRender?.image_url ?? ''}
          onClose={() => setShowBeforeAfter(false)}
        />
      )}

      {showChat && (
        <ChatPanel
          roomId={room_id}
          renderImageBase64={currentRender?.image_url ?? undefined}
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

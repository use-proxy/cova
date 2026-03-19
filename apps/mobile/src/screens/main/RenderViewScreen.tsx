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
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import * as WebBrowser from 'expo-web-browser';
import Slider from '@react-native-community/slider';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RoomStackParamList } from '../../navigation/RoomNavigator';
import { useRender } from '../../hooks/useRender';
import { useAppStore } from '../../store';
import BeforeAfterSlider from '../../components/BeforeAfterSlider';
import ChatPanel from '../../components/ChatPanel';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Product } from '@cova/shared';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function RenderViewScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RoomStackParamList>>();
  const route = useRoute<RouteProp<RoomStackParamList, 'RenderView'>>();
  const room_id = route.params?.room_id ?? 'default';

  const { startRender, renderStatus, renderProgressStage, renderProgress, renderError, currentRender } = useRender();
  const { matchedProducts, addToCart, cartItems, setRenderStatus, currentRoom, capturedImageUri } = useAppStore();

  const [showControls, setShowControls] = useState(true);
  const [showBeforeAfter, setShowBeforeAfter] = useState(false);
  const [showProductPanel, setShowProductPanel] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [similarCategory, setSimilarCategory] = useState<string | null>(null);
  const [budgetOverride, setBudgetOverride] = useState<number | null>(null);
  const [showBudgetSlider, setShowBudgetSlider] = useState(false);
  const [tapCoords, setTapCoords] = useState<{ x: number; y: number } | null>(null);

  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const imageDimsRef = useRef({ width: SCREEN_WIDTH, height: SCREEN_HEIGHT });
  const panOffset = useRef(new Animated.ValueXY()).current;
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const productPanelX = useRef(new Animated.Value(-SCREEN_WIDTH * 0.75)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const progressWidth = useRef(new Animated.Value(0)).current;

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

  useEffect(() => {
    if (renderStatus === 'idle') {
      navigation.goBack();
    }
  }, [renderStatus, navigation]);

  useEffect(() => {
    if (renderStatus === 'processing') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.2, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      ).start();
    }
  }, [renderStatus, pulseAnim]);

  useEffect(() => {
    Animated.timing(progressWidth, {
      toValue: renderProgress,
      duration: 500,
      useNativeDriver: false,
    }).start();
  }, [renderProgress, progressWidth]);

  const resetControlsTimer = () => {
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    controlsOpacity.setValue(1);
    setShowControls(true);
    controlsTimer.current = setTimeout(() => {
      Animated.timing(controlsOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => setShowControls(false));
    }, 3000);
  };

  useEffect(() => {
    if (renderStatus === 'completed') {
      resetControlsTimer();
    }
    return () => {
      if (controlsTimer.current) clearTimeout(controlsTimer.current);
    };
  }, [renderStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const imagePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 5 || Math.abs(gs.dy) > 5,
      onPanResponderGrant: () => {
        panOffset.extractOffset();
      },
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
    if (status !== 'granted') return;
    try {
      await MediaLibrary.saveToLibraryAsync(currentRender.image_url);
    } catch {
      // Remote URL may need download first
    }
  };

  const handleShare = async () => {
    if (!currentRender?.image_url) return;
    try {
      await Share.share({ url: currentRender.image_url });
    } catch {
      // cancelled
    }
  };

  const handleRegenerate = () => {
    const blend = currentRoom?.style_blend ?? { coastal: 0.2, japandi: 0.2, bohemian: 0.2, mid_century: 0.2, minimalist: 0.2 };
    const roomType = currentRoom?.room_type ?? 'living_room';
    startRender({
      roomId: room_id,
      roomType,
      styleBlend: blend,
      imageBase64: currentRender?.image_url ?? '',
      renderType: 'draft',
    });
  };

  const handleAddAllToCart = useCallback(() => {
    const existingIds = new Set(cartItems.map((ci) => ci.id));
    filteredProducts.forEach((p) => {
      if (!existingIds.has(p.id)) {
        addToCart({ id: p.id, product: p, quantity: 1, added_at: new Date().toISOString() });
      }
    });
  }, [filteredProducts, cartItems, addToCart]);

  const handleImageLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    imageDimsRef.current = { width, height };
  }, []);

  const handleImageTap = useCallback((e: GestureResponderEvent) => {
    const { locationX, locationY } = e.nativeEvent;
    const { width, height } = imageDimsRef.current;
    if (width > 0 && height > 0) {
      setTapCoords({
        x: (locationX / width) * 100,
        y: (locationY / height) * 100,
      });
    }
  }, []);

  const formatPrice = (price: number) => `$${price.toLocaleString()}`;
  const formatBudget = (b: number) => `$${b.toLocaleString()}`;

  const renderProductCard = ({ item }: { item: Product }) => (
    <View style={styles.productCard}>
      <Image source={{ uri: item.image_url }} style={styles.productImage} resizeMode="cover" />
      <View style={styles.productInfo}>
        <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
        <Text style={styles.productPrice}>{formatPrice(item.price)}</Text>
        <Text style={styles.productRetailer}>{item.retailer}</Text>
        <View style={styles.productActions}>
          <TouchableOpacity
            style={styles.addToCartBtn}
            onPress={() => addToCart({ id: item.id, product: item, quantity: 1, added_at: new Date().toISOString() })}
          >
            <Text style={styles.addToCartText}>Add to Cart</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.viewSimilarBtn}
            onPress={() => setSimilarCategory(item.category)}
          >
            <Text style={styles.viewSimilarText}>View Similar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  const renderSimilarCard = ({ item }: { item: Product }) => (
    <View style={styles.productCard}>
      <Image source={{ uri: item.image_url }} style={styles.productImage} resizeMode="cover" />
      <View style={styles.productInfo}>
        <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
        <Text style={styles.productPrice}>{formatPrice(item.price)}</Text>
        <Text style={styles.productRetailer}>{item.retailer}</Text>
        <TouchableOpacity
          style={styles.addToCartBtn}
          onPress={() => addToCart({ id: item.id, product: item, quantity: 1, added_at: new Date().toISOString() })}
        >
          <Text style={styles.addToCartText}>Add to Cart</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // Loading state
  if (renderStatus === 'processing') {
    return (
      <View style={[styles.fullScreen, styles.loadingContainer]}>
        <SafeAreaView style={styles.loadingContent}>
          <TouchableOpacity style={styles.backButtonSmall} onPress={() => { setRenderStatus('idle'); navigation.goBack(); }}>
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
        </SafeAreaView>
        <View style={styles.loadingCenter}>
          <Animated.View style={[styles.pulseCircle, { transform: [{ scale: pulseAnim }] }]} />
          <Text style={styles.progressStageText}>{renderProgressStage}</Text>
          <View style={styles.progressBarBg}>
            <Animated.View
              style={[
                styles.progressBarFill,
                {
                  width: progressWidth.interpolate({
                    inputRange: [0, 100],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>
        </View>
      </View>
    );
  }

  // Error state
  if (renderStatus === 'failed') {
    return (
      <View style={[styles.fullScreen, styles.errorContainer]}>
        <Text style={styles.errorText}>{renderError ?? 'Something went wrong.'}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={handleRegenerate}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.backLink} onPress={() => navigation.goBack()}>
          <Text style={styles.backLinkText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Complete state
  return (
    <View style={styles.fullScreen}>
      <View style={StyleSheet.absoluteFill} onLayout={handleImageLayout}>
        <TouchableWithoutFeedback onPress={handleImageTap}>
          <Animated.Image
            source={{ uri: currentRender?.image_url ?? '' }}
            style={[
              StyleSheet.absoluteFill,
              { transform: panOffset.getTranslateTransform() },
            ]}
            resizeMode="cover"
            {...imagePanResponder.panHandlers}
          />
        </TouchableWithoutFeedback>
      </View>

      {/* Tap pin indicator */}
      {tapCoords && (
        <View
          style={[
            styles.tapPin,
            {
              left: (tapCoords.x / 100) * imageDimsRef.current.width - 12,
              top: (tapCoords.y / 100) * imageDimsRef.current.height - 24,
            },
          ]}
          pointerEvents="none"
        >
          <Text style={styles.tapPinEmoji}>📍</Text>
        </View>
      )}

      {/* HUD */}
      {showControls && (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: controlsOpacity }]} pointerEvents="box-none">
          <SafeAreaView style={styles.hudTop} pointerEvents="box-none">
            <TouchableOpacity style={styles.hudButton} onPress={() => navigation.goBack()}>
              <Text style={styles.hudButtonText}>←</Text>
            </TouchableOpacity>
            <Text style={styles.hudTitle}>My Room</Text>
            <View style={styles.tokenBadge}>
              <Text style={styles.tokenCoin}>🪙</Text>
              <Text style={styles.tokenCount}>999</Text>
            </View>
          </SafeAreaView>

          <View style={styles.hudBottom}>
            <TouchableOpacity style={styles.actionButton} onPress={handleSave}>
              <Text style={styles.actionIcon}>💾</Text>
              <Text style={styles.actionLabel}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={handleShare}>
              <Text style={styles.actionIcon}>↗</Text>
              <Text style={styles.actionLabel}>Share</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.regenerateButton} onPress={handleRegenerate}>
              <Text style={styles.regenerateText}>Regenerate</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={() => setShowChat(true)}>
              <Text style={styles.actionIcon}>💬</Text>
              <Text style={styles.actionLabel}>Chat</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={() => toggleProductPanel(true)}>
              <Text style={styles.actionIcon}>🛍</Text>
              <Text style={styles.actionLabel}>Shop</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.beforeAfterBtn} onPress={() => setShowBeforeAfter(true)}>
            <Text style={styles.beforeAfterBtnText}>B/A</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Product panel pull tab */}
      {!showProductPanel && (
        <TouchableOpacity style={styles.productPullTab} onPress={() => toggleProductPanel(true)}>
          <Text style={styles.productPullTabText}>›</Text>
        </TouchableOpacity>
      )}

      {/* Product panel */}
      <Animated.View style={[styles.productPanel, { transform: [{ translateX: productPanelX }] }]}>
        <View style={styles.productPanelHeader}>
          <Text style={styles.productPanelTitle}>Matched Products</Text>
          <TouchableOpacity onPress={() => toggleProductPanel(false)}>
            <Text style={styles.productPanelClose}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Budget display & slider */}
        <View style={styles.budgetRow}>
          <Text style={styles.budgetLabel}>Budget: {formatBudget(activeBudgetDollars)}</Text>
          <TouchableOpacity onPress={() => setShowBudgetSlider(!showBudgetSlider)}>
            <Text style={styles.budgetEditIcon}>✏️</Text>
          </TouchableOpacity>
        </View>
        {showBudgetSlider && (
          <View style={styles.budgetSliderWrap}>
            <Slider
              style={styles.budgetSlider}
              minimumValue={500}
              maximumValue={10000}
              step={500}
              value={activeBudgetDollars}
              onValueChange={(v: number) => setBudgetOverride(v)}
              minimumTrackTintColor="#C47B3C"
              maximumTrackTintColor="#E8E0D0"
              thumbTintColor="#C47B3C"
            />
            <View style={styles.budgetSliderLabels}>
              <Text style={styles.budgetSliderTick}>$500</Text>
              <Text style={styles.budgetSliderTick}>$10,000</Text>
            </View>
          </View>
        )}

        {/* Add All to Cart */}
        {filteredProducts.length > 0 && (
          <TouchableOpacity style={styles.addAllBtn} onPress={handleAddAllToCart}>
            <Text style={styles.addAllBtnText}>Add All to Cart ({filteredProducts.length})</Text>
          </TouchableOpacity>
        )}

        <FlatList
          data={filteredProducts}
          renderItem={renderProductCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.productList}
          ListEmptyComponent={
            <Text style={styles.emptyProducts}>No matched products yet.</Text>
          }
        />
      </Animated.View>

      {/* Chat bubble */}
      {!showChat && (
        <TouchableOpacity style={styles.chatBubble} onPress={() => setShowChat(true)}>
          <Text style={styles.chatBubbleText}>💬</Text>
        </TouchableOpacity>
      )}

      {/* Before/After overlay */}
      {showBeforeAfter && (
        <BeforeAfterSlider
          beforeImageUri={capturedImageUri ?? currentRender?.image_url ?? ''}
          afterImageUri={currentRender?.image_url ?? ''}
          onClose={() => setShowBeforeAfter(false)}
        />
      )}

      {/* Chat panel */}
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

      {/* Similar items bottom sheet */}
      <Modal visible={similarCategory !== null} transparent animationType="slide">
        <View style={styles.similarOverlay}>
          <TouchableOpacity style={styles.similarBackdrop} activeOpacity={1} onPress={() => setSimilarCategory(null)} />
          <View style={styles.similarSheet}>
            <View style={styles.similarHeader}>
              <Text style={styles.similarTitle}>
                Similar {similarCategory ? similarCategory.replace(/_/g, ' ') : ''} Items
              </Text>
              <TouchableOpacity onPress={() => setSimilarCategory(null)}>
                <Text style={styles.similarClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={similarProducts}
              renderItem={renderSimilarCard}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.productList}
              ListEmptyComponent={
                <Text style={styles.emptyProducts}>No similar items found.</Text>
              }
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  fullScreen: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    backgroundColor: '#1B3A2D',
  },
  loadingContent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  loadingCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
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
  progressStageText: {
    fontSize: 18,
    color: '#F5F0E8',
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 24,
  },
  progressBarBg: {
    width: '100%',
    height: 4,
    backgroundColor: 'rgba(245,240,232,0.2)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#C47B3C',
    borderRadius: 2,
  },
  backButtonSmall: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.3)',
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
  errorContainer: {
    backgroundColor: '#1B3A2D',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  errorText: {
    fontSize: 18,
    color: '#F5F0E8',
    textAlign: 'center',
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: '#C47B3C',
    borderRadius: 28,
    paddingHorizontal: 32,
    paddingVertical: 14,
    marginBottom: 16,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 17,
    fontWeight: '700',
  },
  backLink: {
    padding: 12,
  },
  backLinkText: {
    color: 'rgba(245,240,232,0.7)',
    fontSize: 15,
  },
  hudTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  hudButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  hudButtonText: {
    color: 'white',
    fontSize: 22,
    fontWeight: '600',
  },
  hudTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  tokenBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 4,
  },
  tokenCoin: {
    fontSize: 14,
  },
  tokenCount: {
    color: '#C47B3C',
    fontSize: 14,
    fontWeight: '700',
  },
  hudBottom: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  actionButton: {
    alignItems: 'center',
    gap: 4,
  },
  actionIcon: {
    fontSize: 22,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  actionLabel: {
    color: 'white',
    fontSize: 11,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  regenerateButton: {
    backgroundColor: '#C47B3C',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  regenerateText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '700',
  },
  beforeAfterBtn: {
    position: 'absolute',
    top: 100,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  beforeAfterBtnText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '700',
  },
  productPullTab: {
    position: 'absolute',
    left: 0,
    top: SCREEN_HEIGHT / 2 - 30,
    width: 24,
    height: 60,
    backgroundColor: '#C47B3C',
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  productPullTabText: {
    color: 'white',
    fontSize: 20,
    fontWeight: '700',
  },
  productPanel: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: SCREEN_WIDTH * 0.75,
    backgroundColor: '#F5F0E8',
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  productPanelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  productPanelTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1B3A2D',
  },
  productPanelClose: {
    fontSize: 20,
    color: '#1B3A2D',
    fontWeight: '600',
  },

  // Budget
  budgetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  budgetLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1B3A2D',
  },
  budgetEditIcon: {
    fontSize: 16,
  },
  budgetSliderWrap: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  budgetSlider: {
    width: '100%',
    height: 32,
  },
  budgetSliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  budgetSliderTick: {
    fontSize: 11,
    color: '#888',
    fontWeight: '500',
  },

  // Add All to Cart
  addAllBtn: {
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 4,
    backgroundColor: '#C47B3C',
    borderRadius: 28,
    paddingVertical: 12,
    alignItems: 'center',
  },
  addAllBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },

  productList: {
    padding: 12,
  },
  productCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  productImage: {
    width: '100%',
    height: 120,
  },
  productInfo: {
    padding: 12,
  },
  productName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  productPrice: {
    fontSize: 16,
    fontWeight: '800',
    color: '#C47B3C',
    marginBottom: 2,
  },
  productRetailer: {
    fontSize: 12,
    color: '#888',
    marginBottom: 8,
  },
  productActions: {
    flexDirection: 'row',
    gap: 8,
  },
  addToCartBtn: {
    backgroundColor: '#1B3A2D',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  addToCartText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '700',
  },
  viewSimilarBtn: {
    borderWidth: 1.5,
    borderColor: '#C47B3C',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  viewSimilarText: {
    color: '#C47B3C',
    fontSize: 13,
    fontWeight: '700',
  },
  emptyProducts: {
    textAlign: 'center',
    color: '#888',
    marginTop: 40,
    fontSize: 14,
  },
  tapPin: {
    position: 'absolute',
    zIndex: 5,
  },
  tapPinEmoji: {
    fontSize: 24,
  },
  chatBubble: {
    position: 'absolute',
    bottom: 100,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#C47B3C',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  chatBubbleText: {
    fontSize: 24,
  },

  // Similar items bottom sheet
  similarOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  similarBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  similarSheet: {
    backgroundColor: '#F5F0E8',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: SCREEN_HEIGHT * 0.6,
    paddingBottom: 32,
  },
  similarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  similarTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1B3A2D',
    textTransform: 'capitalize',
  },
  similarClose: {
    fontSize: 20,
    color: '#1B3A2D',
    fontWeight: '600',
  },
});

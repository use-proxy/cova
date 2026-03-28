import React, { useState, useEffect, useCallback, useRef } from 'react';
import { track } from '../../lib/posthog';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  FlatList,
  TextInput,
  StyleSheet,
  Animated,
  Image,
  Linking,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppStore } from '../../store';
import { supabase } from '../../lib/supabase';
import type { Product, StyleBlend } from '@cova/shared';

// ─── Constants ─────────────────────────────────────────────────────────────────

const BG = '#0A1628';
const GOLD = '#B8860B';
const PAGE_SIZE = 12;
const MAX_PINS = 3;
const MAX_RECENT = 5;

const CATEGORIES: { key: string; label: string }[] = [
  { key: '', label: 'All' },
  { key: 'seating', label: 'Sofas & Chairs' },
  { key: 'tables', label: 'Tables' },
  { key: 'beds', label: 'Beds' },
  { key: 'lighting', label: 'Lighting' },
  { key: 'rugs', label: 'Rugs' },
  { key: 'decor', label: 'Accessories' },
];

const RETAILERS: string[] = ['All', 'Wayfair', 'Amazon', 'IKEA', 'CB2', 'West Elm', 'Target'];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function computeStyleMatch(product: Product, blend: StyleBlend | null | undefined): number {
  if (!product.style_tags?.length || !blend) return 0.5;
  let score = 0;
  (product.style_tags as string[]).forEach((tag) => {
    score += (blend as Record<string, number>)[tag] ?? 0;
  });
  return Math.min(1, score);
}

function formatPrice(p: number): string {
  return `$${p.toLocaleString()}`;
}

async function checkLinkAlive(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(4000) });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Props ─────────────────────────────────────────────────────────────────────

export interface ProductPanelProps {
  visible: boolean;
  onClose: () => void;
  roomId: string;
  styleBlend?: StyleBlend | null;
  budget?: number;
  defaultCategory?: string;
}

// ─── Main component ─────────────────────────────────────────────────────────────

export default function ProductPanel({ visible, onClose, styleBlend, budget = 2500, defaultCategory }: ProductPanelProps) {
  const insets = useSafeAreaInsets();
  const {
    pinnedRoomProducts,
    recentlyViewedProducts,
    savedProducts,
    matchedProducts,
    pinProduct,
    unpinProduct,
    addToRecentlyViewed,
    addToSaved,
    removeFromSaved,
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<'matched' | 'favorites'>('matched');
  const [searchQuery, setSearchQuery] = useState('');
  const [priceMax, setPriceMax] = useState(budget);
  const [selectedRetailer, setSelectedRetailer] = useState('All');
  const [selectedCategory, setSelectedCategory] = useState(defaultCategory ?? '');
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isRelaxed, setIsRelaxed] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isBuyingNow, setIsBuyingNow] = useState(false);

  const slideAnim = useRef(new Animated.Value(700)).current;
  const isLoadingRef = useRef(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentPageRef = useRef(0);

  // Sync priceMax when budget prop changes
  useEffect(() => {
    setPriceMax(budget);
  }, [budget]);

  // Slide in/out when visibility changes
  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, friction: 9 }).start();
    } else {
      Animated.timing(slideAnim, { toValue: 700, duration: 250, useNativeDriver: true }).start();
    }
  }, [visible, slideAnim]);

  const loadPage = useCallback(async (pageNum: number) => {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    setIsLoading(true);

    try {
      const from = pageNum * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const buildQuery = (maxPrice: number) => {
        let q = supabase.from('products').select('id, name, description, price, retailer, affiliate_url, category, room_types, style_tags, image_url, width_inches, depth_inches, height_inches').range(from, to);
        if (maxPrice > 0) q = q.lte('price', maxPrice);
        if (selectedCategory) q = q.eq('category', selectedCategory);
        if (selectedRetailer !== 'All') q = q.ilike('retailer', `%${selectedRetailer}%`);
        if (searchQuery.trim()) q = q.ilike('name', `%${searchQuery.trim()}%`);
        return q;
      };

      const { data: rawData, error } = await buildQuery(priceMax);
      if (error) throw error;

      let fetched = (rawData ?? []) as Product[];
      let relaxed = false;

      // Progressive threshold relaxation: if < 10 results on first page, relax price filter
      if (fetched.length < 10 && pageNum === 0 && priceMax > 0) {
        const { data: relaxedData } = await buildQuery(0);
        if (relaxedData && relaxedData.length >= fetched.length) {
          fetched = relaxedData as Product[];
          relaxed = true;
        }
      }

      const scored = [...fetched].sort(
        (a, b) => computeStyleMatch(b, styleBlend) - computeStyleMatch(a, styleBlend),
      );

      if (pageNum === 0) {
        setProducts(scored);
        setIsRelaxed(relaxed);
      } else {
        setProducts((prev) => [...prev, ...scored]);
      }
      setHasMore(fetched.length === PAGE_SIZE);
      currentPageRef.current = pageNum;
    } catch {
      // silent — empty state shown
    } finally {
      isLoadingRef.current = false;
      setIsLoading(false);
    }
  }, [priceMax, selectedCategory, selectedRetailer, searchQuery, styleBlend]);

  // Refetch on filter changes (debounced for search)
  // Sync defaultCategory when panel opens with a new category from OPEN_SHOP action
  useEffect(() => {
    if (visible && defaultCategory !== undefined) {
      setSelectedCategory(defaultCategory);
    }
  }, [visible, defaultCategory]);

  useEffect(() => {
    if (!visible) return;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const delay = searchQuery ? 350 : 0;
    searchTimerRef.current = setTimeout(() => {
      setProducts([]);
      setPage(0);
      setHasMore(true);
      setIsRelaxed(false);
      isLoadingRef.current = false;
      loadPage(0);
    }, delay);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, searchQuery, priceMax, selectedCategory, selectedRetailer]);

  const loadMore = useCallback(() => {
    if (!hasMore || isLoadingRef.current) return;
    const nextPage = currentPageRef.current + 1;
    setPage(nextPage);
    loadPage(nextPage);
  }, [hasMore, loadPage]);

  const handlePinToggle = useCallback((product: Product) => {
    const isPinned = pinnedRoomProducts.some((p) => p.id === product.id);
    if (isPinned) {
      unpinProduct(product.id);
    } else if (pinnedRoomProducts.length >= MAX_PINS) {
      Alert.alert('Pin limit reached', `You can pin up to ${MAX_PINS} products. Unpin one to add another.`);
    } else {
      pinProduct(product);
      track('product_pinned', { product_id: product.id, retailer: product.retailer });
    }
  }, [pinnedRoomProducts, pinProduct, unpinProduct]);

  const handleSaveToggle = useCallback((product: Product) => {
    const isSaved = savedProducts.some((p) => p.id === product.id);
    if (isSaved) {
      removeFromSaved(product.id);
    } else {
      addToSaved(product);
    }
  }, [savedProducts, addToSaved, removeFromSaved]);

  const handleBuyNow = useCallback(async (product: Product) => {
    if (!product.affiliate_url) {
      Alert.alert('Not available', 'This product is not available for purchase.');
      return;
    }
    setIsBuyingNow(true);
    const alive = await checkLinkAlive(product.affiliate_url);
    setIsBuyingNow(false);
    if (!alive) {
      Alert.alert('Link unavailable', 'This product link is temporarily unavailable. Please try again later.');
      return;
    }
    try {
      await Linking.openURL(product.affiliate_url);
      track('product_purchased', { product_id: product.id, retailer: product.retailer, price: product.price });
    } catch {
      Alert.alert('Error', 'Could not open the product page.');
    }
  }, []);

  const handleProductTap = useCallback((product: Product) => {
    addToRecentlyViewed(product);
    setSelectedProduct(product);
    track('product_tapped', {
      product_id: product.id,
      retailer: product.retailer,
      style_match_score: computeStyleMatch(product, styleBlend),
    });
  }, [addToRecentlyViewed, styleBlend]);

  const pinnedIds = new Set(pinnedRoomProducts.map((p) => p.id));
  const matchedIds = new Set(matchedProducts.map((p) => p.id));
  const savedIds = new Set(savedProducts.map((p) => p.id));

  // ── Product card (2-column grid) ──

  const renderProductCard = useCallback(({ item }: { item: Product }) => {
    const matchScore = computeStyleMatch(item, styleBlend);
    const isPinned = pinnedIds.has(item.id);
    const isFeatured = matchedIds.has(item.id);
    const isOverBudget = budget > 0 && item.price > budget;

    return (
      <TouchableOpacity style={styles.productCard} onPress={() => handleProductTap(item)} activeOpacity={0.85}>
        <View style={styles.productImageWrapper}>
          <Image source={{ uri: item.image_url }} style={styles.productImage} resizeMode="cover" />
          {isPinned && (
            <View style={styles.inRoomBadge}>
              <Text style={styles.badgeText}>📌 In Your Room</Text>
            </View>
          )}
          {isFeatured && !isPinned && (
            <View style={styles.featuredBadge}>
              <Text style={styles.badgeText}>✨ Featured</Text>
            </View>
          )}
        </View>
        <View style={styles.productInfo}>
          <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
          <View style={styles.priceRow}>
            <Text style={[styles.productPrice, isOverBudget && styles.overBudgetPrice]}>
              {formatPrice(item.price)}
            </Text>
            {isOverBudget && <Text style={styles.overBudgetLabel}>Over Budget</Text>}
          </View>
          <Text style={styles.retailerText}>{item.retailer}</Text>
          <View style={styles.matchBarRow}>
            <View style={styles.matchBarTrack}>
              <View style={[styles.matchBarFill, { width: `${Math.round(matchScore * 100)}%` as `${number}%` }]} />
            </View>
            <Text style={styles.matchPct}>{Math.round(matchScore * 100)}%</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }, [styleBlend, pinnedIds, matchedIds, budget, handleProductTap]);

  // ── Pinned item chip ──

  const renderPinnedItem = useCallback(({ item }: { item: Product }) => (
    <TouchableOpacity style={styles.pinnedChip} onPress={() => handleProductTap(item)}>
      <Image source={{ uri: item.image_url }} style={styles.pinnedChipImage} />
      <Text style={styles.pinnedChipName} numberOfLines={1}>{item.name}</Text>
      <TouchableOpacity style={styles.unpinBtn} onPress={() => unpinProduct(item.id)}>
        <Text style={styles.unpinX}>✕</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  ), [handleProductTap, unpinProduct]);

  // ── Recently viewed chip ──

  const renderRecentItem = useCallback(({ item }: { item: Product }) => (
    <TouchableOpacity style={styles.recentChip} onPress={() => handleProductTap(item)}>
      <Image source={{ uri: item.image_url }} style={styles.recentChipImage} />
      <Text style={styles.recentChipName} numberOfLines={1}>{item.name}</Text>
    </TouchableOpacity>
  ), [handleProductTap]);

  const listHeader = (
    <View>
      {pinnedRoomProducts.length > 0 && (
        <View style={styles.sectionBlock}>
          <Text style={styles.sectionLabel}>Pinned to Room ({pinnedRoomProducts.length}/{MAX_PINS})</Text>
          <FlatList
            data={pinnedRoomProducts}
            renderItem={renderPinnedItem}
            keyExtractor={(p) => p.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingRight: 16 }}
          />
        </View>
      )}
      {recentlyViewedProducts.length > 0 && (
        <View style={styles.sectionBlock}>
          <Text style={styles.sectionLabel}>Recently Viewed</Text>
          <FlatList
            data={recentlyViewedProducts}
            renderItem={renderRecentItem}
            keyExtractor={(p) => p.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingRight: 16 }}
          />
        </View>
      )}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search products..."
          placeholderTextColor="#555"
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
        />
      </View>
      <View style={styles.sliderBlock}>
        <Text style={styles.sliderLabel}>Max Price: {formatPrice(priceMax)}</Text>
        <Slider
          style={styles.slider}
          minimumValue={0}
          maximumValue={10000}
          step={100}
          value={priceMax}
          onValueChange={(v: number) => setPriceMax(v)}
          minimumTrackTintColor={GOLD}
          maximumTrackTintColor="#2A3A50"
          thumbTintColor={GOLD}
        />
        <View style={styles.sliderTicks}>
          <Text style={styles.sliderTick}>$0</Text>
          <Text style={styles.sliderTick}>$10,000+</Text>
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipContent}>
        {RETAILERS.map((r) => (
          <TouchableOpacity
            key={r}
            style={[styles.chip, selectedRetailer === r && styles.chipActive]}
            onPress={() => setSelectedRetailer(r)}
          >
            <Text style={[styles.chipText, selectedRetailer === r && styles.chipTextActive]}>{r}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipContent}>
        {CATEGORIES.map((c) => (
          <TouchableOpacity
            key={c.key}
            style={[styles.chip, selectedCategory === c.key && styles.chipActive]}
            onPress={() => setSelectedCategory(c.key)}
          >
            <Text style={[styles.chipText, selectedCategory === c.key && styles.chipTextActive]}>{c.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {isRelaxed && (
        <View style={styles.relaxedBanner}>
          <Text style={styles.relaxedText}>Showing closest matches to your style</Text>
        </View>
      )}
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <Animated.View
          style={[
            styles.sheet,
            { transform: [{ translateY: slideAnim }], paddingBottom: insets.bottom },
          ]}
        >
          {/* Header */}
          <View style={[styles.header, { paddingTop: insets.top > 0 ? 12 : 16 }]}>
            <View style={styles.dragHandle} />
            <Text style={styles.headerTitle}>Shop</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} testID="product-panel-close">
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Tabs */}
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'matched' && styles.tabActive]}
              onPress={() => setActiveTab('matched')}
            >
              <Text style={[styles.tabText, activeTab === 'matched' && styles.tabTextActive]}>For Your Room</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'favorites' && styles.tabActive]}
              onPress={() => setActiveTab('favorites')}
            >
              <Text style={[styles.tabText, activeTab === 'favorites' && styles.tabTextActive]}>
                Favorites ({savedProducts.length})
              </Text>
            </TouchableOpacity>
          </View>

          {activeTab === 'matched' ? (
            <FlatList
              data={products}
              renderItem={renderProductCard}
              keyExtractor={(item) => item.id}
              numColumns={2}
              onEndReached={loadMore}
              onEndReachedThreshold={0.4}
              contentContainerStyle={styles.productListContent}
              ListHeaderComponent={listHeader}
              ListEmptyComponent={
                isLoading ? (
                  <View style={styles.loaderWrap}>
                    <ActivityIndicator color={GOLD} />
                  </View>
                ) : (
                  <Text style={styles.emptyText}>No products found. Try adjusting your filters.</Text>
                )
              }
              ListFooterComponent={
                isLoading && products.length > 0 ? (
                  <ActivityIndicator color={GOLD} style={styles.footerLoader} />
                ) : null
              }
            />
          ) : (
            <FlatList
              data={savedProducts}
              renderItem={renderProductCard}
              keyExtractor={(item) => item.id}
              numColumns={2}
              contentContainerStyle={styles.productListContent}
              ListEmptyComponent={
                <Text style={styles.emptyText}>
                  No favorites yet. Tap a product and save it to see it here.
                </Text>
              }
            />
          )}
        </Animated.View>
      </View>

      {/* Product info popup — separate modal above panel */}
      {selectedProduct !== null && (
        <ProductInfoPopup
          product={selectedProduct}
          isPinned={pinnedIds.has(selectedProduct.id)}
          isSaved={savedIds.has(selectedProduct.id)}
          canPin={!pinnedIds.has(selectedProduct.id) && pinnedRoomProducts.length < MAX_PINS}
          budget={budget}
          styleMatch={computeStyleMatch(selectedProduct, styleBlend)}
          isBuyingNow={isBuyingNow}
          onClose={() => setSelectedProduct(null)}
          onPin={() => handlePinToggle(selectedProduct)}
          onSave={() => handleSaveToggle(selectedProduct)}
          onBuyNow={() => handleBuyNow(selectedProduct)}
          onBrowseSimilar={() => {
            const cat = selectedProduct.category ?? '';
            setSelectedProduct(null);
            setSelectedCategory(cat);
            setActiveTab('matched');
          }}
        />
      )}
    </Modal>
  );
}

// ─── Product Info Popup ────────────────────────────────────────────────────────

interface ProductInfoPopupProps {
  product: Product;
  isPinned: boolean;
  isSaved: boolean;
  canPin: boolean;
  budget: number;
  styleMatch: number;
  isBuyingNow: boolean;
  onClose: () => void;
  onPin: () => void;
  onSave: () => void;
  onBuyNow: () => void;
  onBrowseSimilar: () => void;
}

function ProductInfoPopup({
  product, isPinned, isSaved, canPin, budget, styleMatch,
  isBuyingNow, onClose, onPin, onSave, onBuyNow, onBrowseSimilar,
}: ProductInfoPopupProps) {
  const insets = useSafeAreaInsets();
  const isOverBudget = budget > 0 && product.price > budget;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={popupStyles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={[popupStyles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <Image source={{ uri: product.image_url }} style={popupStyles.image} resizeMode="cover" />
          <View style={popupStyles.body}>
            <Text style={popupStyles.name}>{product.name}</Text>
            <View style={popupStyles.priceRow}>
              <Text style={[popupStyles.price, isOverBudget && popupStyles.overBudgetPrice]}>
                {formatPrice(product.price)}
              </Text>
              {isOverBudget && (
                <View style={popupStyles.overBudgetTag}>
                  <Text style={popupStyles.overBudgetTagText}>Over Budget</Text>
                </View>
              )}
            </View>
            <Text style={popupStyles.retailer}>{product.retailer}</Text>
            <View style={popupStyles.matchRow}>
              <View style={popupStyles.matchTrack}>
                <View style={[popupStyles.matchFill, { width: `${Math.round(styleMatch * 100)}%` as `${number}%` }]} />
              </View>
              <Text style={popupStyles.matchPct}>{Math.round(styleMatch * 100)}% style match</Text>
            </View>
            <View style={popupStyles.actions}>
              <TouchableOpacity style={popupStyles.buyBtn} onPress={onBuyNow} disabled={isBuyingNow}>
                <Text style={popupStyles.buyBtnText}>{isBuyingNow ? 'Checking link...' : 'Buy Now'}</Text>
              </TouchableOpacity>
              <View style={popupStyles.secondaryRow}>
                <TouchableOpacity
                  style={[popupStyles.secondaryBtn, isPinned && popupStyles.secondaryBtnActive, !canPin && !isPinned && popupStyles.secondaryBtnDisabled]}
                  onPress={onPin}
                  disabled={!canPin && !isPinned}
                >
                  <Text style={[popupStyles.secondaryText, isPinned && popupStyles.secondaryTextActive]}>
                    {isPinned ? '📌 Pinned' : canPin ? '📌 Pin' : '📌 Max Pins'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[popupStyles.secondaryBtn, isSaved && popupStyles.secondaryBtnActive]}
                  onPress={onSave}
                >
                  <Text style={[popupStyles.secondaryText, isSaved && popupStyles.secondaryTextActive]}>
                    {isSaved ? '♥ Saved' : '♡ Save'}
                  </Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={popupStyles.similarBtn} onPress={onBrowseSimilar}>
                <Text style={popupStyles.similarText}>Browse Similar →</Text>
              </TouchableOpacity>
            </View>
          </View>
          <TouchableOpacity style={popupStyles.closeBtn} onPress={onClose}>
            <Text style={popupStyles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: BG,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '92%',
    minHeight: '72%',
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
    flexDirection: 'row',
  },
  dragHandle: {
    position: 'absolute',
    top: 8,
    alignSelf: 'center',
    left: '50%',
    marginLeft: -20,
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#2A3A50',
  },
  headerTitle: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  closeBtn: {
    padding: 8,
  },
  closeBtnText: {
    color: '#888',
    fontSize: 18,
  },
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1A2A40',
    marginBottom: 0,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: GOLD,
  },
  tabText: {
    color: '#666',
    fontSize: 14,
  },
  tabTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  sectionBlock: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  sectionLabel: {
    color: '#666',
    fontSize: 11,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  pinnedChip: {
    width: 100,
    marginRight: 10,
    backgroundColor: '#0F1E35',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GOLD,
    overflow: 'hidden',
  },
  pinnedChipImage: {
    width: 100,
    height: 68,
  },
  pinnedChipName: {
    color: '#FFFFFF',
    fontSize: 11,
    padding: 5,
  },
  unpinBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unpinX: {
    color: '#FFFFFF',
    fontSize: 10,
    lineHeight: 14,
  },
  recentChip: {
    width: 80,
    marginRight: 10,
    backgroundColor: '#0F1E35',
    borderRadius: 10,
    overflow: 'hidden',
  },
  recentChipImage: {
    width: 80,
    height: 60,
  },
  recentChipName: {
    color: '#666',
    fontSize: 10,
    padding: 4,
  },
  searchRow: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  searchInput: {
    backgroundColor: '#0F1E35',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#FFFFFF',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#1A2A40',
  },
  sliderBlock: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  sliderLabel: {
    color: '#888',
    fontSize: 13,
    marginBottom: 2,
  },
  slider: {
    height: 36,
  },
  sliderTicks: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -4,
  },
  sliderTick: {
    color: '#444',
    fontSize: 11,
  },
  chipScroll: {
    marginTop: 6,
  },
  chipContent: {
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#0F1E35',
    borderWidth: 1,
    borderColor: '#1A2A40',
    marginRight: 8,
  },
  chipActive: {
    backgroundColor: GOLD,
    borderColor: GOLD,
  },
  chipText: {
    color: '#666',
    fontSize: 13,
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  relaxedBanner: {
    marginHorizontal: 16,
    marginTop: 8,
    padding: 10,
    backgroundColor: '#0F1E35',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: GOLD,
  },
  relaxedText: {
    color: '#888',
    fontSize: 12,
  },
  productListContent: {
    paddingHorizontal: 8,
    paddingBottom: 40,
  },
  productCard: {
    flex: 1,
    margin: 6,
    backgroundColor: '#0F1E35',
    borderRadius: 14,
    overflow: 'hidden',
  },
  productImageWrapper: {
    position: 'relative',
  },
  productImage: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#1A2A40',
  },
  inRoomBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: GOLD,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  featuredBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
  },
  productInfo: {
    padding: 10,
  },
  productName: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
    lineHeight: 16,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 2,
    flexWrap: 'wrap',
  },
  productPrice: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  overBudgetPrice: {
    color: '#C62828',
  },
  overBudgetLabel: {
    color: '#C62828',
    fontSize: 9,
    fontWeight: '600',
  },
  retailerText: {
    color: '#555',
    fontSize: 11,
    marginBottom: 6,
  },
  matchBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  matchBarTrack: {
    flex: 1,
    height: 3,
    backgroundColor: '#1A2A40',
    borderRadius: 2,
    overflow: 'hidden',
  },
  matchBarFill: {
    height: 3,
    backgroundColor: GOLD,
    borderRadius: 2,
  },
  matchPct: {
    color: '#555',
    fontSize: 10,
  },
  loaderWrap: {
    alignItems: 'center',
    marginTop: 50,
  },
  footerLoader: {
    marginVertical: 20,
  },
  emptyText: {
    color: '#444',
    textAlign: 'center',
    marginTop: 50,
    paddingHorizontal: 32,
    fontSize: 14,
    lineHeight: 20,
  },
});

const popupStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: BG,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: 240,
    backgroundColor: '#1A2A40',
  },
  body: {
    padding: 20,
  },
  name: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    lineHeight: 24,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  price: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
  overBudgetPrice: {
    color: '#C62828',
  },
  overBudgetTag: {
    backgroundColor: 'rgba(198,40,40,0.12)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  overBudgetTagText: {
    color: '#C62828',
    fontSize: 12,
    fontWeight: '600',
  },
  retailer: {
    color: '#666',
    fontSize: 14,
    marginBottom: 12,
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  matchTrack: {
    flex: 1,
    height: 4,
    backgroundColor: '#1A2A40',
    borderRadius: 2,
    overflow: 'hidden',
  },
  matchFill: {
    height: 4,
    backgroundColor: GOLD,
    borderRadius: 2,
  },
  matchPct: {
    color: '#888',
    fontSize: 12,
    minWidth: 90,
  },
  actions: {
    gap: 10,
  },
  buyBtn: {
    backgroundColor: GOLD,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  buyBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1A2A40',
    alignItems: 'center',
  },
  secondaryBtnActive: {
    borderColor: GOLD,
    backgroundColor: 'rgba(184,134,11,0.1)',
  },
  secondaryBtnDisabled: {
    opacity: 0.4,
  },
  secondaryText: {
    color: '#666',
    fontSize: 14,
  },
  secondaryTextActive: {
    color: GOLD,
  },
  similarBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  similarText: {
    color: '#666',
    fontSize: 14,
  },
  closeBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 16,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    lineHeight: 20,
  },
});

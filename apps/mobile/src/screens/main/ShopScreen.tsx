import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  Alert,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import Svg, { Path } from 'react-native-svg';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppStore } from '../../store';
import type { CartItem, Product } from '@cova/shared';

const BG = '#0A1628';
const GOLD = '#C4A45A';
const CREAM = '#F5F0E8';

// ── SVG Icons ──

function BagIcon() {
  return (
    <Svg width={64} height={64} viewBox="0 0 64 64" fill="none">
      <Path d="M16 20h32v36c0 2-1.5 4-4 4H20c-2.5 0-4-2-4-4V20z" stroke={GOLD} strokeWidth={2.5} />
      <Path d="M24 20V16c0-4.4 3.6-8 8-8s8 3.6 8 8v4" stroke={GOLD} strokeWidth={2.5} />
    </Svg>
  );
}

function HeartIcon({ filled = false }: { filled?: boolean }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill={filled ? GOLD : 'none'}>
      <Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" stroke={GOLD} strokeWidth={2} />
    </Svg>
  );
}

function TrashIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="rgba(0,0,0,0.4)" strokeWidth={2} />
    </Svg>
  );
}

function BookmarkIcon() {
  return (
    <Svg width={48} height={48} viewBox="0 0 48 48" fill="none">
      <Path d="M12 8h24v36l-12-8-12 8V8z" stroke={GOLD} strokeWidth={2} />
    </Svg>
  );
}

function PackageIcon() {
  return (
    <Svg width={48} height={48} viewBox="0 0 48 48" fill="none">
      <Path d="M6 14l18-10 18 10v20l-18 10-18-10V14z" stroke={GOLD} strokeWidth={2} />
      <Path d="M6 14l18 10 18-10M24 44V24" stroke={GOLD} strokeWidth={2} />
    </Svg>
  );
}

function ChevronRight() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M9 18l6-6-6-6" stroke="rgba(0,0,0,0.3)" strokeWidth={2} />
    </Svg>
  );
}

// ── Helpers ──

function formatDollars(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// ── Tabs ──

type Tab = 'cart' | 'saved' | 'orders';
const TABS: { id: Tab; label: string }[] = [
  { id: 'cart', label: 'Cart' },
  { id: 'saved', label: 'Saved' },
  { id: 'orders', label: 'Orders' },
];

// ══════════════════════════════════════════════════
// Screen
// ══════════════════════════════════════════════════

export default function ShopScreen() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<Tab>('cart');
  const { cartItems, addToCart, removeFromCart, savedProducts, removeFromSaved } = useAppStore();

  const cartTotalCents = cartItems.reduce((sum, ci) => sum + ci.product.price * ci.quantity, 0);

  const handleShopAtRetailer = (url: string) => {
    if (url) WebBrowser.openBrowserAsync(url);
  };

  const handleShopAll = () => {
    if (cartItems.length === 0) return;
    Alert.alert(
      'Opening retailer sites',
      'You may need to check out separately on each retailer\'s website.',
      [{ text: 'OK', onPress: () => {
        const first = cartItems[0]?.product.affiliate_url;
        if (first) WebBrowser.openBrowserAsync(first);
      }}],
    );
  };

  const handleRemoveCart = (id: string) => {
    removeFromCart(id);
  };

  const handleAddToCartFromSaved = (product: Product) => {
    addToCart({ id: product.id, product, quantity: 1, added_at: new Date().toISOString() });
  };

  // ── Cart content ──
  const renderCartTab = () => {
    if (cartItems.length === 0) {
      return (
        <View style={styles.emptyWrap}>
          <BagIcon />
          <Text style={styles.emptyTitle}>Your cart is empty</Text>
          <Text style={styles.emptySub}>Start designing a room to add products</Text>
          <TouchableOpacity style={styles.emptyBtn} activeOpacity={0.85}>
            <Text style={styles.emptyBtnText}>Go to Rooms</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        {cartItems.map((ci) => (
          <View key={ci.id} style={styles.itemCard}>
            <Image source={{ uri: ci.product.image_url }} style={styles.itemImage} resizeMode="cover" />
            <View style={styles.itemInfo}>
              <Text style={styles.itemName} numberOfLines={2}>{ci.product.name}</Text>
              <View style={styles.retailerBadge}>
                <Text style={styles.retailerBadgeText}>{ci.product.retailer}</Text>
              </View>
              <Text style={styles.itemPrice}>{formatDollars(ci.product.price)}</Text>
              <View style={styles.itemActions}>
                <TouchableOpacity
                  style={styles.shopRetailerBtn}
                  onPress={() => handleShopAtRetailer(ci.product.affiliate_url)}
                >
                  <Text style={styles.shopRetailerText}>Shop at Retailer</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.trashBtn} onPress={() => handleRemoveCart(ci.id)}>
                  <TrashIcon />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ))}

        {/* Cart summary */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal ({cartItems.length} items)</Text>
            <Text style={styles.summaryValue}>{formatDollars(cartTotalCents)}</Text>
          </View>
          <Text style={styles.summaryNote}>Prices and availability from retailer sites</Text>
          <TouchableOpacity style={styles.shopAllBtn} activeOpacity={0.85} onPress={handleShopAll}>
            <Text style={styles.shopAllBtnText}>Shop All Items</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  };

  // ── Saved content ──
  const renderSavedTab = () => {
    if (savedProducts.length === 0) {
      return (
        <View style={styles.emptyWrap}>
          <BookmarkIcon />
          <Text style={styles.emptyTitle}>No saved items</Text>
          <Text style={styles.emptySub}>Tap the heart on products to save them for later</Text>
        </View>
      );
    }

    return (
      <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        {savedProducts.map((p) => (
          <View key={p.id} style={styles.itemCard}>
            <Image source={{ uri: p.image_url }} style={styles.itemImage} resizeMode="cover" />
            <View style={styles.itemInfo}>
              <View style={styles.savedTitleRow}>
                <Text style={[styles.itemName, { flex: 1 }]} numberOfLines={2}>{p.name}</Text>
                <TouchableOpacity onPress={() => removeFromSaved(p.id)}>
                  <HeartIcon filled />
                </TouchableOpacity>
              </View>
              <View style={styles.retailerBadge}>
                <Text style={styles.retailerBadgeText}>{p.retailer}</Text>
              </View>
              <Text style={styles.itemPrice}>{formatDollars(p.price)}</Text>
              <TouchableOpacity style={styles.addToCartBtn} onPress={() => handleAddToCartFromSaved(p)}>
                <Text style={styles.addToCartBtnText}>Add to Cart</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>
    );
  };

  // ── Orders content (always Coming Soon in V1) ──
  const renderOrdersTab = () => (
    <View style={styles.emptyWrap}>
      <PackageIcon />
      <Text style={styles.emptyTitle}>Order History Coming Soon</Text>
      <Text style={styles.emptySub}>Your purchase history will appear here in a future update.</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: 16 }]}>
        <View style={{ width: 60 }} />
        <Text style={styles.headerTitle}>Shop</Text>
        <View style={styles.tokenPill}>
          <View style={styles.tokenDot} />
          <Text style={styles.tokenText}>999</Text>
        </View>
      </View>

      {/* ── Tab bar ── */}
      <View style={styles.tabBar}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={styles.tab}
              activeOpacity={0.7}
              onPress={() => setActiveTab(tab.id)}
            >
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{tab.label}</Text>
              {isActive && <View style={styles.tabIndicator} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Content ── */}
      <View style={styles.content}>
        {activeTab === 'cart' && renderCartTab()}
        {activeTab === 'saved' && renderSavedTab()}
        {activeTab === 'orders' && renderOrdersTab()}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BG },

  // ── Header ──
  header: {
    backgroundColor: BG,
    paddingBottom: 16, paddingHorizontal: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  headerTitle: {
    color: 'white', fontSize: 18, letterSpacing: 1, fontWeight: '400',
    flex: 1, textAlign: 'center',
  },
  tokenPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  tokenDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: GOLD },
  tokenText: { color: 'white', fontSize: 14, fontWeight: '500' },

  // ── Tab bar ──
  tabBar: {
    backgroundColor: 'white',
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  tab: {
    flex: 1, height: 48,
    alignItems: 'center', justifyContent: 'center',
  },
  tabText: { fontSize: 15, color: 'rgba(0,0,0,0.4)' },
  tabTextActive: { color: GOLD, fontWeight: '500' },
  tabIndicator: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: 2, backgroundColor: GOLD,
  },

  // ── Content ──
  content: { flex: 1, backgroundColor: CREAM },
  tabContent: { flex: 1 },

  // ── Empty states ──
  emptyWrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 40, minHeight: 400,
  },
  emptyTitle: { fontSize: 20, fontWeight: '400', color: BG, marginTop: 16 },
  emptySub: { color: 'rgba(0,0,0,0.45)', fontSize: 14, marginTop: 8, textAlign: 'center', paddingHorizontal: 40 },
  emptyBtn: {
    marginTop: 24, backgroundColor: GOLD, borderRadius: 24,
    paddingHorizontal: 32, paddingVertical: 14,
  },
  emptyBtnText: { color: BG, fontSize: 15, fontWeight: '600' },

  // ── Item card ──
  itemCard: {
    backgroundColor: 'white', borderRadius: 12, marginBottom: 10,
    padding: 12, flexDirection: 'row',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 2,
  },
  itemImage: { width: 80, height: 80, borderRadius: 8 },
  itemInfo: { flex: 1, marginLeft: 12 },
  itemName: { fontSize: 15, fontWeight: '600', color: BG },
  retailerBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(196,164,90,0.15)', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 3, marginTop: 4,
  },
  retailerBadgeText: { color: GOLD, fontSize: 11 },
  itemPrice: { color: GOLD, fontSize: 17, fontWeight: '600', marginTop: 6, marginBottom: 8 },
  itemActions: { flexDirection: 'row', gap: 8 },
  shopRetailerBtn: {
    borderWidth: 1, borderColor: GOLD, borderRadius: 16,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  shopRetailerText: { color: GOLD, fontSize: 12, fontWeight: '500' },
  trashBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.04)',
    alignItems: 'center', justifyContent: 'center',
  },

  // ── Saved tab ──
  savedTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  addToCartBtn: {
    alignSelf: 'flex-start',
    backgroundColor: GOLD, borderRadius: 16,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  addToCartBtnText: { color: BG, fontSize: 12, fontWeight: '500' },

  // ── Summary ──
  summaryCard: {
    backgroundColor: 'white', borderRadius: 12, padding: 16, marginTop: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 2,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  summaryLabel: { color: 'rgba(0,0,0,0.5)', fontSize: 14 },
  summaryValue: { color: BG, fontSize: 14, fontWeight: '500' },
  summaryNote: { color: 'rgba(0,0,0,0.4)', fontSize: 12, fontStyle: 'italic', marginBottom: 12 },
  shopAllBtn: {
    width: '100%', backgroundColor: GOLD, borderRadius: 24,
    paddingVertical: 14, alignItems: 'center',
  },
  shopAllBtnText: { color: BG, fontSize: 15, fontWeight: '600' },
});

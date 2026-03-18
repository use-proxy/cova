import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Image,
  Linking,
} from 'react-native';
import { useAppStore } from '../../store';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { CartItem, Product } from '@cova/shared';

type ShopTab = 'cart' | 'matched';

export default function ShopScreen() {
  const [activeTab, setActiveTab] = useState<ShopTab>('cart');
  const { cartItems, matchedProducts, addToCart, removeFromCart } = useAppStore();

  const formatPrice = (price: number) => `$${price.toLocaleString()}`;

  const handleCheckout = () => {
    cartItems.forEach((item) => {
      if (item.product.affiliate_url) {
        Linking.openURL(item.product.affiliate_url);
      }
    });
  };

  const renderCartItem = ({ item }: { item: CartItem }) => (
    <View style={styles.card}>
      <Image source={{ uri: item.product.image_url }} style={styles.cardImage} resizeMode="cover" />
      <View style={styles.cardInfo}>
        <Text style={styles.cardName} numberOfLines={2}>{item.product.name}</Text>
        <Text style={styles.cardRetailer}>{item.product.retailer}</Text>
        <Text style={styles.cardPrice}>{formatPrice(item.product.price)}</Text>
        <View style={styles.quantityRow}>
          <Text style={styles.quantityText}>Qty: {item.quantity}</Text>
          <TouchableOpacity onPress={() => removeFromCart(item.id)} style={styles.removeButton}>
            <Text style={styles.removeIcon}>🗑</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  const renderMatchedProduct = ({ item }: { item: Product }) => (
    <View style={styles.card}>
      <Image source={{ uri: item.image_url }} style={styles.cardImage} resizeMode="cover" />
      <View style={styles.cardInfo}>
        <Text style={styles.cardName} numberOfLines={2}>{item.name}</Text>
        <Text style={styles.cardRetailer}>{item.retailer}</Text>
        <Text style={styles.cardPrice}>{formatPrice(item.price)}</Text>
        <TouchableOpacity
          style={styles.addToCartButton}
          onPress={() => addToCart({ id: item.id, product: item, quantity: 1, added_at: new Date().toISOString() })}
        >
          <Text style={styles.addToCartText}>Add to Cart</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Shop</Text>
        {cartItems.length > 0 && (
          <View style={styles.cartBadge}>
            <Text style={styles.cartBadgeText}>{cartItems.length}</Text>
          </View>
        )}
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'cart' && styles.tabActive]}
          onPress={() => setActiveTab('cart')}
        >
          <Text style={[styles.tabText, activeTab === 'cart' && styles.tabTextActive]}>Cart</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'matched' && styles.tabActive]}
          onPress={() => setActiveTab('matched')}
        >
          <Text style={[styles.tabText, activeTab === 'matched' && styles.tabTextActive]}>Matched</Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {activeTab === 'cart' ? (
        <>
          <FlatList
            data={cartItems}
            renderItem={renderCartItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>🛒</Text>
                <Text style={styles.emptyTitle}>Your cart is empty</Text>
                <Text style={styles.emptySubtext}>Browse matched products to add items</Text>
              </View>
            }
          />
          {cartItems.length > 0 && (
            <View style={styles.checkoutBar}>
              <TouchableOpacity style={styles.checkoutButton} onPress={handleCheckout}>
                <Text style={styles.checkoutText}>Checkout</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      ) : (
        <FlatList
          data={matchedProducts}
          renderItem={renderMatchedProduct}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>✨</Text>
              <Text style={styles.emptyTitle}>No matched products yet</Text>
              <Text style={styles.emptySubtext}>Complete a render to see matched products</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F0E8',
  },
  header: {
    backgroundColor: '#1B3A2D',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: 'white',
  },
  cartBadge: {
    backgroundColor: '#C47B3C',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  cartBadgeText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '700',
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 8,
  },
  tab: {
    flex: 1,
    height: 40,
    borderRadius: 28,
    backgroundColor: '#F5F0E8',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(27,58,45,0.15)',
  },
  tabActive: {
    backgroundColor: '#1B3A2D',
    borderColor: '#1B3A2D',
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1B3A2D',
  },
  tabTextActive: {
    color: 'white',
  },
  listContent: {
    padding: 16,
    gap: 12,
    flexGrow: 1,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    flexDirection: 'row',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  cardImage: {
    width: 80,
    height: 80,
    margin: 12,
    borderRadius: 8,
  },
  cardInfo: {
    flex: 1,
    padding: 12,
    paddingLeft: 0,
    justifyContent: 'center',
  },
  cardName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 2,
  },
  cardRetailer: {
    fontSize: 12,
    color: '#888888',
    marginBottom: 4,
  },
  cardPrice: {
    fontSize: 16,
    fontWeight: '800',
    color: '#C47B3C',
    marginBottom: 6,
  },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  quantityText: {
    fontSize: 13,
    color: '#888888',
    fontWeight: '600',
  },
  removeButton: {
    padding: 4,
  },
  removeIcon: {
    fontSize: 18,
  },
  addToCartButton: {
    backgroundColor: '#1B3A2D',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
  },
  addToCartText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1B3A2D',
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#888888',
    textAlign: 'center',
  },
  checkoutBar: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  checkoutButton: {
    backgroundColor: '#C47B3C',
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkoutText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
});

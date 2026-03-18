import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
  PanResponder,
  Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RoomStackParamList } from '../../navigation/RoomNavigator';
import { useAppStore } from '../../store';
import { supabase } from '../../lib/supabase';
import type { SwipeCard, StyleBlend, StyleName } from '@cova/shared';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SWIPE_THRESHOLD = 80;

const FALLBACK_CARDS: SwipeCard[] = [
  { id: 'f1', image_url: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=800', room_type: 'living_room', style_weights: { coastal: 0.8, minimalist: 0.2 }, active: true },
  { id: 'f2', image_url: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800', room_type: 'living_room', style_weights: { japandi: 0.8, minimalist: 0.2 }, active: true },
  { id: 'f3', image_url: 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=800', room_type: 'living_room', style_weights: { bohemian: 0.8, mid_century: 0.2 }, active: true },
  { id: 'f4', image_url: 'https://images.unsplash.com/photo-1598928506311-c55ez363776c?w=800', room_type: 'living_room', style_weights: { mid_century: 0.8, japandi: 0.2 }, active: true },
  { id: 'f5', image_url: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800', room_type: 'living_room', style_weights: { minimalist: 0.8, coastal: 0.2 }, active: true },
];

const STYLE_KEYS: StyleName[] = ['coastal', 'japandi', 'bohemian', 'mid_century', 'minimalist'];

function normalizeBlend(blend: StyleBlend): StyleBlend {
  const sum = STYLE_KEYS.reduce((acc, k) => acc + blend[k], 0);
  if (sum === 0) return { coastal: 0.2, japandi: 0.2, bohemian: 0.2, mid_century: 0.2, minimalist: 0.2 };
  const normalized = { ...blend };
  for (const k of STYLE_KEYS) {
    normalized[k] = blend[k] / sum;
  }
  return normalized;
}

export default function StyleQuizScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RoomStackParamList>>();
  const { updateRoom, currentRoom } = useAppStore();

  const [cards, setCards] = useState<SwipeCard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [styleBlend, setStyleBlend] = useState<StyleBlend>({
    coastal: 0.2, japandi: 0.2, bohemian: 0.2, mid_century: 0.2, minimalist: 0.2,
  });
  const [loading, setLoading] = useState(true);

  const swipeAnim = useRef(new Animated.ValueXY()).current;
  const rotateAnim = swipeAnim.x.interpolate({
    inputRange: [-200, 0, 200],
    outputRange: ['-15deg', '0deg', '15deg'],
  });
  const likeOpacity = swipeAnim.x.interpolate({
    inputRange: [0, 80],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const nopeOpacity = swipeAnim.x.interpolate({
    inputRange: [-80, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const nextCardScale = swipeAnim.x.interpolate({
    inputRange: [-200, 0, 200],
    outputRange: [1, 0.95, 1],
    extrapolate: 'clamp',
  });

  useEffect(() => {
    loadCards();
  }, []);

  const loadCards = async () => {
    try {
      const { data, error } = await supabase
        .from('swipe_cards')
        .select('*')
        .eq('active', true)
        .limit(20);

      if (error || !data || data.length === 0) {
        setCards(FALLBACK_CARDS);
      } else {
        setCards(data as SwipeCard[]);
      }
    } catch {
      setCards(FALLBACK_CARDS);
    } finally {
      setLoading(false);
    }
  };

  const handleSwipeRight = () => {
    const card = cards[currentIndex];
    if (!card) return;
    const newBlend = { ...styleBlend };
    for (const key of STYLE_KEYS) {
      const weight = card.style_weights[key] ?? 0;
      newBlend[key] = newBlend[key] * (1 + weight * 0.3);
    }
    setStyleBlend(normalizeBlend(newBlend));
    advanceCard('right');
  };

  const handleSwipeLeft = () => {
    const card = cards[currentIndex];
    if (!card) return;
    const newBlend = { ...styleBlend };
    for (const key of STYLE_KEYS) {
      const weight = card.style_weights[key] ?? 0;
      newBlend[key] = newBlend[key] * (1 - weight * 0.3);
    }
    setStyleBlend(normalizeBlend(newBlend));
    advanceCard('left');
  };

  const advanceCard = (direction: 'left' | 'right') => {
    const toValue = direction === 'right' ? SCREEN_WIDTH + 100 : -SCREEN_WIDTH - 100;
    Animated.timing(swipeAnim, {
      toValue: { x: toValue, y: 0 },
      duration: 220,
      useNativeDriver: true,
    }).start(() => {
      swipeAnim.setValue({ x: 0, y: 0 });
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      if (nextIndex >= 10 || nextIndex >= cards.length) {
        handleComplete();
      }
    });
  };

  const handleComplete = () => {
    const finalBlend = normalizeBlend(styleBlend);
    if (currentRoom) {
      updateRoom(currentRoom.id, { style_blend: finalBlend });
    }
    navigation.navigate('Viewer3D', {});
  };

  const handleSkip = () => {
    advanceCard('left');
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 10,
      onPanResponderMove: Animated.event(
        [null, { dx: swipeAnim.x, dy: swipeAnim.y }],
        { useNativeDriver: false },
      ),
      onPanResponderRelease: (_, gs) => {
        if (gs.dx > SWIPE_THRESHOLD) {
          handleSwipeRight();
        } else if (gs.dx < -SWIPE_THRESHOLD) {
          handleSwipeLeft();
        } else {
          Animated.spring(swipeAnim, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: true,
            friction: 5,
          }).start();
        }
      },
    }),
  ).current;

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (currentIndex >= cards.length || cards.length === 0) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.doneText}>Style profile complete!</Text>
      </View>
    );
  }

  const currentCard = cards[currentIndex];
  const nextCard = currentIndex + 1 < cards.length ? cards[currentIndex + 1] : null;

  const progressDots = Array.from({ length: Math.min(cards.length, 10) }, (_, i) => i);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Discover Your Style</Text>
        <View style={styles.progressRow}>
          {progressDots.map((i) => (
            <View
              key={i}
              style={[styles.progressDot, i <= currentIndex ? styles.progressDotActive : null]}
            />
          ))}
        </View>
      </View>

      <View style={styles.cardStack}>
        {/* Next card (background) */}
        {nextCard && (
          <Animated.View style={[styles.card, styles.cardBehind, { transform: [{ scale: nextCardScale }] }]}>
            <Image source={{ uri: nextCard.image_url }} style={styles.cardImage} resizeMode="cover" />
          </Animated.View>
        )}

        {/* Current card */}
        <Animated.View
          style={[
            styles.card,
            {
              transform: [
                { translateX: swipeAnim.x },
                { translateY: swipeAnim.y },
                { rotate: rotateAnim },
              ],
            },
          ]}
          {...panResponder.panHandlers}
        >
          <Image source={{ uri: currentCard.image_url }} style={styles.cardImage} resizeMode="cover" />

          {/* LIKE overlay */}
          <Animated.View style={[styles.badge, styles.likeBadge, { opacity: likeOpacity }]}>
            <Text style={styles.likeBadgeText}>LIKE</Text>
          </Animated.View>

          {/* NOPE overlay */}
          <Animated.View style={[styles.badge, styles.nopeBadge, { opacity: nopeOpacity }]}>
            <Text style={styles.nopeBadgeText}>NOPE</Text>
          </Animated.View>
        </Animated.View>
      </View>

      <View style={styles.bottomRow}>
        <TouchableOpacity style={styles.actionBtn} onPress={handleSwipeLeft}>
          <Text style={styles.nopeBtnText}>✕</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.skipBtn} onPress={handleSkip}>
          <Text style={styles.skipBtnText}>Skip</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={handleSwipeRight}>
          <Text style={styles.likeBtnText}>♥</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const CARD_WIDTH = SCREEN_WIDTH - 48;
const CARD_HEIGHT = SCREEN_HEIGHT * 0.55;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1B3A2D',
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#F5F0E8',
    fontSize: 18,
    fontWeight: '600',
  },
  doneText: {
    color: '#F5F0E8',
    fontSize: 22,
    fontWeight: '700',
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 12,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: 'white',
    marginBottom: 12,
  },
  progressRow: {
    flexDirection: 'row',
    gap: 6,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  progressDotActive: {
    backgroundColor: '#C47B3C',
  },
  cardStack: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 20,
    overflow: 'hidden',
    position: 'absolute',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  cardBehind: {
    top: -8,
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  badge: {
    position: 'absolute',
    top: 40,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 3,
  },
  likeBadge: {
    right: 20,
    borderColor: '#2E7D32',
    backgroundColor: 'rgba(46,125,50,0.15)',
  },
  likeBadgeText: {
    color: '#2E7D32',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 2,
  },
  nopeBadge: {
    left: 20,
    borderColor: '#CC3333',
    backgroundColor: 'rgba(204,51,51,0.15)',
  },
  nopeBadgeText: {
    color: '#CC3333',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 2,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 32,
    gap: 24,
  },
  actionBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  nopeBtnText: {
    fontSize: 28,
    color: '#CC3333',
    fontWeight: '800',
  },
  likeBtnText: {
    fontSize: 28,
    color: '#2E7D32',
    fontWeight: '800',
  },
  skipBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  skipBtnText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 15,
    fontWeight: '600',
  },
});

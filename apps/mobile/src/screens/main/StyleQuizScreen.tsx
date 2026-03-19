import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
  PanResponder,
  Image,
  Modal,
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
const QUIZ_TIMEOUT_MS = 180_000;

const STYLE_KEYS: StyleName[] = ['coastal', 'japandi', 'bohemian', 'mid_century', 'minimalist'];

const EQUAL_BLEND: StyleBlend = {
  coastal: 0.2, japandi: 0.2, bohemian: 0.2, mid_century: 0.2, minimalist: 0.2,
};

function normalizeBlend(blend: StyleBlend): StyleBlend {
  const sum = STYLE_KEYS.reduce((acc, k) => acc + blend[k], 0);
  if (sum === 0) return { ...EQUAL_BLEND };
  const normalized = { ...blend };
  for (const k of STYLE_KEYS) {
    normalized[k] = blend[k] / sum;
  }
  return normalized;
}

function isNonDefaultBlend(blend: StyleBlend | undefined | null): boolean {
  if (!blend) return false;
  const threshold = 0.01;
  return STYLE_KEYS.some((k) => Math.abs(blend[k] - 0.2) > threshold);
}

type QuizPhase = 'instructions' | 'quiz';

export default function StyleQuizScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RoomStackParamList>>();
  const { updateRoom, currentRoom } = useAppStore();

  const [phase, setPhase] = useState<QuizPhase>('instructions');
  const [cards, setCards] = useState<SwipeCard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [styleBlend, setStyleBlend] = useState<StyleBlend>({ ...EQUAL_BLEND });
  const [loading, setLoading] = useState(true);
  const [showBlendModal, setShowBlendModal] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completedRef = useRef(false);

  const roomType = currentRoom?.room_type ?? 'living_room';

  const fallbackCards: SwipeCard[] = [
    { id: 'f1', image_url: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=800', room_type: roomType, style_weights: { coastal: 0.8, minimalist: 0.2 }, active: true },
    { id: 'f2', image_url: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800', room_type: roomType, style_weights: { japandi: 0.8, minimalist: 0.2 }, active: true },
    { id: 'f3', image_url: 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=800', room_type: roomType, style_weights: { bohemian: 0.8, mid_century: 0.2 }, active: true },
    { id: 'f4', image_url: 'https://images.unsplash.com/photo-1598928506311-c55ez363776c?w=800', room_type: roomType, style_weights: { mid_century: 0.8, japandi: 0.2 }, active: true },
    { id: 'f5', image_url: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800', room_type: roomType, style_weights: { minimalist: 0.8, coastal: 0.2 }, active: true },
  ];

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

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const loadCards = async () => {
    try {
      const { data, error } = await supabase
        .from('swipe_cards')
        .select('*')
        .eq('active', true)
        .eq('room_type', roomType)
        .limit(20);

      if (error || !data || data.length === 0) {
        setCards(fallbackCards);
      } else {
        setCards(data as SwipeCard[]);
      }
    } catch {
      setCards(fallbackCards);
    } finally {
      setLoading(false);
    }
  };

  const startQuizTimer = () => {
    timerRef.current = setTimeout(() => {
      if (!completedRef.current) {
        handleComplete();
      }
    }, QUIZ_TIMEOUT_MS);
  };

  const handleStartQuiz = () => {
    if (isNonDefaultBlend(currentRoom?.style_blend)) {
      setShowBlendModal(true);
    } else {
      setPhase('quiz');
      startQuizTimer();
    }
  };

  const handleUseExistingStyle = () => {
    setShowBlendModal(false);
    navigation.navigate('RoomCapture');
  };

  const handleStartFresh = () => {
    setShowBlendModal(false);
    setStyleBlend({ ...EQUAL_BLEND });
    setPhase('quiz');
    startQuizTimer();
  };

  const handleSkipToCapture = () => {
    if (currentRoom) {
      updateRoom(currentRoom.id, { style_blend: { ...EQUAL_BLEND } });
    }
    navigation.navigate('RoomCapture');
  };

  const handleComplete = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const finalBlend = normalizeBlend(styleBlend);
    if (currentRoom) {
      updateRoom(currentRoom.id, { style_blend: finalBlend });
    }
    const userId = useAppStore.getState().user?.id;
    if (userId) {
      supabase
        .from('users')
        .update({ style_blend: finalBlend })
        .eq('id', userId)
        .then(() => {});
    }
    navigation.navigate('RoomCapture');
  }, [styleBlend, currentRoom, updateRoom, navigation]);

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

  const handleNeutral = () => {
    advanceCard('right');
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

  // ── Instruction screen ──
  if (phase === 'instructions') {
    return (
      <SafeAreaView style={styles.container}>
        <TouchableOpacity style={styles.skipCorner} onPress={handleSkipToCapture}>
          <Text style={styles.skipCornerText}>Skip</Text>
        </TouchableOpacity>

        <View style={styles.instructionsBody}>
          <Text style={styles.instructionsTitle}>Discover Your Style</Text>

          <View style={styles.instructionsRows}>
            <View style={styles.instructionRow}>
              <Text style={styles.instructionIcon}>👉</Text>
              <Text style={styles.instructionText}>Swipe right if you love it</Text>
            </View>
            <View style={styles.instructionRow}>
              <Text style={styles.instructionIcon}>👈</Text>
              <Text style={styles.instructionText}>Swipe left if you don't</Text>
            </View>
            <View style={styles.instructionRow}>
              <Text style={styles.instructionIcon}>😐</Text>
              <Text style={styles.instructionText}>Tap Neutral if you're unsure</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.letsGoBtn} onPress={handleStartQuiz}>
            <Text style={styles.letsGoBtnText}>Let's Go</Text>
          </TouchableOpacity>
        </View>

        {/* Returning user style blend modal */}
        <Modal visible={showBlendModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Your Style Profile</Text>
              <Text style={styles.modalBody}>
                Use your previous style blend or discover something new?
              </Text>
              <TouchableOpacity style={styles.modalPrimaryBtn} onPress={handleUseExistingStyle}>
                <Text style={styles.modalPrimaryBtnText}>Use My Style</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalOutlineBtn} onPress={handleStartFresh}>
                <Text style={styles.modalOutlineBtnText}>Start Fresh</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  // ── Loading ──
  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  // ── Done ──
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

  // ── Quiz screen ──
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
        {nextCard && (
          <Animated.View style={[styles.card, styles.cardBehind, { transform: [{ scale: nextCardScale }] }]}>
            <Image source={{ uri: nextCard.image_url }} style={styles.cardImage} resizeMode="cover" />
          </Animated.View>
        )}

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

          <Animated.View style={[styles.badge, styles.likeBadge, { opacity: likeOpacity }]}>
            <Text style={styles.likeBadgeText}>LOVE</Text>
          </Animated.View>

          <Animated.View style={[styles.badge, styles.nopeBadge, { opacity: nopeOpacity }]}>
            <Text style={styles.nopeBadgeText}>PASS</Text>
          </Animated.View>
        </Animated.View>
      </View>

      <View style={styles.progressBarContainer}>
        <View style={[styles.progressBarFill, { width: `${Math.min(100, ((currentIndex + 1) / Math.max(cards.length, 1)) * 100)}%` }]} />
      </View>
      <View style={styles.bottomRow}>
        <TouchableOpacity style={styles.actionBtn} onPress={handleSwipeLeft}>
          <Text style={styles.nopeBtnText}>✕</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.neutralBtn} onPress={handleNeutral}>
          <Text style={styles.neutralBtnText}>Neutral</Text>
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

  // ── Instructions ──
  skipCorner: {
    position: 'absolute',
    top: 60,
    right: 24,
    zIndex: 10,
    padding: 8,
  },
  skipCornerText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 15,
    fontWeight: '600',
  },
  instructionsBody: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  instructionsTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#F5F0E8',
    marginBottom: 40,
    textAlign: 'center',
  },
  instructionsRows: {
    gap: 24,
    marginBottom: 48,
    width: '100%',
  },
  instructionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  instructionIcon: {
    fontSize: 28,
  },
  instructionText: {
    fontSize: 17,
    color: '#F5F0E8',
    fontWeight: '500',
    flex: 1,
  },
  letsGoBtn: {
    backgroundColor: '#C47B3C',
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 28,
  },
  letsGoBtnText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },

  // ── Modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#F5F0E8',
    borderRadius: 20,
    padding: 28,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1B3A2D',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalBody: {
    fontSize: 15,
    color: '#1A1A1A',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  modalPrimaryBtn: {
    backgroundColor: '#C47B3C',
    height: 52,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    marginBottom: 12,
  },
  modalPrimaryBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  modalOutlineBtn: {
    height: 52,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    borderWidth: 2,
    borderColor: '#1B3A2D',
  },
  modalOutlineBtnText: {
    color: '#1B3A2D',
    fontSize: 16,
    fontWeight: '700',
  },

  // ── Quiz header ──
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

  // ── Card stack ──
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

  // ── Bottom row ──
  progressBarContainer: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 2,
    marginHorizontal: 24,
    marginBottom: 12,
  },
  progressBarFill: {
    height: 4,
    backgroundColor: '#C47B3C',
    borderRadius: 2,
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
  neutralBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  neutralBtnText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 15,
    fontWeight: '600',
  },
});

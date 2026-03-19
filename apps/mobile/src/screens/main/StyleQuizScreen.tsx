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
import Svg, { Path, Line, Circle as SvgCircle } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RoomStackParamList } from '../../navigation/RoomNavigator';
import { useAppStore } from '../../store';
import { supabase } from '../../lib/supabase';
import type { SwipeCard, StyleBlend, StyleName } from '@cova/shared';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SWIPE_THRESHOLD = 120;
const QUIZ_TIMEOUT_MS = 180_000;
const MIN_SWIPES_BEFORE_COMPLETE = 10;
const CONFIDENCE_THRESHOLD = 0.65;
const CARD_W = SCREEN_WIDTH - 32;
const CARD_H = CARD_W / 0.74;

const BG = '#0A1628';
const GOLD = '#C4A45A';

const STYLE_KEYS: StyleName[] = ['coastal', 'japandi', 'bohemian', 'mid_century', 'minimalist'];
const EQUAL_BLEND: StyleBlend = {
  coastal: 0.2, japandi: 0.2, bohemian: 0.2, mid_century: 0.2, minimalist: 0.2,
};

function normalizeBlend(blend: StyleBlend): StyleBlend {
  const sum = STYLE_KEYS.reduce((acc, k) => acc + blend[k], 0);
  if (sum === 0) return { ...EQUAL_BLEND };
  const out = { ...blend };
  for (const k of STYLE_KEYS) out[k] = blend[k] / sum;
  return out;
}

function calcConfidence(blend: StyleBlend): number {
  return Math.max(...STYLE_KEYS.map((k) => blend[k]));
}

function isNonDefaultBlend(blend: StyleBlend | undefined | null): boolean {
  if (!blend) return false;
  return STYLE_KEYS.some((k) => Math.abs(blend[k] - 0.2) > 0.01);
}

// ── Double arch SVG ──

function DoubleArch({ size = 'small' }: { size?: 'small' | 'large' }) {
  const d = size === 'large'
    ? { ow: 60, oh: 80, iw: 42, ih: 55, so: 3, si: 2 }
    : { ow: 24, oh: 32, iw: 17, ih: 22, so: 2, si: 1.5 };

  return (
    <View style={{ width: d.ow, height: d.oh }}>
      <Svg
        width={d.ow}
        height={d.oh}
        viewBox={`0 0 ${d.ow} ${d.oh}`}
        fill="none"
        style={StyleSheet.absoluteFill}
      >
        <Path
          d={`M ${d.so} ${d.oh} V ${d.ow / 2} A ${d.ow / 2 - d.so} ${d.ow / 2 - d.so} 0 0 1 ${d.ow - d.so} ${d.ow / 2} V ${d.oh}`}
          stroke={GOLD}
          strokeWidth={d.so}
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
      <Svg
        width={d.iw}
        height={d.ih}
        viewBox={`0 0 ${d.iw} ${d.ih}`}
        fill="none"
        style={{
          position: 'absolute',
          left: (d.ow - d.iw) / 2,
          top: d.oh - d.ih,
        }}
      >
        <Path
          d={`M ${d.si} ${d.ih} V ${d.iw / 2} A ${d.iw / 2 - d.si} ${d.iw / 2 - d.si} 0 0 1 ${d.iw - d.si} ${d.iw / 2} V ${d.ih}`}
          stroke={GOLD}
          strokeWidth={d.si}
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
    </View>
  );
}

// ── Instruction icon helpers ──

function HeartIcon() {
  return (
    <View style={[styles.instrCircle, { backgroundColor: 'rgba(34,197,94,0.2)' }]}>
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
        <Path
          d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
          stroke="#22c55e"
          strokeWidth={2.5}
          fill="none"
        />
      </Svg>
    </View>
  );
}

function XIcon() {
  return (
    <View style={[styles.instrCircle, { backgroundColor: 'rgba(156,163,175,0.2)' }]}>
      <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
        <Line x1={18} y1={6} x2={6} y2={18} stroke="#9ca3af" strokeWidth={2.5} />
        <Line x1={6} y1={6} x2={18} y2={18} stroke="#9ca3af" strokeWidth={2.5} />
      </Svg>
    </View>
  );
}

function QuestionIcon() {
  return (
    <View style={[styles.instrCircle, { backgroundColor: 'rgba(196,164,90,0.2)' }]}>
      <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
        <SvgCircle cx={12} cy={12} r={10} stroke={GOLD} strokeWidth={2.5} fill="none" />
        <Path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" stroke={GOLD} strokeWidth={2.5} fill="none" />
        <Line x1={12} y1={17} x2={12.01} y2={17} stroke={GOLD} strokeWidth={2.5} />
      </Svg>
    </View>
  );
}

// ── Fallback cards ──

function makeFallbackCards(roomType: string): SwipeCard[] {
  return [
    { id: 'f1', image_url: 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=800&q=80', room_type: roomType as any, style_weights: { coastal: 0.6, minimalist: 0.4 }, active: true },
    { id: 'f2', image_url: 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=800&q=80', room_type: roomType as any, style_weights: { japandi: 0.7, minimalist: 0.3 }, active: true },
    { id: 'f3', image_url: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800&q=80', room_type: roomType as any, style_weights: { mid_century: 0.8, bohemian: 0.2 }, active: true },
    { id: 'f4', image_url: 'https://images.unsplash.com/photo-1567225557594-88d73e55f2cb?w=800&q=80', room_type: roomType as any, style_weights: { bohemian: 0.7, coastal: 0.3 }, active: true },
    { id: 'f5', image_url: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=800&q=80', room_type: roomType as any, style_weights: { minimalist: 0.6, japandi: 0.4 }, active: true },
    { id: 'f6', image_url: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800&q=80', room_type: roomType as any, style_weights: { coastal: 0.5, mid_century: 0.5 }, active: true },
    { id: 'f7', image_url: 'https://images.unsplash.com/photo-1617806118233-18e1de247200?w=800&q=80', room_type: roomType as any, style_weights: { japandi: 0.8, minimalist: 0.2 }, active: true },
    { id: 'f8', image_url: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&q=80', room_type: roomType as any, style_weights: { coastal: 0.8, bohemian: 0.2 }, active: true },
    { id: 'f9', image_url: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80', room_type: roomType as any, style_weights: { mid_century: 0.6, minimalist: 0.4 }, active: true },
    { id: 'f10', image_url: 'https://images.unsplash.com/photo-1598928506311-c55ez363776c?w=800&q=80', room_type: roomType as any, style_weights: { bohemian: 0.5, japandi: 0.5 }, active: true },
  ];
}

// ══════════════════════════════════════════════════
// Screen
// ══════════════════════════════════════════════════

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
  const [swipeCount, setSwipeCount] = useState(0);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completedRef = useRef(false);
  const quizStartTime = useRef(0);

  const roomType = currentRoom?.room_type ?? 'living_room';
  const totalCards = 20;

  // ── Animated values ──
  const position = useRef(new Animated.ValueXY()).current;

  const rotation = position.x.interpolate({
    inputRange: [-200, 0, 200],
    outputRange: ['-15deg', '0deg', '15deg'],
  });
  const loveBadgeOpacity = position.x.interpolate({
    inputRange: [0, 100],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const passBadgeOpacity = position.x.interpolate({
    inputRange: [-100, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const nextCardScale = position.x.interpolate({
    inputRange: [-200, 0, 200],
    outputRange: [1, 0.92, 1],
    extrapolate: 'clamp',
  });

  const progress = ((currentIndex + 1) / totalCards) * 100;

  // ── Load cards ──
  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from('swipe_cards')
          .select('*')
          .eq('active', true)
          .eq('room_type', roomType)
          .limit(20);
        if (error || !data || data.length === 0) {
          setCards(makeFallbackCards(roomType));
        } else {
          setCards(data as SwipeCard[]);
        }
      } catch {
        setCards(makeFallbackCards(roomType));
      } finally {
        setLoading(false);
      }
    })();
  }, [roomType]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // ── Complete handler ──
  const handleComplete = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }

    const finalBlend = normalizeBlend(styleBlend);
    if (currentRoom) updateRoom(currentRoom.id, { style_blend: finalBlend });

    const userId = useAppStore.getState().user?.id;
    if (userId) {
      supabase.from('users').update({ style_blend: finalBlend }).eq('id', userId).then(() => {});
    }
    navigation.navigate('RoomCapture');
  }, [styleBlend, currentRoom, updateRoom, navigation]);

  // ── Termination check ──
  const checkTermination = useCallback(
    (nextSwipeCount: number, nextIndex: number) => {
      const elapsed = Date.now() - quizStartTime.current;
      const confidence = calcConfidence(normalizeBlend(styleBlend));
      if (
        (nextSwipeCount >= MIN_SWIPES_BEFORE_COMPLETE && confidence >= CONFIDENCE_THRESHOLD) ||
        elapsed > QUIZ_TIMEOUT_MS ||
        nextIndex >= cards.length
      ) {
        handleComplete();
      }
    },
    [styleBlend, cards.length, handleComplete],
  );

  // ── Swipe handlers ──
  const animateOff = (toX: number, cb: () => void) => {
    Animated.timing(position, {
      toValue: { x: toX, y: 0 },
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      position.setValue({ x: 0, y: 0 });
      cb();
    });
  };

  const handleSwipeRight = () => {
    const card = cards[currentIndex];
    if (!card) return;
    const newBlend = { ...styleBlend };
    for (const k of STYLE_KEYS) {
      newBlend[k] = newBlend[k] * (1 + (card.style_weights[k] ?? 0) * 0.3);
    }
    const normalized = normalizeBlend(newBlend);
    setStyleBlend(normalized);

    animateOff(SCREEN_WIDTH + 100, () => {
      const nextIdx = currentIndex + 1;
      const nextCount = swipeCount + 1;
      setCurrentIndex(nextIdx);
      setSwipeCount(nextCount);
      checkTermination(nextCount, nextIdx);
    });
  };

  const handleSwipeLeft = () => {
    const card = cards[currentIndex];
    if (!card) return;
    const newBlend = { ...styleBlend };
    for (const k of STYLE_KEYS) {
      newBlend[k] = newBlend[k] * (1 - (card.style_weights[k] ?? 0) * 0.3);
    }
    const normalized = normalizeBlend(newBlend);
    setStyleBlend(normalized);

    animateOff(-SCREEN_WIDTH - 100, () => {
      const nextIdx = currentIndex + 1;
      const nextCount = swipeCount + 1;
      setCurrentIndex(nextIdx);
      setSwipeCount(nextCount);
      checkTermination(nextCount, nextIdx);
    });
  };

  const handleNotSure = () => {
    animateOff(SCREEN_WIDTH + 100, () => {
      const nextIdx = currentIndex + 1;
      setCurrentIndex(nextIdx);
      if (nextIdx >= cards.length) handleComplete();
    });
  };

  const resetCard = () => {
    Animated.spring(position, {
      toValue: { x: 0, y: 0 },
      useNativeDriver: true,
      friction: 5,
    }).start();
  };

  // ── PanResponder ──
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 10,
      onPanResponderMove: Animated.event(
        [null, { dx: position.x, dy: position.y }],
        { useNativeDriver: false },
      ),
      onPanResponderRelease: (_, gs) => {
        if (gs.dx > SWIPE_THRESHOLD) {
          handleSwipeRight();
        } else if (gs.dx < -SWIPE_THRESHOLD) {
          handleSwipeLeft();
        } else {
          resetCard();
        }
      },
    }),
  ).current;

  // ── Phase handlers ──
  const startQuizTimer = () => {
    quizStartTime.current = Date.now();
    timerRef.current = setTimeout(() => {
      if (!completedRef.current) handleComplete();
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

  const handleSkip = () => {
    if (currentRoom) updateRoom(currentRoom.id, { style_blend: { ...EQUAL_BLEND } });
    navigation.navigate('RoomCapture');
  };

  // ══════════════════════════════════════════════════
  // Instruction overlay
  // ══════════════════════════════════════════════════
  if (phase === 'instructions') {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.instrBody}>
          <DoubleArch size="large" />

          <Text style={styles.instrTitle}>Discover your style</Text>
          <Text style={styles.instrSub}>
            Swipe through rooms and we'll learn what you love
          </Text>

          <View style={styles.instrRows}>
            <View style={styles.instrRow}>
              <HeartIcon />
              <Text style={styles.instrRowText}>Swipe right if you love it</Text>
            </View>
            <View style={styles.instrRow}>
              <XIcon />
              <Text style={styles.instrRowText}>Swipe left to pass</Text>
            </View>
            <View style={styles.instrRow}>
              <QuestionIcon />
              <Text style={styles.instrRowText}>Tap "Not sure" to skip</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.startBtn} activeOpacity={0.85} onPress={handleStartQuiz}>
            <Text style={styles.startBtnText}>Start Swiping</Text>
          </TouchableOpacity>

          <Text style={styles.instrCount}>{totalCards} rooms to discover</Text>

          {/* Skip button */}
          <TouchableOpacity style={styles.skipBtn} onPress={handleSkip}>
            <Text style={styles.skipBtnText}>Skip</Text>
          </TouchableOpacity>
        </View>

        {/* Returning user modal */}
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

  // ══════════════════════════════════════════════════
  // Loading
  // ══════════════════════════════════════════════════
  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  // ══════════════════════════════════════════════════
  // Exhausted
  // ══════════════════════════════════════════════════
  if (currentIndex >= cards.length || cards.length === 0) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={styles.doneText}>Style profile complete!</Text>
      </View>
    );
  }

  const currentCard = cards[currentIndex];
  const nextCard = currentIndex + 1 < cards.length ? cards[currentIndex + 1] : null;
  const thirdCard = currentIndex + 2 < cards.length ? cards[currentIndex + 2] : null;

  // ══════════════════════════════════════════════════
  // Swipe screen
  // ══════════════════════════════════════════════════
  return (
    <SafeAreaView style={styles.root}>
      {/* ── Top bar ── */}
      <View style={styles.topBar}>
        <DoubleArch size="small" />
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.min(progress, 100)}%` }]} />
        </View>
      </View>

      {/* ── Card stack ── */}
      <View style={styles.cardArea}>
        <View style={styles.stackWrap}>
          {/* Back card (third) */}
          {thirdCard && (
            <View
              style={[
                styles.card,
                { transform: [{ scale: 0.92 }, { translateY: 16 }], opacity: 0.5 },
              ]}
            >
              <Image source={{ uri: thirdCard.image_url }} style={styles.cardImg} resizeMode="cover" />
            </View>
          )}

          {/* Middle card (next) */}
          {nextCard && (
            <Animated.View
              style={[
                styles.card,
                { transform: [{ scale: nextCardScale }, { translateY: 8 }], opacity: 0.75 },
              ]}
            >
              <Image source={{ uri: nextCard.image_url }} style={styles.cardImg} resizeMode="cover" />
            </Animated.View>
          )}

          {/* Top card (draggable) */}
          <Animated.View
            style={[
              styles.card,
              {
                transform: [
                  { translateX: position.x },
                  { translateY: position.y },
                  { rotate: rotation },
                ],
              },
            ]}
            {...panResponder.panHandlers}
          >
            <Image source={{ uri: currentCard.image_url }} style={styles.cardImg} resizeMode="cover" />

            {/* Bottom gradient overlay */}
            <View style={styles.cardGradient} />

            {/* LOVE badge */}
            <Animated.View style={[styles.badge, styles.loveBadge, { opacity: loveBadgeOpacity }]}>
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="white">
                <Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" fill="white" />
              </Svg>
              <Text style={styles.loveBadgeText}>LOVE</Text>
            </Animated.View>

            {/* PASS badge */}
            <Animated.View style={[styles.badge, styles.passBadge, { opacity: passBadgeOpacity }]}>
              <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                <Line x1={18} y1={6} x2={6} y2={18} stroke="white" strokeWidth={3} />
                <Line x1={6} y1={6} x2={18} y2={18} stroke="white" strokeWidth={3} />
              </Svg>
              <Text style={styles.passBadgeText}>PASS</Text>
            </Animated.View>
          </Animated.View>
        </View>
      </View>

      {/* ── Not sure button ── */}
      <View style={styles.bottomArea}>
        <TouchableOpacity style={styles.notSureBtn} activeOpacity={0.8} onPress={handleNotSure}>
          <Text style={styles.notSureBtnText}>Not sure</Text>
        </TouchableOpacity>
        <Text style={styles.progressLabel}>
          {currentIndex + 1} of {totalCards}
        </Text>
      </View>
    </SafeAreaView>
  );
}

// ══════════════════════════════════════════════════
// Styles
// ══════════════════════════════════════════════════

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 18,
  },
  doneText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '600',
  },

  // ── Instructions ──
  instrBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  instrTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '400',
    marginTop: 24,
    textAlign: 'center',
  },
  instrSub: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 8,
  },
  instrRows: {
    marginTop: 32,
    width: '100%',
    maxWidth: 300,
    gap: 20,
  },
  instrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  instrCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  instrRowText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 15,
    flex: 1,
  },
  startBtn: {
    marginTop: 40,
    backgroundColor: GOLD,
    paddingHorizontal: 48,
    paddingVertical: 16,
    borderRadius: 28,
  },
  startBtnText: {
    color: BG,
    fontSize: 16,
    fontWeight: '600',
  },
  instrCount: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    marginTop: 16,
  },
  skipBtn: {
    position: 'absolute',
    top: 16,
    right: 24,
    padding: 8,
  },
  skipBtnText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 15,
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
    fontWeight: '700',
    color: BG,
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
    backgroundColor: GOLD,
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
    borderColor: BG,
  },
  modalOutlineBtnText: {
    color: BG,
    fontSize: 16,
    fontWeight: '700',
  },

  // ── Top bar ──
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  progressTrack: {
    flex: 1,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 2,
    marginLeft: 12,
    overflow: 'hidden',
  },
  progressFill: {
    height: 3,
    backgroundColor: GOLD,
    borderRadius: 2,
  },

  // ── Card area ──
  cardArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  stackWrap: {
    width: CARD_W,
    height: CARD_H,
  },
  card: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 20,
    overflow: 'hidden',
    position: 'absolute',
  },
  cardImg: {
    width: '100%',
    height: '100%',
  },
  cardGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '40%',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  badge: {
    position: 'absolute',
    top: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 24,
  },
  loveBadge: {
    left: 24,
    backgroundColor: 'rgba(34,197,94,0.9)',
  },
  loveBadgeText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  passBadge: {
    right: 24,
    backgroundColor: 'rgba(107,114,128,0.9)',
  },
  passBadgeText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },

  // ── Bottom ──
  bottomArea: {
    alignItems: 'center',
    paddingBottom: 32,
  },
  notSureBtn: {
    paddingHorizontal: 48,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 28,
    marginBottom: 16,
  },
  notSureBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  progressLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
  },
});

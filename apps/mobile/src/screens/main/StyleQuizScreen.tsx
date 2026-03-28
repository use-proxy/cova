import React, { useState, useRef, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Sentry, logProductDeviation, setCurrentScreen, setFlowStep } from '../../lib/sentry';
import { track } from '../../lib/posthog';
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
  ActivityIndicator,
} from 'react-native';
import Svg, { Path, Line, Circle as SvgCircle } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RoomStackParamList } from '../../navigation/RoomNavigator';
import { useAppStore } from '../../store';
import { supabase } from '../../lib/supabase';
import type { SwipeCard, StyleBlend, StyleName, RoomType } from '@cova/shared';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SWIPE_THRESHOLD = 120;
const QUIZ_TIMEOUT_MS = 120_000; // 2 minutes
const MIN_SWIPES_BEFORE_COMPLETE = 10;
const CONFIDENCE_THRESHOLD_PHASE1 = 0.60;
const CONFIDENCE_THRESHOLD_PHASE2 = 0.65;
const BASELINE_CARDS_PER_STYLE = 2;
const CARD_W = SCREEN_WIDTH - 32;
const CARD_H = CARD_W / 0.74;

const BG = '#0A1628';
const GOLD = '#C4A45A';

const STYLE_KEYS: StyleName[] = ['coastal', 'japandi', 'bohemian', 'mid_century', 'minimalist'];
const EQUAL_BLEND: StyleBlend = {
  coastal: 0.2, japandi: 0.2, bohemian: 0.2, mid_century: 0.2, minimalist: 0.2,
};

// ── Pure functions ──

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

function getTop2Styles(blend: StyleBlend): [StyleName, StyleName] {
  const sorted = STYLE_KEYS.slice().sort((a, b) => blend[b] - blend[a]);
  return [sorted[0], sorted[1]];
}

/** Derive style_weights from the style string when the DB column is null */
function deriveWeights(card: SwipeCard): Partial<StyleBlend> {
  if (card.style_weights && Object.keys(card.style_weights).length > 0) {
    return card.style_weights;
  }
  const style = card.style as string | undefined;
  if (style && STYLE_KEYS.includes(style as StyleName)) {
    const w: Partial<StyleBlend> = {};
    for (const k of STYLE_KEYS) w[k] = k === style ? 1.0 : 0.0;
    return w;
  }
  return { coastal: 0.2, japandi: 0.2, bohemian: 0.2, mid_century: 0.2, minimalist: 0.2 };
}

function fisherYatesShuffle<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
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

// ── Fallback cards (used when Supabase fetch fails) ──

function makeFallbackCards(roomType: RoomType): SwipeCard[] {
  return [
    { id: 'f1', image_url: 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=800&q=80', room_type: roomType, style: 'coastal', style_weights: { coastal: 1.0, japandi: 0.0, bohemian: 0.0, mid_century: 0.0, minimalist: 0.0 }, active: true, phase: 'baseline' },
    { id: 'f2', image_url: 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=800&q=80', room_type: roomType, style: 'coastal', style_weights: { coastal: 1.0, japandi: 0.0, bohemian: 0.0, mid_century: 0.0, minimalist: 0.0 }, active: true, phase: 'baseline' },
    { id: 'f3', image_url: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800&q=80', room_type: roomType, style: 'japandi', style_weights: { coastal: 0.0, japandi: 1.0, bohemian: 0.0, mid_century: 0.0, minimalist: 0.0 }, active: true, phase: 'baseline' },
    { id: 'f4', image_url: 'https://images.unsplash.com/photo-1617806118233-18e1de247200?w=800&q=80', room_type: roomType, style: 'japandi', style_weights: { coastal: 0.0, japandi: 1.0, bohemian: 0.0, mid_century: 0.0, minimalist: 0.0 }, active: true, phase: 'baseline' },
    { id: 'f5', image_url: 'https://images.unsplash.com/photo-1567225557594-88d73e55f2cb?w=800&q=80', room_type: roomType, style: 'bohemian', style_weights: { coastal: 0.0, japandi: 0.0, bohemian: 1.0, mid_century: 0.0, minimalist: 0.0 }, active: true, phase: 'baseline' },
    { id: 'f6', image_url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80', room_type: roomType, style: 'bohemian', style_weights: { coastal: 0.0, japandi: 0.0, bohemian: 1.0, mid_century: 0.0, minimalist: 0.0 }, active: true, phase: 'baseline' },
    { id: 'f7', image_url: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800&q=80', room_type: roomType, style: 'mid_century', style_weights: { coastal: 0.0, japandi: 0.0, bohemian: 0.0, mid_century: 1.0, minimalist: 0.0 }, active: true, phase: 'baseline' },
    { id: 'f8', image_url: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80', room_type: roomType, style: 'mid_century', style_weights: { coastal: 0.0, japandi: 0.0, bohemian: 0.0, mid_century: 1.0, minimalist: 0.0 }, active: true, phase: 'baseline' },
    { id: 'f9', image_url: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=800&q=80', room_type: roomType, style: 'minimalist', style_weights: { coastal: 0.0, japandi: 0.0, bohemian: 0.0, mid_century: 0.0, minimalist: 1.0 }, active: true, phase: 'baseline' },
    { id: 'f10', image_url: 'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=800&q=80', room_type: roomType, style: 'minimalist', style_weights: { coastal: 0.0, japandi: 0.0, bohemian: 0.0, mid_century: 0.0, minimalist: 1.0 }, active: true, phase: 'baseline' },
  ];
}

// ══════════════════════════════════════════════════
// Screen
// ══════════════════════════════════════════════════

type QuizPhase = 'instructions' | 'quiz';

function StyleQuizScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RoomStackParamList>>();
  const { updateRoom, currentRoom, rooms } = useAppStore();

  const [phase, setPhase] = useState<QuizPhase>('instructions');
  const [cards, setCards] = useState<SwipeCard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [styleBlend, setStyleBlend] = useState<StyleBlend>({ ...EQUAL_BLEND });
  const [loading, setLoading] = useState(true);
  const [showBlendModal, setShowBlendModal] = useState(false);
  const [swipeCount, setSwipeCount] = useState(0);
  const [showPrevStyleModal, setShowPrevStyleModal] = useState(false);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  // Track swipe history for back button: each entry is { cardIndex, blendBefore }
  const swipeHistoryRef = useRef<{ cardIndex: number; blendBefore: StyleBlend }[]>([]);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completedRef = useRef(false);
  const quizStartTime = useRef(0);
  const prevBlendRef = useRef<StyleBlend | null>(null);
  const isAnimatingRef = useRef(false);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const isFetchingRefinementRef = useRef(false);
  const inPhase2Ref = useRef(false);

  // Single ref for all swipe state — PanResponder reads/writes this directly (no stale closures)
  const swipeStateRef = useRef<{
    currentIndex: number;
    styleBlend: StyleBlend;
    swipeCount: number;
    isAnimating: boolean;
  }>({ currentIndex: 0, styleBlend: { ...EQUAL_BLEND }, swipeCount: 0, isAnimating: false });
  const checkTerminationRef = useRef<(nextSwipeCount: number, nextIndex: number, currentBlend: StyleBlend) => void>(() => {});
  const swipeRightRef = useRef<() => void>(() => {});
  const swipeLeftRef = useRef<() => void>(() => {});
  // Ref to latest cards array for async fetch callback
  const cardsRef = useRef<SwipeCard[]>([]);
  cardsRef.current = cards;

  // Register screen context for Sentry
  useEffect(() => {
    setCurrentScreen('StyleQuizScreen');
    setFlowStep('quiz');
  }, []);

  // On mount: check if any existing room has a non-default style_blend
  useEffect(() => {
    const existing = rooms.find(
      (r) => r.id !== currentRoom?.id && r.style_blend && isNonDefaultBlend(r.style_blend as StyleBlend),
    );
    if (existing?.style_blend) {
      prevBlendRef.current = existing.style_blend as StyleBlend;
      setShowPrevStyleModal(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // On mount: check for saved quiz progress (mid-quiz app close)
  useEffect(() => {
    if (!currentRoom) return;
    const key = `quiz_progress_${currentRoom.id}`;
    AsyncStorage.getItem(key).then((raw) => {
      if (!raw) return;
      try {
        const saved = JSON.parse(raw) as { blend: StyleBlend; swipeCount: number; cardIndex: number };
        if (saved.swipeCount > 0) {
          setShowResumeModal(true);
          // Store so we can restore later
          prevBlendRef.current = saved.blend;
        }
      } catch { /* ignore corrupt data */ }
    });
  }, [currentRoom?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const roomType = currentRoom?.room_type ?? 'living_room';
  const totalCards = 20; // visual cap for progress bar

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

  const progress = ((swipeCount) / totalCards) * 100;
  const confidence = calcConfidence(styleBlend);

  // Confidence-based progress label (no style names shown)
  const progressHint =
    confidence < 0.40 ? 'Getting to know your style...' :
    confidence < 0.60 ? 'Almost there...' :
    'Your style is emerging';

  // ── Phase 1: Load baseline cards (2 per style, shuffled) ──
  useEffect(() => {
    (async () => {
      try {
        const baselineCards: SwipeCard[] = [];
        for (const style of STYLE_KEYS) {
          const { data, error } = await supabase
            .from('swipe_cards')
            .select('*')
            .eq('room_type', roomType)
            .eq('style', style)
            .eq('phase', 'baseline')
            .limit(10);
          if (!error && data && data.length > 0) {
            const shuffled = fisherYatesShuffle(data);
            baselineCards.push(...shuffled.slice(0, BASELINE_CARDS_PER_STYLE) as SwipeCard[]);
          }
        }
        if (baselineCards.length === 0) {
          setCards(makeFallbackCards(roomType));
        } else {
          const shuffled = fisherYatesShuffle(baselineCards);
          // Ensure style_weights are populated
          for (const card of shuffled) {
            card.style_weights = deriveWeights(card);
          }
          setCards(shuffled);
          for (const c of shuffled) seenIdsRef.current.add(c.id);
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

  // ── Phase 2: Fetch refinement card dynamically ──
  const handleCompleteRef = useRef<(force?: boolean) => void>(() => {});

  const fetchRefinementCard = useCallback(async (blend: StyleBlend) => {
    if (isFetchingRefinementRef.current) return;
    if (completedRef.current) return;
    isFetchingRefinementRef.current = true;
    inPhase2Ref.current = true;
    setIsRefining(true);

    // Safety: if fetch takes >3s, release the lock so timeout can fire
    const safetyTimer = setTimeout(() => {
      if (isFetchingRefinementRef.current) {
        isFetchingRefinementRef.current = false;
        setIsRefining(false);
      }
    }, 3000);

    try {
      const [top1, top2] = getTop2Styles(blend);
      const seenIds = Array.from(seenIdsRef.current);

      // Try refinement cards first
      let query = supabase
        .from('swipe_cards')
        .select('*')
        .eq('room_type', roomType)
        .eq('phase', 'refinement')
        .limit(5);
      if (seenIds.length > 0) {
        query = query.not('id', 'in', `(${seenIds.join(',')})`);
      }
      const { data: refinementData } = await query;

      let nextCard: SwipeCard | null = null;
      if (refinementData && refinementData.length > 0) {
        for (const card of fisherYatesShuffle(refinementData)) {
          const w = card.style_weights as Partial<StyleBlend> | null;
          if (w && ((w[top1] ?? 0) > 0.2 || (w[top2] ?? 0) > 0.2)) {
            nextCard = card as SwipeCard;
            break;
          }
        }
        if (!nextCard) nextCard = refinementData[0] as SwipeCard;
      }

      // Fallback: any unseen baseline card for top style
      if (!nextCard) {
        let fallbackQuery = supabase
          .from('swipe_cards')
          .select('*')
          .eq('room_type', roomType)
          .eq('style', top1)
          .limit(3);
        if (seenIds.length > 0) {
          fallbackQuery = fallbackQuery.not('id', 'in', `(${seenIds.join(',')})`);
        }
        const { data: fallbackData } = await fallbackQuery;
        if (fallbackData && fallbackData.length > 0) {
          nextCard = fallbackData[0] as SwipeCard;
        }
      }

      if (nextCard && !completedRef.current) {
        nextCard.style_weights = deriveWeights(nextCard);
        seenIdsRef.current.add(nextCard.id);
        setCards((prev) => [...prev, nextCard!]);
      } else if (!completedRef.current) {
        // No more cards — complete the quiz
        handleCompleteRef.current(false);
      }
    } catch {
      if (!completedRef.current) handleCompleteRef.current(false);
    } finally {
      clearTimeout(safetyTimer);
      isFetchingRefinementRef.current = false;
      setIsRefining(false);
    }
  }, [roomType]);

  // ── Complete handler ──
  // force=true bypasses the isFetchingRefinement guard (used by timeout)
  const handleComplete = useCallback((force = false) => {
    if (completedRef.current) return;
    if (!force && isFetchingRefinementRef.current) return;
    completedRef.current = true;
    isFetchingRefinementRef.current = false;
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }

    const finalBlend = normalizeBlend(swipeStateRef.current.styleBlend);
    console.log('QUIZ COMPLETE — FINAL BLEND:', JSON.stringify(finalBlend));
    track('quiz_completed', {
      style_blend: finalBlend,
      swipe_count: swipeStateRef.current.swipeCount,
      room_type: roomType,
    });

    // Save to Zustand store
    useAppStore.getState().setStyleBlend(finalBlend);
    useAppStore.getState().completeQuiz();

    // Save to room record
    if (currentRoom) {
      updateRoom(currentRoom.id, { style_blend: finalBlend });
      void supabase.from('rooms').update({ style_blend: finalBlend }).eq('id', currentRoom.id);
    }

    // Save to user record (best-effort)
    const userId = useAppStore.getState().user?.id;
    if (userId) {
      void supabase.from('users').update({ style_blend: finalBlend }).eq('id', userId);
    }
    // Clear saved quiz progress
    if (currentRoom) {
      void AsyncStorage.removeItem(`quiz_progress_${currentRoom.id}`);
    }
    navigation.navigate('BudgetSlider');
  }, [currentRoom, updateRoom, navigation]);
  handleCompleteRef.current = handleComplete;

  // ── Termination check ──
  const checkTermination = useCallback(
    (nextSwipeCount: number, nextIndex: number, currentBlend: StyleBlend) => {
      if (completedRef.current) return;
      // Don't block on isFetchingRefinement — let timeout and confidence checks run
      const elapsed = Date.now() - quizStartTime.current;
      const conf = calcConfidence(currentBlend);
      const threshold = inPhase2Ref.current ? CONFIDENCE_THRESHOLD_PHASE2 : CONFIDENCE_THRESHOLD_PHASE1;

      // Hard timeout — force complete regardless of fetch state
      if (elapsed > QUIZ_TIMEOUT_MS) {
        handleComplete(true);
        return;
      }

      // Confidence-based completion (only after enough swipes)
      if (nextSwipeCount >= MIN_SWIPES_BEFORE_COMPLETE && conf >= threshold) {
        handleComplete(false);
        return;
      }

      // Cards exhausted — fetch more, never terminate on exhaustion alone
      if (nextIndex >= cards.length && !isFetchingRefinementRef.current) {
        void fetchRefinementCard(currentBlend);
        return;
      }

      // Pre-fetch: if running low on cards and past baseline
      if (nextSwipeCount >= 10 && nextIndex >= cards.length - 1 && !isFetchingRefinementRef.current) {
        void fetchRefinementCard(currentBlend);
      }
    },
    [cards.length, handleComplete, fetchRefinementCard],
  );
  checkTerminationRef.current = checkTermination;

  // ── Save quiz progress for mid-quiz resume ──
  const saveQuizProgress = useCallback((blend: StyleBlend, count: number, idx: number) => {
    if (!currentRoom) return;
    const key = `quiz_progress_${currentRoom.id}`;
    void AsyncStorage.setItem(key, JSON.stringify({ blend, swipeCount: count, cardIndex: idx }));
  }, [currentRoom]);

  // ── Swipe handlers ──
  const animateOff = (toX: number, cb: () => void) => {
    if (swipeStateRef.current.isAnimating) {
      logProductDeviation(
        'FEATURE_3',
        'One card is visible and swipeable at a time — never two cards side by side',
        'Swipe triggered while card exit animation was already in progress',
        'CRITICAL_DEVIATION',
      );
    }
    swipeStateRef.current.isAnimating = true;
    isAnimatingRef.current = true;
    Animated.timing(position, {
      toValue: { x: toX, y: 0 },
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      swipeStateRef.current.isAnimating = false;
      isAnimatingRef.current = false;
      position.setValue({ x: 0, y: 0 });
      cb();
    });
  };

  const handleSwipeRight = () => {
    const state = swipeStateRef.current;
    if (state.isAnimating) return;
    const card = cardsRef.current[state.currentIndex];
    if (!card) return;
    const weights = deriveWeights(card);
    const prevBlend = { ...state.styleBlend };
    const newBlend = { ...state.styleBlend };
    for (const k of STYLE_KEYS) {
      newBlend[k] = newBlend[k] * (1 + (weights[k] ?? 0) * 0.6);
    }
    const normalized = normalizeBlend(newBlend);
    if (!STYLE_KEYS.some((k) => Math.abs(normalized[k] - prevBlend[k]) > 0.001)) {
      logProductDeviation(
        'FEATURE_3',
        'Algorithm adapts in real time — subsequent cards shift toward liked aesthetics',
        'Style blend did not change after swipe right — card style_weights may be all zero',
        'HIGH_DEVIATION',
      );
    }

    animateOff(SCREEN_WIDTH + 100, () => {
      swipeHistoryRef.current.push({ cardIndex: state.currentIndex, blendBefore: prevBlend });
      const nextIdx = state.currentIndex + 1;
      const nextCount = state.swipeCount + 1;
      state.currentIndex = nextIdx;
      state.styleBlend = normalized;
      state.swipeCount = nextCount;
      setCurrentIndex(nextIdx);
      setStyleBlend(normalized);
      setSwipeCount(nextCount);
      saveQuizProgress(normalized, nextCount, nextIdx);
      checkTerminationRef.current(nextCount, nextIdx, normalized);
    });
  };

  const handleSwipeLeft = () => {
    const state = swipeStateRef.current;
    if (state.isAnimating) return;
    const card = cardsRef.current[state.currentIndex];
    if (!card) return;
    const weights = deriveWeights(card);
    const prevBlend = { ...state.styleBlend };
    const newBlend = { ...state.styleBlend };
    for (const k of STYLE_KEYS) {
      newBlend[k] = newBlend[k] * (1 - (weights[k] ?? 0) * 0.4);
    }
    const normalized = normalizeBlend(newBlend);
    if (!STYLE_KEYS.some((k) => Math.abs(normalized[k] - prevBlend[k]) > 0.001)) {
      logProductDeviation(
        'FEATURE_3',
        'Algorithm adapts in real time — subsequent cards shift toward liked aesthetics',
        'Style blend did not change after swipe left — card style_weights may be all zero',
        'HIGH_DEVIATION',
      );
    }

    animateOff(-SCREEN_WIDTH - 100, () => {
      swipeHistoryRef.current.push({ cardIndex: state.currentIndex, blendBefore: prevBlend });
      const nextIdx = state.currentIndex + 1;
      const nextCount = state.swipeCount + 1;
      state.currentIndex = nextIdx;
      state.styleBlend = normalized;
      state.swipeCount = nextCount;
      setCurrentIndex(nextIdx);
      setStyleBlend(normalized);
      setSwipeCount(nextCount);
      saveQuizProgress(normalized, nextCount, nextIdx);
      checkTerminationRef.current(nextCount, nextIdx, normalized);
    });
  };

  const handleNotSure = () => {
    const state = swipeStateRef.current;
    if (state.isAnimating) return;
    const currentBlend = normalizeBlend(state.styleBlend);
    animateOff(SCREEN_WIDTH + 100, () => {
      swipeHistoryRef.current.push({ cardIndex: state.currentIndex, blendBefore: { ...state.styleBlend } });
      const nextIdx = state.currentIndex + 1;
      const nextCount = state.swipeCount + 1;
      state.currentIndex = nextIdx;
      state.swipeCount = nextCount;
      setCurrentIndex(nextIdx);
      setSwipeCount(nextCount);
      saveQuizProgress(state.styleBlend, nextCount, nextIdx);
      checkTerminationRef.current(nextCount, nextIdx, currentBlend);
    });
  };

  // ── Back button handler: revert last swipe ──
  const handleGoBack = () => {
    const state = swipeStateRef.current;
    if (state.isAnimating) return;
    const history = swipeHistoryRef.current;
    if (history.length === 0) return;
    const last = history.pop()!;
    const prevIdx = last.cardIndex;
    const prevCount = Math.max(0, state.swipeCount - 1);
    state.currentIndex = prevIdx;
    state.styleBlend = last.blendBefore;
    state.swipeCount = prevCount;
    setCurrentIndex(prevIdx);
    setStyleBlend(last.blendBefore);
    setSwipeCount(prevCount);
    saveQuizProgress(last.blendBefore, prevCount, prevIdx);
  };

  // ── "I'm done" handler ──
  const handleImDone = () => {
    if (completedRef.current) return;
    handleComplete(true);
  };

  const resetCard = () => {
    Animated.spring(position, {
      toValue: { x: 0, y: 0 },
      useNativeDriver: true,
      friction: 5,
    }).start();
  };

  swipeRightRef.current = handleSwipeRight;
  swipeLeftRef.current = handleSwipeLeft;

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
          swipeRightRef.current();
        } else if (gs.dx < -SWIPE_THRESHOLD) {
          swipeLeftRef.current();
        } else {
          if (Math.abs(gs.dx) > SWIPE_THRESHOLD * 0.6) {
            logProductDeviation(
              'FEATURE_3',
              'Cards must be physically swipeable with a finger gesture',
              `Swipe gesture of ${Math.round(Math.abs(gs.dx))}px did not cross threshold (${SWIPE_THRESHOLD}px)`,
              'HIGH_DEVIATION',
            );
          }
          resetCard();
        }
      },
    }),
  ).current;

  // ── Phase handlers ──
  const startQuizTimer = () => {
    quizStartTime.current = Date.now();
    timerRef.current = setTimeout(() => {
      if (!completedRef.current) handleComplete(true); // force=true bypasses fetch guard
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
    // Clear saved quiz progress
    if (currentRoom) {
      void AsyncStorage.removeItem(`quiz_progress_${currentRoom.id}`);
    }
    navigation.navigate('BudgetSlider');
  };

  const handleStartFresh = () => {
    setShowBlendModal(false);
    setStyleBlend({ ...EQUAL_BLEND });
    setPhase('quiz');
    startQuizTimer();
  };

  const handleSkip = () => {
    const blend = swipeCount > 0 ? normalizeBlend(swipeStateRef.current.styleBlend) : { ...EQUAL_BLEND };
    if (currentRoom) {
      updateRoom(currentRoom.id, { style_blend: blend });
      void supabase.from('rooms').update({ style_blend: blend }).eq('id', currentRoom.id);
    }
    useAppStore.getState().setStyleBlend(blend);
    // Clear saved quiz progress
    if (currentRoom) {
      void AsyncStorage.removeItem(`quiz_progress_${currentRoom.id}`);
    }
    navigation.navigate('BudgetSlider');
  };

  const handleUsePreviousStyle = () => {
    const blend = prevBlendRef.current;
    if (currentRoom && blend) {
      updateRoom(currentRoom.id, { style_blend: blend });
      void supabase.from('rooms').update({ style_blend: blend }).eq('id', currentRoom.id);
    }
    setShowPrevStyleModal(false);
    // Clear saved quiz progress
    if (currentRoom) {
      void AsyncStorage.removeItem(`quiz_progress_${currentRoom.id}`);
    }
    navigation.navigate('BudgetSlider');
  };

  const handleDiscoverNewStyle = () => {
    setShowPrevStyleModal(false);
  };

  // ── Resume quiz handlers ──
  const handleResumeQuiz = async () => {
    setShowResumeModal(false);
    if (!currentRoom) return;
    const key = `quiz_progress_${currentRoom.id}`;
    const raw = await AsyncStorage.getItem(key);
    if (!raw) { setPhase('quiz'); startQuizTimer(); return; }
    try {
      const saved = JSON.parse(raw) as { blend: StyleBlend; swipeCount: number; cardIndex: number };
      setStyleBlend(saved.blend);
      setSwipeCount(saved.swipeCount);
      setCurrentIndex(saved.cardIndex);
      swipeStateRef.current.styleBlend = saved.blend;
      swipeStateRef.current.swipeCount = saved.swipeCount;
      swipeStateRef.current.currentIndex = saved.cardIndex;
      setPhase('quiz');
      startQuizTimer();
    } catch {
      setPhase('quiz');
      startQuizTimer();
    }
  };

  const handleStartOver = () => {
    setShowResumeModal(false);
    if (currentRoom) {
      void AsyncStorage.removeItem(`quiz_progress_${currentRoom.id}`);
    }
    setStyleBlend({ ...EQUAL_BLEND });
    swipeStateRef.current.styleBlend = { ...EQUAL_BLEND };
    swipeStateRef.current.swipeCount = 0;
    swipeStateRef.current.currentIndex = 0;
    setSwipeCount(0);
    setCurrentIndex(0);
    swipeHistoryRef.current = [];
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

          <Text style={styles.instrRowText}>Swipe right if you love it, swipe left if you don't, tap neutral if you're unsure</Text>

          <TouchableOpacity style={styles.startBtn} activeOpacity={0.85} onPress={handleStartQuiz}>
            <Text style={styles.startBtnText}>Start Swiping</Text>
          </TouchableOpacity>

          <Text style={styles.instrCount}>{totalCards} rooms to discover</Text>

          <TouchableOpacity style={styles.skipBtn} onPress={handleSkip}>
            <Text style={styles.skipBtnText}>Skip</Text>
          </TouchableOpacity>
        </View>

        {/* Previous style modal */}
        <Modal visible={showPrevStyleModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Your Style Profile</Text>
              <Text style={styles.modalBody}>
                Use your previous style or discover something new for this room?
              </Text>
              <TouchableOpacity style={styles.modalPrimaryBtn} onPress={handleUsePreviousStyle}>
                <Text style={styles.modalPrimaryBtnText}>Use My Previous Style</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalOutlineBtn} onPress={handleDiscoverNewStyle}>
                <Text style={styles.modalOutlineBtnText}>Discover New Style</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

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

        {/* Resume quiz modal */}
        <Modal visible={showResumeModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Continue your style quiz?</Text>
              <Text style={styles.modalBody}>
                You left off partway through. Pick up where you stopped or start over.
              </Text>
              <TouchableOpacity style={styles.modalPrimaryBtn} onPress={handleResumeQuiz}>
                <Text style={styles.modalPrimaryBtnText}>Resume</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalOutlineBtn} onPress={handleStartOver}>
                <Text style={styles.modalOutlineBtnText}>Start Over</Text>
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
  // Cards exhausted — show spinner while fetching refinement, or done
  // ══════════════════════════════════════════════════
  if (currentIndex >= cards.length || cards.length === 0) {
    // While fetching a refinement card, show spinner — NEVER call handleComplete from render
    if (isRefining || isFetchingRefinementRef.current) {
      return (
        <SafeAreaView style={[styles.root, styles.center]}>
          <ActivityIndicator size="large" color={GOLD} />
          <Text style={[styles.loadingText, { marginTop: 16 }]}>Refining your style...</Text>
        </SafeAreaView>
      );
    }
    // Quiz is done
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={styles.doneText}>Style profile complete!</Text>
      </View>
    );
  }

  const currentCard = cards[currentIndex];
  const nextCard = currentIndex + 1 < cards.length ? cards[currentIndex + 1] : null;

  // ══════════════════════════════════════════════════
  // Swipe screen
  // ══════════════════════════════════════════════════
  return (
    <SafeAreaView style={styles.root}>
      {/* ── Top bar ── */}
      <View style={styles.topBar}>
        {swipeHistoryRef.current.length > 0 ? (
          <TouchableOpacity onPress={handleGoBack} style={styles.backCardBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={styles.backCardBtnText}>←</Text>
          </TouchableOpacity>
        ) : (
          <DoubleArch size="small" />
        )}
        <ProgressBar progress={progress} />
      </View>

      {/* ── Card stack ── */}
      <View style={styles.cardArea}>
        <View style={styles.stackWrap}>
          {/* Pre-load next card off-screen */}
          {nextCard && (
            <View style={[styles.card, { opacity: 0, position: 'absolute' }]}>
              <Image source={{ uri: nextCard.image_url }} style={styles.cardImg} resizeMode="cover" />
            </View>
          )}

          {/* Top card (draggable) */}
          <Animated.View
            testID="quiz-card"
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

      {/* ── Bottom area ── */}
      <View style={styles.bottomArea}>
        <TouchableOpacity style={styles.notSureBtn} activeOpacity={0.8} onPress={handleNotSure}>
          <Text style={styles.notSureBtnText}>Not sure</Text>
        </TouchableOpacity>
        {swipeCount >= MIN_SWIPES_BEFORE_COMPLETE && (
          <TouchableOpacity style={styles.imDoneBtn} activeOpacity={0.8} onPress={handleImDone}>
            <Text style={styles.imDoneBtnText}>I'm done</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.progressLabel}>
          {progressHint}
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
  backCardBtn: {
    width: 24,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backCardBtnText: {
    color: GOLD,
    fontSize: 22,
  },
  notSureBtn: {
    paddingHorizontal: 48,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 28,
    marginBottom: 12,
  },
  notSureBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  imDoneBtn: {
    paddingHorizontal: 32,
    paddingVertical: 10,
    marginBottom: 12,
  },
  imDoneBtnText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 14,
  },
  progressLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
  },
});

const ProgressBar = React.memo(({ progress }: { progress: number }) => (
  <View style={styles.progressTrack}>
    <View style={[styles.progressFill, { width: `${Math.min(progress, 100)}%` }]} />
  </View>
));

export default Sentry.withErrorBoundary(StyleQuizScreen, {
  fallback: <></>,
});

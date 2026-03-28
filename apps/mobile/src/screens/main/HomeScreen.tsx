import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Image,
  Alert,
  Dimensions,
  Animated,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { HomeStackParamList } from '../../navigation/HomeStack';
import { useAppStore } from '../../store';
import { supabase } from '../../lib/supabase';
import type { Room, RoomType, Render, StyleName } from '@cova/shared';

const BG = '#0A1628';
const GOLD = '#B8860B';
const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const HERO_HEIGHT = SCREEN_HEIGHT * 0.4;
const COL_GAP = 8;
const SIDE_PAD = 16;
const CARD_COL_W = (SCREEN_WIDTH - SIDE_PAD * 2 - COL_GAP) / 2;

const STYLE_COLORS: Record<StyleName, string> = {
  coastal: '#4A9ECA',
  japandi: '#8A7560',
  bohemian: '#C4622D',
  mid_century: '#C49A22',
  minimalist: '#C8C4BC',
};

const STYLE_LABELS: Record<StyleName, string> = {
  coastal: 'Coastal',
  japandi: 'Japandi',
  bohemian: 'Bohemian',
  mid_century: 'Mid-Century',
  minimalist: 'Minimalist',
};

const FILTER_CHIPS: { key: StyleName | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'coastal', label: 'Coastal' },
  { key: 'japandi', label: 'Japandi' },
  { key: 'bohemian', label: 'Bohemian' },
  { key: 'mid_century', label: 'Mid-Century' },
  { key: 'minimalist', label: 'Minimalist' },
];

const ROOM_TYPES: { key: RoomType; label: string }[] = [
  { key: 'living_room', label: 'Living Room' },
  { key: 'bedroom', label: 'Bedroom' },
  { key: 'dining_room', label: 'Dining Room' },
  { key: 'home_office', label: 'Home Office' },
  { key: 'kitchen', label: 'Kitchen' },
  { key: 'bathroom', label: 'Bathroom' },
  { key: 'entryway', label: 'Entryway' },
];

function getDominant(blend: Record<string, number>): StyleName {
  const entries = (Object.entries(blend) as [StyleName, number][]);
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

function getGreeting(name: string | null): string {
  const hour = new Date().getHours();
  const first = name?.split(' ')[0] ?? 'there';
  if (hour >= 6 && hour < 12) return `Good morning, ${first}`;
  if (hour >= 12 && hour < 18) return `Good afternoon, ${first}`;
  return `Good evening, ${first}`;
}

// ── Double Arch SVG ──

function DoubleArch({ color = GOLD }: { color?: string }) {
  return (
    <View style={{ width: 28, height: 36 }}>
      <Svg width={28} height={36} viewBox="0 0 28 36" fill="none" style={StyleSheet.absoluteFill}>
        <Path
          d="M2 36 V12.6 Q2 2 14 2 Q26 2 26 12.6 V36"
          stroke={color}
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
        />
      </Svg>
      <Svg width={20} height={26} viewBox="0 0 20 26" fill="none" style={{ position: 'absolute', left: 4, top: 10 }}>
        <Path
          d="M2 26 V9.1 Q2 2 10 2 Q18 2 18 9.1 V26"
          stroke={color}
          strokeWidth={1.5}
          fill="none"
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}

// ── Blend bar ──

function BlendBar({ blend }: { blend: Record<string, number> }) {
  const entries = (Object.entries(blend) as [StyleName, number][]).sort((a, b) => b[1] - a[1]);
  return (
    <View style={bbStyles.row}>
      {entries.map(([style, pct]) => (
        <View key={style} style={[bbStyles.seg, { flex: pct, backgroundColor: STYLE_COLORS[style] }]} />
      ))}
    </View>
  );
}
const bbStyles = StyleSheet.create({
  row: { flexDirection: 'row', height: 3, borderRadius: 2, overflow: 'hidden', marginTop: 6 },
  seg: { height: 3 },
});

// ── Masonry card ──

function MasonryCard({
  room,
  index,
  onPress,
  onLongPress,
}: {
  room: Room;
  index: number;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  const cardH = index % 3 === 0 ? 200 : index % 3 === 1 ? 165 : 185;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 280,
      delay: index * 50,
      useNativeDriver: true,
    }).start();
  }, []);

  const dominant = getDominant(room.style_blend as Record<string, number>);

  return (
    <Animated.View
      style={[
        mcStyles.card,
        { height: cardH },
        {
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
        },
      ]}
    >
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        activeOpacity={0.88}
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={500}
      >
        {room.latest_render_url ? (
          <Image
            source={{ uri: room.latest_render_url }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : (
          <View style={mcStyles.placeholder} />
        )}
        <View style={mcStyles.overlay} />
        <View style={mcStyles.footer}>
          <Text style={mcStyles.roomName} numberOfLines={1}>{room.name}</Text>
          <Text style={mcStyles.styleLabel}>{STYLE_LABELS[dominant as StyleName] ?? dominant}</Text>
          <BlendBar blend={room.style_blend as Record<string, number>} />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const mcStyles = StyleSheet.create({
  card: { width: CARD_COL_W, borderRadius: 12, overflow: 'hidden', marginBottom: COL_GAP },
  placeholder: { flex: 1, backgroundColor: '#132035' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)' },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 10,
    backgroundColor: 'rgba(10,22,40,0.75)',
  },
  roomName: { color: '#FFFFFF', fontSize: 11, fontWeight: '600' },
  styleLabel: { color: GOLD, fontSize: 10, marginTop: 2 },
});

// ── Hero card ──

function HeroCard({ room, onPress }: { room: Room; onPress: () => void }) {
  const dominant = getDominant(room.style_blend as Record<string, number>);
  const isIncomplete = !room.latest_render_url;

  return (
    <TouchableOpacity style={[heroStyles.card, { height: HERO_HEIGHT }]} activeOpacity={0.92} onPress={onPress}>
      {room.latest_render_url ? (
        <Image source={{ uri: room.latest_render_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <View style={heroStyles.placeholder} />
      )}
      {/* Bottom gradient — two layers to simulate dark bottom, transparent top */}
      <View style={heroStyles.gradientMid} />
      <View style={heroStyles.gradientBottom} />
      {/* Info */}
      <View style={heroStyles.footer}>
        <View style={heroStyles.footerLeft}>
          <Text style={heroStyles.roomName}>{room.name}</Text>
          <Text style={heroStyles.styleLabel}>{STYLE_LABELS[dominant as StyleName] ?? dominant}</Text>
          <BlendBar blend={room.style_blend as Record<string, number>} />
        </View>
        {isIncomplete && (
          <TouchableOpacity style={heroStyles.continueBtn} onPress={onPress}>
            <Text style={heroStyles.continueBtnText}>Continue Designing</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}

const heroStyles = StyleSheet.create({
  card: {
    marginHorizontal: SIDE_PAD,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#132035',
  },
  placeholder: { flex: 1, backgroundColor: '#132035' },
  gradientMid: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '50%',
    backgroundColor: 'rgba(10,22,40,0.3)',
  },
  gradientBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '30%',
    backgroundColor: 'rgba(10,22,40,0.6)',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: 'rgba(10,22,40,0.7)',
  },
  footerLeft: { flex: 1, marginRight: 12 },
  roomName: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  styleLabel: { color: GOLD, fontSize: 13, marginTop: 2 },
  continueBtn: {
    backgroundColor: GOLD,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  continueBtnText: { color: BG, fontSize: 13, fontWeight: '700' },
});

// ── Main screen ──

export default function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const user = useAppStore((s) => s.user);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<StyleName | 'all'>('all');
  const [displayCount, setDisplayCount] = useState(12);

  const fetchRooms = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });
    if (!error && data) setRooms(data as Room[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchRooms(); }, [fetchRooms]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchRooms();
    setRefreshing(false);
  };

  // ── Filtering ──

  const roomsWithRenders = rooms.filter((r) => r.latest_render_url);
  const filteredRooms = activeFilter === 'all'
    ? roomsWithRenders
    : roomsWithRenders.filter((r) => getDominant(r.style_blend as Record<string, number>) === activeFilter);

  const heroRoom = roomsWithRenders[0] ?? rooms[0] ?? null;

  const displayedRooms = filteredRooms.slice(0, displayCount);
  const leftCol = displayedRooms.filter((_, i) => i % 2 === 0);
  const rightCol = displayedRooms.filter((_, i) => i % 2 === 1);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    if (contentSize.height - layoutMeasurement.height - contentOffset.y < 300) {
      if (displayCount < filteredRooms.length) {
        setDisplayCount((p) => p + 12);
      }
    }
  };

  // ── Room tap ──

  const handleRoomTap = (room: Room) => {
    useAppStore.getState().setCurrentRoom(room);
    if (room.latest_render_url) {
      useAppStore.getState().setCurrentRender({ id: room.id, image_url: room.latest_render_url } as Render);
      useAppStore.getState().setRenderStatus('completed');
    }
    navigation.navigate('Room', { initialRoute: 'RenderView', room_id: room.id });
  };

  // ── Long press actions ──

  const handleLongPress = (room: Room) => {
    Alert.alert(room.name, undefined, [
      {
        text: 'Rename',
        onPress: () => {
          Alert.prompt('Rename Room', 'Enter new name:', async (newName) => {
            if (!newName?.trim()) return;
            await supabase.from('rooms').update({ name: newName.trim() }).eq('id', room.id);
            setRooms((prev) => prev.map((r) => r.id === room.id ? { ...r, name: newName.trim() } : r));
          }, 'plain-text', room.name);
        },
      },
      {
        text: 'Duplicate Style',
        onPress: () => void handleDuplicateStyle(room),
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          Alert.alert('Delete Room', `Delete "${room.name}"? This cannot be undone.`, [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () => void handleDeleteRoom(room),
            },
          ]);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleDuplicateStyle = async (room: Room) => {
    if (!user) return;
    const { data, error } = await supabase
      .from('rooms')
      .insert({
        user_id: user.id,
        name: `${room.name} (Copy)`,
        room_type: room.room_type,
        budget: room.budget,
        style_blend: room.style_blend,
        dimensions_json: { width: 16, depth: 14, height: 9, unit: 'ft' },
      })
      .select()
      .single();
    if (error) return Alert.alert('Error', error.message);
    const newRoom = data as Room;
    setRooms((prev) => [newRoom, ...prev]);
    useAppStore.getState().setCurrentRoom(newRoom);
    navigation.navigate('Room', { initialRoute: 'RoomCapture', room_id: newRoom.id });
  };

  const handleDeleteRoom = async (room: Room) => {
    await supabase.from('rooms').delete().eq('id', room.id);
    setRooms((prev) => prev.filter((r) => r.id !== room.id));
  };

  // ── New room ──

  const handleNewRoom = () => {
    Alert.alert(
      'Select Room Type',
      undefined,
      [
        ...ROOM_TYPES.map((rt) => ({
          text: rt.label,
          onPress: () => void createAndNavigateNew(rt.key, rt.label),
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
    );
  };

  const createAndNavigateNew = async (roomType: RoomType, label: string) => {
    if (!user) return;
    const { data, error } = await supabase
      .from('rooms')
      .insert({
        user_id: user.id,
        name: `My ${label}`,
        room_type: roomType,
        budget: 5000,
        style_blend: { coastal: 0.2, japandi: 0.2, bohemian: 0.2, mid_century: 0.2, minimalist: 0.2 },
        dimensions_json: { width: 16, depth: 14, height: 9, unit: 'ft' },
      })
      .select()
      .single();

    if (error) return Alert.alert('Error', error.message);
    const newRoom = data as Room;
    useAppStore.getState().addRoom(newRoom);
    useAppStore.getState().setCurrentRoom(newRoom);

    // If 2+ existing rooms → Past Styles page; else → Style Quiz directly
    if (rooms.length >= 2) {
      navigation.navigate('PastStyles', { newRoomId: newRoom.id });
    } else {
      navigation.navigate('Room', { initialRoute: 'StyleQuiz', room_id: newRoom.id });
    }
  };

  // ── Render ──

  const greeting = getGreeting(user?.full_name ?? null);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerLogo}>
          <DoubleArch />
          <Text style={styles.wordmark}>cova</Text>
        </View>
        <TouchableOpacity
          style={styles.gearBtn}
          onPress={() => (navigation as any).getParent?.()?.navigate('ProfileTab')}
        >
          <Text style={styles.gearIcon}>⚙</Text>
        </TouchableOpacity>
      </View>

      {/* ── Body ── */}
      <ScrollView
        style={styles.body}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.bodyContent}
        scrollEventThrottle={16}
        onScroll={handleScroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GOLD} />}
      >
        {/* Greeting */}
        <Text style={styles.greeting}>{greeting}</Text>

        {loading ? (
          <View style={styles.loadingWrap}>
            <Text style={styles.loadingText}>Loading your designs...</Text>
          </View>
        ) : rooms.length === 0 ? (
          /* ── Empty state ── */
          <View style={styles.emptyWrap}>
            <DoubleArch color="rgba(184,134,11,0.5)" />
            <Text style={styles.emptyGold}>Your first design is waiting.</Text>
            <TouchableOpacity style={styles.emptyBtn} testID="new-room-button" onPress={handleNewRoom}>
              <Text style={styles.emptyBtnText}>Start Designing</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* ── Hero card ── */}
            {heroRoom && (
              <HeroCard room={heroRoom} onPress={() => handleRoomTap(heroRoom)} />
            )}

            {/* ── Style filter chips ── */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsContent}
              style={styles.chipsRow}
            >
              {FILTER_CHIPS.map((chip) => {
                const active = activeFilter === chip.key;
                return (
                  <TouchableOpacity
                    key={chip.key}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => {
                      setActiveFilter(chip.key);
                      setDisplayCount(12);
                    }}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{chip.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* ── Masonry grid ── */}
            {filteredRooms.length === 0 ? (
              <View style={styles.noResultsWrap}>
                <Text style={styles.noResultsText}>No rooms with this style yet.</Text>
              </View>
            ) : (
              <View style={styles.masonry}>
                {/* Left column */}
                <View style={styles.masonryCol}>
                  {leftCol.map((room, i) => (
                    <MasonryCard
                      key={room.id}
                      room={room}
                      index={i * 2}
                      onPress={() => handleRoomTap(room)}
                      onLongPress={() => handleLongPress(room)}
                    />
                  ))}
                </View>
                {/* Right column */}
                <View style={[styles.masonryCol, { marginLeft: COL_GAP }]}>
                  {rightCol.map((room, i) => (
                    <MasonryCard
                      key={room.id}
                      room={room}
                      index={i * 2 + 1}
                      onPress={() => handleRoomTap(room)}
                      onLongPress={() => handleLongPress(room)}
                    />
                  ))}
                </View>
              </View>
            )}
          </>
        )}

        {/* ── Design a New Room button ── */}
        <TouchableOpacity style={styles.newRoomBtn} onPress={handleNewRoom}>
          <Text style={styles.newRoomBtnText}>＋  Design a New Room</Text>
        </TouchableOpacity>

        <View style={{ height: 80 }} />
      </ScrollView>

      {/* ── FAB — always visible for Maestro + quick access ── */}
      <TouchableOpacity testID="new-room-button" style={styles.fab} activeOpacity={0.85} onPress={handleNewRoom}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BG },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: BG,
  },
  headerLogo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wordmark: { color: '#FFFFFF', fontSize: 22, letterSpacing: 3 },
  gearBtn: { padding: 4 },
  gearIcon: { color: 'rgba(255,255,255,0.6)', fontSize: 20 },

  // Body
  body: { flex: 1, backgroundColor: BG },
  bodyContent: { paddingBottom: 100 },

  // Greeting
  greeting: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 16,
    paddingHorizontal: SIDE_PAD,
    marginTop: 12,
    marginBottom: 20,
  },

  // Loading
  loadingWrap: { alignItems: 'center', paddingVertical: 60 },
  loadingText: { color: 'rgba(255,255,255,0.4)', fontSize: 14 },

  // Empty state
  emptyWrap: {
    alignItems: 'center',
    paddingTop: SCREEN_HEIGHT * 0.12,
    paddingBottom: 40,
    paddingHorizontal: 40,
  },
  emptyGold: {
    color: GOLD,
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 32,
    lineHeight: 28,
  },
  emptyBtn: {
    backgroundColor: GOLD,
    borderRadius: 28,
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  emptyBtnText: { color: BG, fontSize: 16, fontWeight: '700' },

  // Filter chips
  chipsRow: { marginTop: 16 },
  chipsContent: { paddingHorizontal: SIDE_PAD, gap: 8 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  chipActive: { backgroundColor: GOLD, borderColor: GOLD },
  chipText: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '500' },
  chipTextActive: { color: BG, fontWeight: '700' },

  // Masonry
  masonry: {
    flexDirection: 'row',
    paddingHorizontal: SIDE_PAD,
    marginTop: 16,
  },
  masonryCol: { flex: 1 },

  // No results
  noResultsWrap: { alignItems: 'center', paddingVertical: 40 },
  noResultsText: { color: 'rgba(255,255,255,0.4)', fontSize: 14 },

  // New room button
  newRoomBtn: {
    marginHorizontal: SIDE_PAD,
    marginTop: 24,
    borderWidth: 1.5,
    borderColor: GOLD,
    borderRadius: 28,
    paddingVertical: 14,
    alignItems: 'center',
  },
  newRoomBtnText: { color: GOLD, fontSize: 15, fontWeight: '600' },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  fabText: { color: BG, fontSize: 28, fontWeight: '400', marginTop: -2 },
});

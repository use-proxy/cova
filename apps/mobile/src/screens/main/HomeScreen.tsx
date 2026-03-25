import React, { useState, useEffect, useCallback } from 'react';
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
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { HomeStackParamList } from '../../navigation/HomeStack';
import { useAppStore } from '../../store';
import { supabase } from '../../lib/supabase';
import type { Room, RoomType, Render } from '@cova/shared';
import TokenBadge from '../../components/TokenBadge';

const BG = '#0A1628';
const CREAM = '#F5F0E8';
const GOLD = '#C4A45A';
const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_WIDTH = SCREEN_WIDTH * 0.82;

// ── Double Arch mark ──

function DoubleArch({ size = 'small' }: { size?: 'small' | 'tiny' }) {
  const d = size === 'small'
    ? { ow: 28, oh: 36, iw: 20, ih: 26, so: 2, si: 1.5 }
    : { ow: 24, oh: 32, iw: 17, ih: 22, so: 1.5, si: 1 };

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
          d={`M2 ${d.oh} V${(d.oh * 0.35).toFixed(1)} Q2 2 ${d.ow / 2} 2 Q${d.ow - 2} 2 ${d.ow - 2} ${(d.oh * 0.35).toFixed(1)} V${d.oh}`}
          stroke={GOLD}
          strokeWidth={d.so}
          fill="none"
          strokeLinecap="round"
        />
      </Svg>
      <Svg
        width={d.iw}
        height={d.ih}
        viewBox={`0 0 ${d.iw} ${d.ih}`}
        fill="none"
        style={{ position: 'absolute', left: (d.ow - d.iw) / 2, top: d.oh - d.ih }}
      >
        <Path
          d={`M2 ${d.ih} V${(d.ih * 0.35).toFixed(1)} Q2 2 ${d.iw / 2} 2 Q${d.iw - 2} 2 ${d.iw - 2} ${(d.ih * 0.35).toFixed(1)} V${d.ih}`}
          stroke={GOLD}
          strokeWidth={d.si}
          fill="none"
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}

// ── Helpers ──

function relativeDate(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `Updated ${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Updated ${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `Updated ${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `Updated ${weeks}w ago`;
}

function formatRoomType(rt: string): string {
  return rt.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Inspiration data ──

const INSPIRATIONS = [
  {
    id: '1',
    match: '92% Style Match',
    image: 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=800&h=400&fit=crop',
  },
  {
    id: '2',
    match: '87% Style Match',
    image: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=800&h=400&fit=crop',
  },
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

// ── Screen ──

export default function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const user = useAppStore((s) => s.user);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchRooms();
    setRefreshing(false);
  };

  const handleRoomTap = (room: Room) => {
    useAppStore.getState().setCurrentRoom(room);
    // Pre-load the render so RenderViewScreen doesn't bounce back on idle check
    if (room.latest_render_url) {
      useAppStore.getState().setCurrentRender({ id: room.id, image_url: room.latest_render_url } as Render);
      useAppStore.getState().setRenderStatus('completed');
    }
    navigation.navigate('Room', { initialRoute: 'RenderView', room_id: room.id });
  };

  const handleNewRoom = () => {
    Alert.alert(
      'Select Room Type',
      undefined,
      [
        ...ROOM_TYPES.map((rt) => ({
          text: rt.label,
          onPress: () => createAndNavigate(rt.key, rt.label),
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
    );
  };

  const createAndNavigate = async (roomType: RoomType, label: string) => {
    if (!user) return;
    const name = `My ${label}`;
    const defaultBlend = {
      coastal: 0.2,
      japandi: 0.2,
      bohemian: 0.2,
      mid_century: 0.2,
      minimalist: 0.2,
    };

    const { data, error } = await supabase
      .from('rooms')
      .insert({
        user_id: user.id,
        name,
        room_type: roomType,
        budget: 5000,
        style_blend: defaultBlend,
        dimensions_json: { width: 16, depth: 14, height: 9, unit: 'ft' },
      })
      .select()
      .single();

    if (error) return Alert.alert('Error', error.message);

    useAppStore.getState().addRoom(data as Room);
    useAppStore.getState().setCurrentRoom(data as Room);

    const blend = user.style_blend;
    const hasStyle = blend && Object.values(blend).some((v) => v > 0.25);

    if (hasStyle) {
      Alert.alert('Use your previous style?', 'Would you like to keep your current style blend?', [
        { text: 'Yes', onPress: () => navigation.navigate('Room', { initialRoute: 'RoomCapture' }) },
        { text: 'No, start fresh', onPress: () => navigation.navigate('Room', { initialRoute: 'StyleQuiz' }) },
      ]);
    } else {
      navigation.navigate('Room', { initialRoute: 'StyleQuiz' });
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <DoubleArch size="small" />
          <Text style={styles.headerWordmark}>cova</Text>
        </View>
        <TokenBadge />
      </View>

      {/* ── Content ── */}
      <ScrollView
        style={styles.body}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.bodyContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GOLD} />
        }
      >
        {/* ── My Rooms ── */}
        <Text style={styles.sectionTitle}>My Rooms</Text>

        {loading ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>Loading...</Text>
          </View>
        ) : rooms.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyIcon}>🏠</Text>
            <Text style={styles.emptyTitle}>No rooms yet</Text>
            <Text style={styles.emptyText}>Tap + to scan your first room</Text>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.roomScroll}
          >
            {rooms.map((room, index) => (
              <TouchableOpacity
                key={room.id}
                testID={`room-card-${index}`}
                style={styles.roomCard}
                activeOpacity={0.9}
                onPress={() => handleRoomTap(room)}
              >
                {room.latest_render_url ? (
                  <Image
                    source={{ uri: room.latest_render_url }}
                    style={StyleSheet.absoluteFill}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[StyleSheet.absoluteFill, styles.roomPlaceholderBg]} />
                )}

                {/* gradient overlay */}
                <View style={styles.roomGradient} />

                {/* info */}
                <View style={styles.roomInfo}>
                  <View style={styles.roomInfoLeft}>
                    <Text style={styles.roomName}>{room.name}</Text>
                    <Text style={styles.roomDate}>{relativeDate(room.updated_at)}</Text>
                  </View>
                  <View style={styles.roomTypeBadge}>
                    <Text style={styles.roomTypeBadgeText}>{formatRoomType(room.room_type)}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}

            {/* New Room card */}
            <TouchableOpacity
              style={styles.newRoomCard}
              activeOpacity={0.8}
              onPress={handleNewRoom}
            >
              <DoubleArch size="tiny" />
              <Text style={styles.newRoomText}>New Room</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* ── Suggested For You ── */}
        <Text style={[styles.sectionTitle, { marginTop: 28 }]}>Suggested For You</Text>
        <Text style={styles.sectionSub}>Based on your style</Text>

        {INSPIRATIONS.map((item) => (
          <View key={item.id} style={styles.inspoCard}>
            <Image
              source={{ uri: item.image }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
            <View style={styles.inspoOverlay} />
            <View style={styles.inspoMatchBadge}>
              <Text style={styles.inspoMatchText}>{item.match}</Text>
            </View>
            <TouchableOpacity
              style={styles.inspoRecreateBtn}
              onPress={() =>
                Alert.alert(
                  'Coming Soon',
                  'Recreating inspiration rooms will be available in a future update.',
                )
              }
            >
              <Text style={styles.inspoRecreateBtnText}>Recreate This Room</Text>
            </TouchableOpacity>
          </View>
        ))}

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* ── FAB ── */}
      <TouchableOpacity testID="new-room-button" style={styles.fab} activeOpacity={0.85} onPress={handleNewRoom}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BG,
  },

  // ── Header ──
  header: {
    backgroundColor: BG,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerWordmark: {
    color: '#FFFFFF',
    fontSize: 22,
    letterSpacing: 3,
  },

  // ── Body ──
  body: {
    flex: 1,
    backgroundColor: CREAM,
  },
  bodyContent: {
    paddingBottom: 100,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: '500',
    color: BG,
    marginLeft: 20,
    marginTop: 24,
    marginBottom: 12,
  },
  sectionSub: {
    fontSize: 13,
    color: 'rgba(0,0,0,0.45)',
    marginLeft: 20,
    marginBottom: 12,
    marginTop: -4,
  },

  // ── Rooms ──
  roomScroll: {
    paddingLeft: 20,
    paddingRight: 8,
    gap: 16,
    paddingBottom: 4,
  },
  roomCard: {
    width: CARD_WIDTH,
    height: 210,
    borderRadius: 16,
    overflow: 'hidden',
  },
  roomPlaceholderBg: {
    backgroundColor: '#1B3A2D',
  },
  roomGradient: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    borderRadius: 16,
    // Simulated bottom gradient
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    // RN doesn't support linear-gradient natively, use a semi-transparent overlay
    // positioned at the bottom
  },
  roomInfo: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  roomInfoLeft: {},
  roomName: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
  },
  roomDate: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    marginTop: 2,
  },
  roomTypeBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  roomTypeBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
  },

  newRoomCard: {
    width: 180,
    height: 210,
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 20,
  },
  newRoomText: {
    color: GOLD,
    fontSize: 16,
    marginTop: 8,
  },

  // ── Empty ──
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: BG,
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 14,
    color: 'rgba(0,0,0,0.45)',
  },

  // ── Inspiration ──
  inspoCard: {
    marginHorizontal: 20,
    height: 200,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
  },
  inspoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  inspoMatchBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  inspoMatchText: {
    color: '#FFFFFF',
    fontSize: 11,
  },
  inspoRecreateBtn: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    borderWidth: 1.5,
    borderColor: GOLD,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: 'transparent',
  },
  inspoRecreateBtnText: {
    fontSize: 12,
    color: GOLD,
  },

  // ── FAB ──
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
  fabText: {
    color: BG,
    fontSize: 28,
    fontWeight: '400',
    marginTop: -2,
  },
});

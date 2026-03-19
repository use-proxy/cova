import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ScrollView,
  RefreshControl,
  Image,
  ImageBackground,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../../navigation/HomeStack';
import { useAppStore } from '../../store';
import { supabase } from '../../lib/supabase';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Room, StyleName } from '@cova/shared';
import TokenBadge from '../../components/TokenBadge';

const STYLE_LABELS: Record<string, { label: string; color: string }> = {
  coastal: { label: 'Ocean Breeze', color: '#5B9BD5' },
  japandi: { label: 'Zen Garden', color: '#8B7355' },
  bohemian: { label: 'Boho Spirit', color: '#D4956A' },
  mid_century: { label: 'Mid-Century', color: '#C47B3C' },
  minimalist: { label: 'Pure Lines', color: '#A0A0A0' },
};

const ROOM_TYPE_ICONS: Record<string, string> = {
  living_room: '🛋',
  bedroom: '🛏',
  dining_room: '🍽',
  home_office: '💻',
  kitchen: '🍳',
  bathroom: '🛁',
  entryway: '🚪',
};

const ALL_INSPIRATION_CARDS = [
  { id: '1', key: 'coastal' as StyleName, ...STYLE_LABELS.coastal },
  { id: '2', key: 'japandi' as StyleName, ...STYLE_LABELS.japandi },
  { id: '3', key: 'bohemian' as StyleName, ...STYLE_LABELS.bohemian },
  { id: '4', key: 'mid_century' as StyleName, ...STYLE_LABELS.mid_century },
  { id: '5', key: 'minimalist' as StyleName, ...STYLE_LABELS.minimalist },
];

export default function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const user = useAppStore((s) => s.user);
  const currentRoom = useAppStore((s) => s.currentRoom);
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
    if (!error && data) {
      setRooms(data as Room[]);
    }
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

  const getInitials = (name: string | null | undefined) => {
    if (!name) return '?';
    return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const handleRoomTap = (room: Room) => {
    useAppStore.getState().setCurrentRoom(room);
    navigation.navigate('Room', { initialRoute: 'RenderView', room_id: room.id });
  };

  const sortedInspirationCards = useMemo(() => {
    const blend = currentRoom?.style_blend;
    if (!blend) return ALL_INSPIRATION_CARDS.slice(0, 3);

    return [...ALL_INSPIRATION_CARDS].sort((a, b) => {
      const weightA = blend[a.key] ?? 0;
      const weightB = blend[b.key] ?? 0;
      return weightB - weightA;
    });
  }, [currentRoom?.style_blend]);

  const renderRoomCard = ({ item }: { item: Room }) => {
    if (item.latest_render_url) {
      return (
        <TouchableOpacity style={styles.roomCard} onPress={() => handleRoomTap(item)}>
          <ImageBackground
            source={{ uri: item.latest_render_url }}
            style={styles.roomCardImage}
            imageStyle={styles.roomCardImageInner}
            resizeMode="cover"
          >
            <View style={styles.roomCardOverlay}>
              <Text style={styles.roomNameLight}>{item.name}</Text>
              <Text style={styles.roomTypeLight}>{item.room_type.replace('_', ' ')}</Text>
            </View>
          </ImageBackground>
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity style={styles.roomCard} onPress={() => handleRoomTap(item)}>
        <View style={styles.roomCardSolid}>
          <View style={styles.roomCardLeft}>
            <Text style={styles.roomName}>{item.name}</Text>
            <Text style={styles.roomType}>{item.room_type.replace('_', ' ')}</Text>
            <Text style={styles.roomDimensions}>
              {(item.dimensions as any)?.width ?? 16}×{(item.dimensions as any)?.depth ?? 14} ft
            </Text>
          </View>
          <View style={styles.roomCardRight}>
            <View style={styles.roomPlaceholder}>
              <Text style={styles.roomPlaceholderIcon}>{ROOM_TYPE_ICONS[item.room_type] ?? '🏠'}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerLogo}>COVA</Text>
        <View style={styles.headerRight}>
          <TokenBadge />
          <TouchableOpacity style={styles.avatarCircle}>
            <Text style={styles.avatarText}>{getInitials(user?.full_name ?? user?.email)}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#C47B3C" />}
        showsVerticalScrollIndicator={false}
      >
        {/* My Rooms */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>My Rooms</Text>
        </View>

        {loading ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Loading...</Text>
          </View>
        ) : rooms.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🏠</Text>
            <Text style={styles.emptyTitle}>No rooms yet</Text>
            <Text style={styles.emptySubtext}>Tap + to scan your first room</Text>
          </View>
        ) : (
          <FlatList
            data={rooms}
            renderItem={renderRoomCard}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            contentContainerStyle={styles.roomList}
          />
        )}

        {/* Suggested For You */}
        <View style={[styles.sectionHeader, { marginTop: 24 }]}>
          <Text style={styles.sectionTitle}>Suggested For You</Text>
          <Text style={styles.sectionSubtitle}>Based on your style</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.inspirationRow}>
          {sortedInspirationCards.map((card) => (
            <View key={card.id} style={[styles.inspirationCard, { backgroundColor: card.color }]}>
              <TouchableOpacity
                style={styles.inspirationContent}
                onPress={() => navigation.navigate('Room', { initialRoute: 'StyleQuiz' })}
              >
                <Text style={styles.inspirationLabel}>{card.label}</Text>
                <Text style={styles.inspirationArrow}>→</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.recreateBtn}
                onPress={() => Alert.alert('Coming Soon', 'Recreating inspiration rooms is coming in a future update.')}
              >
                <Text style={styles.recreateBtnText}>Recreate ✦</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('NewRoom')}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerLogo: {
    fontSize: 24,
    fontWeight: '800',
    color: '#C47B3C',
    letterSpacing: 4,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#C47B3C',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '700',
  },
  body: {
    flex: 1,
    paddingHorizontal: 16,
  },
  sectionHeader: {
    marginTop: 20,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1B3A2D',
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#888888',
    marginTop: 2,
  },
  roomList: {
    gap: 12,
  },
  roomCard: {
    borderRadius: 16,
    height: 120,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  roomCardImage: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  roomCardImageInner: {
    borderRadius: 16,
  },
  roomCardOverlay: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  roomNameLight: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  roomTypeLight: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    textTransform: 'capitalize',
    marginTop: 2,
  },
  roomCardSolid: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  roomCardLeft: {
    flex: 1,
    gap: 4,
  },
  roomName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1B3A2D',
  },
  roomType: {
    fontSize: 13,
    color: '#888888',
    textTransform: 'capitalize',
  },
  roomDimensions: {
    fontSize: 12,
    color: '#888888',
  },
  roomCardRight: {
    marginLeft: 12,
  },
  roomPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: '#E8E0D0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  roomPlaceholderIcon: {
    fontSize: 32,
  },
  emptyState: {
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
    color: '#1B3A2D',
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#888888',
  },
  emptyText: {
    fontSize: 14,
    color: '#888888',
  },
  inspirationRow: {
    gap: 12,
    paddingRight: 16,
  },
  inspirationCard: {
    width: 160,
    height: 200,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  inspirationContent: {
    flex: 1,
    padding: 16,
    justifyContent: 'flex-end',
  },
  inspirationLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: 'white',
    marginBottom: 4,
  },
  inspirationArrow: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '600',
  },
  recreateBtn: {
    marginHorizontal: 12,
    marginBottom: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#C47B3C',
    alignItems: 'center',
  },
  recreateBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#C47B3C',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#C47B3C',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  fabText: {
    fontSize: 28,
    color: 'white',
    fontWeight: '400',
    marginTop: -2,
  },
});

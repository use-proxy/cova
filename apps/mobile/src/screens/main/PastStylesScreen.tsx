import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
  Dimensions,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../../navigation/HomeStack';
import { useAppStore } from '../../store';
import { supabase } from '../../lib/supabase';
import type { Room, StyleName } from '@cova/shared';

const BG = '#0A1628';
const GOLD = '#B8860B';
const CARD_W = Dimensions.get('window').width - 48;

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

function getDominant(blend: Record<string, number>): StyleName {
  const entries = Object.entries(blend) as [StyleName, number][];
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

function BlendBar({ blend }: { blend: Record<string, number> }) {
  const entries = (Object.entries(blend) as [StyleName, number][]).sort((a, b) => b[1] - a[1]);
  return (
    <View style={bbStyles.row}>
      {entries.map(([style, pct]) => (
        <View
          key={style}
          style={[bbStyles.seg, { flex: pct, backgroundColor: STYLE_COLORS[style] }]}
        />
      ))}
    </View>
  );
}

const bbStyles = StyleSheet.create({
  row: { flexDirection: 'row', height: 4, borderRadius: 2, overflow: 'hidden', marginTop: 8 },
  seg: { height: 4 },
});

type PastStylesProps = NativeStackScreenProps<HomeStackParamList, 'PastStyles'>;

export default function PastStylesScreen() {
  const route = useRoute<PastStylesProps['route']>();
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const { newRoomId } = route.params;
  const user = useAppStore((s) => s.user);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);

  const fetchRooms = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('rooms')
      .select('*')
      .eq('user_id', user.id)
      .neq('id', newRoomId)
      .order('updated_at', { ascending: false });
    if (data) setRooms(data as Room[]);
    setLoading(false);
  }, [user, newRoomId]);

  useEffect(() => { fetchRooms(); }, [fetchRooms]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchRooms();
    setRefreshing(false);
  };

  const handleUseStyle = async (room: Room) => {
    setApplying(room.id);
    try {
      await supabase
        .from('rooms')
        .update({ style_blend: room.style_blend })
        .eq('id', newRoomId);
      // Set current room to the new room with applied blend
      const { data } = await supabase.from('rooms').select('*').eq('id', newRoomId).single();
      if (data) {
        useAppStore.getState().setCurrentRoom(data as Room);
      }
      navigation.navigate('Room', { initialRoute: 'BudgetSlider', room_id: newRoomId });
    } catch {
      Alert.alert('Error', 'Could not apply style. Please try again.');
    } finally {
      setApplying(null);
    }
  };

  const handleStartFresh = () => {
    navigation.navigate('Room', { initialRoute: 'StyleQuiz', room_id: newRoomId });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Pick a Style</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GOLD} />}
      >
        <Text style={styles.subtitle}>Use a style from a previous room or start fresh.</Text>

        {loading ? (
          <ActivityIndicator color={GOLD} style={{ marginTop: 40 }} />
        ) : (
          rooms.map((room) => {
            const dominant = getDominant(room.style_blend as Record<string, number>);
            const isApplying = applying === room.id;
            return (
              <View key={room.id} style={styles.card}>
                {/* Thumbnail */}
                <View style={styles.thumbWrap}>
                  {room.latest_render_url ? (
                    <Image
                      source={{ uri: room.latest_render_url }}
                      style={StyleSheet.absoluteFill}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.thumbPlaceholder} />
                  )}
                </View>

                {/* Info */}
                <View style={styles.cardBody}>
                  <Text style={styles.roomName}>{room.name}</Text>
                  <Text style={styles.dominantLabel}>
                    {STYLE_LABELS[dominant as StyleName] ?? dominant}
                  </Text>
                  <BlendBar blend={room.style_blend as Record<string, number>} />
                </View>

                {/* Action */}
                <TouchableOpacity
                  style={[styles.useBtn, isApplying && styles.useBtnLoading]}
                  onPress={() => void handleUseStyle(room)}
                  disabled={isApplying}
                >
                  {isApplying ? (
                    <ActivityIndicator color={BG} size="small" />
                  ) : (
                    <Text style={styles.useBtnText}>Use This Style</Text>
                  )}
                </TouchableOpacity>
              </View>
            );
          })
        )}

        {/* Start Fresh */}
        <TouchableOpacity style={styles.freshBtn} onPress={handleStartFresh}>
          <Text style={styles.freshBtnText}>Start Fresh →</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  backBtn: { width: 40 },
  backText: { color: GOLD, fontSize: 22 },
  headerTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '600' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingTop: 8 },
  subtitle: { color: 'rgba(255,255,255,0.5)', fontSize: 14, marginBottom: 24 },

  card: {
    backgroundColor: '#132035',
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
  },
  thumbWrap: { width: CARD_W, height: 180, backgroundColor: '#1B2C44' },
  thumbPlaceholder: { flex: 1, backgroundColor: '#1B2C44' },
  cardBody: { padding: 16 },
  roomName: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  dominantLabel: { color: GOLD, fontSize: 13, marginTop: 4 },

  useBtn: {
    margin: 16,
    marginTop: 0,
    backgroundColor: GOLD,
    borderRadius: 28,
    paddingVertical: 12,
    alignItems: 'center',
  },
  useBtnLoading: { opacity: 0.7 },
  useBtnText: { color: BG, fontSize: 15, fontWeight: '700' },

  freshBtn: {
    marginTop: 8,
    paddingVertical: 16,
    alignItems: 'center',
  },
  freshBtnText: { color: 'rgba(255,255,255,0.5)', fontSize: 15 },
});

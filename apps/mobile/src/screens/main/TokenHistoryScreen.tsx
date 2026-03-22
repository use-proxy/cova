import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Svg, { Path, Rect } from 'react-native-svg';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store';

interface TokenTransaction {
  id: string;
  user_id: string;
  amount: number;
  type: string;
  render_id: string | null;
  created_at: string;
}

const TYPE_CONFIG: Record<string, { label: string; bgColor: string; textColor: string }> = {
  purchase: { label: 'Purchase', bgColor: 'rgba(196,164,90,0.15)', textColor: '#C4A45A' },
  render_draft: { label: 'Draft Render', bgColor: 'rgba(59,130,246,0.15)', textColor: '#3B82F6' },
  render_hd: { label: 'HD Render', bgColor: 'rgba(139,92,246,0.15)', textColor: '#8B5CF6' },
  bonus: { label: 'Bonus', bgColor: 'rgba(34,197,94,0.15)', textColor: '#22C55E' },
  refund: { label: 'Refund', bgColor: 'rgba(136,136,136,0.15)', textColor: '#888888' },
};

function formatRelativeDate(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function BackChevron() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path d="M15 18L9 12L15 6" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function ReceiptIcon() {
  return (
    <Svg width={48} height={48} viewBox="0 0 24 24" fill="none">
      <Path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="#C4A45A" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M14 2v6h6" stroke="#C4A45A" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M16 13H8M16 17H8M10 9H8" stroke="#C4A45A" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export default function TokenHistoryScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const user = useAppStore((s) => s.user);
  const [transactions, setTransactions] = useState<TokenTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data, error } = await supabase
        .from('token_transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (!error) setTransactions(data ?? []);
      setLoading(false);
    })();
  }, [user]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <BackChevron />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Transaction History</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#C4A45A" />
        </View>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(item) => item.id}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const config = TYPE_CONFIG[item.type] ?? { label: item.type, bgColor: 'rgba(136,136,136,0.15)', textColor: '#888888' };
            return (
              <View style={styles.row}>
                <View style={[styles.typeBadge, { backgroundColor: config.bgColor }]}>
                  <Text style={[styles.typeBadgeText, { color: config.textColor }]}>{config.label}</Text>
                </View>
                <Text style={[styles.amount, item.amount >= 0 ? styles.amountPos : styles.amountNeg]}>
                  {item.amount > 0 ? '+' : ''}{item.amount}
                </Text>
                <Text style={styles.date}>{formatRelativeDate(item.created_at)}</Text>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <ReceiptIcon />
              <Text style={styles.emptyTitle}>No transactions yet</Text>
              <Text style={styles.emptySubtext}>
                All features are free during our launch period.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F0E8',
  },
  header: {
    backgroundColor: '#0A1628',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
  },
  backBtn: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: '400',
    letterSpacing: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    flexGrow: 1,
  },
  row: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  typeBadge: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  amount: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 12,
    color: '#0A1628',
  },
  amountPos: {
    color: '#22C55E',
  },
  amountNeg: {
    color: '#EF4444',
  },
  date: {
    fontSize: 13,
    color: 'rgba(0,0,0,0.4)',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '400',
    color: '#0A1628',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: 'rgba(0,0,0,0.45)',
    textAlign: 'center',
    paddingHorizontal: 40,
    marginTop: 8,
  },
});

import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { TouchableOpacity } from 'react-native';
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

const TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  purchase: { label: 'Purchase', color: '#C47B3C' },
  render_draft: { label: 'Draft Render', color: '#3B82F6' },
  render_hd: { label: 'HD Render', color: '#8B5CF6' },
  bonus: { label: 'Bonus', color: '#22C55E' },
  refund: { label: 'Refund', color: '#888888' },
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

export default function TokenHistoryScreen() {
  const navigation = useNavigation();
  const user = useAppStore((s) => s.user);
  const [transactions, setTransactions] = useState<TokenTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('token_transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      setTransactions(data ?? []);
      setLoading(false);
    })();
  }, [user]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backBtn}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Transaction History</Text>
          <View style={{ width: 32 }} />
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#C47B3C" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backBtn}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Transaction History</Text>
        <View style={{ width: 32 }} />
      </View>

      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const config = TYPE_CONFIG[item.type] ?? { label: item.type, color: '#888888' };
          return (
            <View style={styles.row}>
              <View style={[styles.typeBadge, { backgroundColor: config.color }]}>
                <Text style={styles.typeBadgeText}>{config.label}</Text>
              </View>
              <View style={styles.rowInfo}>
                <Text style={[styles.amount, item.amount > 0 ? styles.amountPositive : styles.amountNegative]}>
                  {item.amount > 0 ? '+' : ''}{item.amount}
                </Text>
                <Text style={styles.date}>{formatRelativeDate(item.created_at)}</Text>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📜</Text>
            <Text style={styles.emptyTitle}>No transactions yet</Text>
            <Text style={styles.emptySubtext}>
              All features are free during our launch period.
            </Text>
          </View>
        }
      />
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
  backBtn: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '600',
    width: 32,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
    gap: 10,
    flexGrow: 1,
  },
  row: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  typeBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  rowInfo: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  amount: {
    fontSize: 16,
    fontWeight: '800',
  },
  amountPositive: {
    color: '#22C55E',
  },
  amountNegative: {
    color: '#EF4444',
  },
  date: {
    fontSize: 12,
    color: '#888888',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1B3A2D',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#888888',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});

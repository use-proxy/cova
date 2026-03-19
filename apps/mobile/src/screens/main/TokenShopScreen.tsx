import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Svg, { Path, Rect } from 'react-native-svg';

function BackChevron() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path d="M15 18L9 12L15 6" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function LockIcon() {
  return (
    <Svg width={48} height={48} viewBox="0 0 24 24" fill="none">
      <Rect x={5} y={11} width={14} height={10} rx={2} stroke="#C4A45A" strokeWidth={1.5} />
      <Path d="M8 11V7a4 4 0 018 0v4" stroke="#C4A45A" strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

export default function TokenShopScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <BackChevron />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Tokens</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Balance card */}
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.balanceCard}>
          <Text style={styles.balanceNumber}>999</Text>
          <Text style={styles.balanceLabel}>tokens available</Text>
          <Text style={styles.balanceSub}>All features are free during launch</Text>
        </View>
      </ScrollView>

      {/* Coming Soon overlay */}
      <View style={styles.overlay}>
        <LockIcon />
        <Text style={styles.overlayTitle}>Tokens Coming Soon</Text>
        <Text style={styles.overlayBody}>
          All features are free during our launch period. Token purchasing will be available soon.
        </Text>
        <TouchableOpacity style={styles.gotItBtn} onPress={() => navigation.goBack()} activeOpacity={0.85}>
          <Text style={styles.gotItText}>Got it</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.restoreBtn} onPress={() => {}}>
          <Text style={styles.restoreText}>Restore Purchases</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A1628',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  backBtn: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: 'white',
    fontSize: 22,
    fontWeight: '400',
    letterSpacing: 1,
  },
  body: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  balanceCard: {
    alignItems: 'center',
  },
  balanceNumber: {
    color: '#C4A45A',
    fontSize: 48,
    fontWeight: '300',
  },
  balanceLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    marginTop: 4,
  },
  balanceSub: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    marginTop: 8,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,22,40,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  overlayTitle: {
    color: 'white',
    fontSize: 24,
    fontWeight: '400',
    letterSpacing: 0.5,
    marginTop: 20,
  },
  overlayBody: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 22,
  },
  gotItBtn: {
    backgroundColor: '#C4A45A',
    borderRadius: 24,
    paddingHorizontal: 32,
    paddingVertical: 14,
    marginTop: 32,
  },
  gotItText: {
    color: '#0A1628',
    fontSize: 16,
    fontWeight: '600',
  },
  restoreBtn: {
    marginTop: 16,
    paddingVertical: 8,
  },
  restoreText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
  },
});

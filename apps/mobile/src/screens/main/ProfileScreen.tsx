import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Linking,
  Image,
  Switch,
} from 'react-native';
import Svg, { Path, Circle as SvgCircle, Polyline, Rect, Line } from 'react-native-svg';
import Constants from 'expo-constants';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppStore } from '../../store';
import { supabase, callEdgeFunction } from '../../lib/supabase';
import type { StyleName } from '@cova/shared';
import type { HomeStackParamList } from '../../navigation/HomeStack';

const BG = '#0A1628';
const GOLD = '#C4A45A';
const CREAM = '#F5F0E8';

const STYLE_MAP: Record<StyleName, { label: string; color: string }> = {
  coastal: { label: 'Ocean Breeze', color: '#5B9A9A' },
  japandi: { label: 'Zen Garden', color: '#8BA888' },
  bohemian: { label: 'Boho Spirit', color: '#D4A853' },
  mid_century: { label: 'Mid-Century', color: '#A67C52' },
  minimalist: { label: 'Pure Lines', color: '#8B8B8B' },
};
const STYLE_KEYS: StyleName[] = ['coastal', 'japandi', 'bohemian', 'mid_century', 'minimalist'];

// ── SVG Icons ──

function PersonIcon({ color = BG }: { color?: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <SvgCircle cx={12} cy={8} r={4} stroke={color} strokeWidth={1.5} />
      <Path d="M4 20c0-4 4-6 8-6s8 2 8 6" stroke={color} strokeWidth={1.5} />
    </Svg>
  );
}

function MailIcon({ color = BG }: { color?: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Rect x={2} y={4} width={20} height={16} rx={2} stroke={color} strokeWidth={1.5} />
      <Path d="M22 6L12 13 2 6" stroke={color} strokeWidth={1.5} />
    </Svg>
  );
}

function LockIcon({ color = BG }: { color?: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Rect x={5} y={11} width={14} height={10} rx={2} stroke={color} strokeWidth={1.5} />
      <Path d="M8 11V7a4 4 0 018 0v4" stroke={color} strokeWidth={1.5} />
    </Svg>
  );
}

function LogoutIcon({ color = '#DC3545' }: { color?: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" stroke={color} strokeWidth={1.5} />
      <Polyline points="16,17 21,12 16,7" stroke={color} strokeWidth={1.5} fill="none" />
      <Line x1={21} y1={12} x2={9} y2={12} stroke={color} strokeWidth={1.5} />
    </Svg>
  );
}

function TrashIcon({ color = '#DC3545' }: { color?: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Polyline points="3,6 5,6 21,6" stroke={color} strokeWidth={1.5} fill="none" />
      <Path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" stroke={color} strokeWidth={1.5} />
    </Svg>
  );
}

function ChevronRight() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Polyline points="9,18 15,12 9,6" stroke="rgba(0,0,0,0.3)" strokeWidth={2} fill="none" />
    </Svg>
  );
}

function BellIcon({ color = BG }: { color?: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" stroke={color} strokeWidth={1.5} />
      <Path d="M13.73 21a2 2 0 01-3.46 0" stroke={color} strokeWidth={1.5} />
    </Svg>
  );
}

function CreditCardIcon({ color = BG }: { color?: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Rect x={1} y={4} width={22} height={16} rx={2} stroke={color} strokeWidth={1.5} />
      <Line x1={1} y1={10} x2={23} y2={10} stroke={color} strokeWidth={1.5} />
    </Svg>
  );
}

function HelpIcon({ color = BG }: { color?: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <SvgCircle cx={12} cy={12} r={10} stroke={color} strokeWidth={1.5} />
      <Path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" stroke={color} strokeWidth={1.5} />
      <Line x1={12} y1={17} x2={12.01} y2={17} stroke={color} strokeWidth={1.5} />
    </Svg>
  );
}

function DocIcon({ color = BG }: { color?: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke={color} strokeWidth={1.5} />
      <Polyline points="14,2 14,8 20,8" stroke={color} strokeWidth={1.5} fill="none" />
    </Svg>
  );
}

function BackIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Polyline points="15,18 9,12 15,6" stroke="white" strokeWidth={2} fill="none" />
    </Svg>
  );
}

// ── Row separator ──
function Separator() {
  return <View style={styles.separator} />;
}

// ── Saved items placeholder ──
const SAVED_IMAGES = [
  'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=200&h=200&fit=crop',
  'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=200&h=200&fit=crop',
  'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=200&h=200&fit=crop',
  'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=200&h=200&fit=crop',
];

// ══════════════════════════════════════════════════
// Screen
// ══════════════════════════════════════════════════

export default function ProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const insets = useSafeAreaInsets();
  const user = useAppStore((s) => s.user);
  const currentRoom = useAppStore((s) => s.currentRoom);
  const savedProducts = useAppStore((s) => s.savedProducts);

  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const blend = user?.style_blend ?? currentRoom?.style_blend ?? {
    coastal: 0.2, japandi: 0.2, bohemian: 0.2, mid_century: 0.2, minimalist: 0.2,
  };

  const styleSegments = STYLE_KEYS.map((k) => ({
    ...STYLE_MAP[k],
    key: k,
    percent: Math.round((blend[k] ?? 0.2) * 100),
  }));

  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  const getInitials = () => {
    if (user?.full_name) return user.full_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
    if (user?.email) return user.email[0].toUpperCase();
    return '?';
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => {
        await supabase.auth.signOut();
        useAppStore.getState().signOut();
      }},
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert('Delete your account?', 'This cannot be undone.', [
      { text: 'Cancel' },
      { text: 'Continue', style: 'destructive', onPress: () => {
        Alert.alert('All your rooms, renders, and data will be permanently deleted.', '', [
          { text: 'Cancel' },
          { text: 'Delete Forever', style: 'destructive', onPress: async () => {
            setDeleting(true);
            try {
              await callEdgeFunction('delete-account', {});
              useAppStore.getState().signOut();
            } catch (e: unknown) {
              Alert.alert('Error', e instanceof Error ? e.message : 'Could not delete account.');
            } finally { setDeleting(false); }
          }},
        ]);
      }},
    ]);
  };

  const handlePasswordReset = async () => {
    if (!user?.email) return;
    try {
      await supabase.auth.resetPasswordForEmail(user.email);
      Alert.alert('Password Reset', 'Password reset email sent.');
    } catch { Alert.alert('Error', 'Could not send reset email.'); }
  };

  const handleRetakeQuiz = () => {
    Alert.alert('Retake the style quiz for your current room?', '', [
      { text: 'Cancel' },
      { text: 'Retake', onPress: () => navigation.navigate('Room', { initialRoute: 'StyleQuiz' }) },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: 16 }]}>
        <TouchableOpacity style={styles.headerBack} onPress={() => navigation.goBack()}>
          <BackIcon />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* ── Profile hero ── */}
      <View style={styles.hero}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{getInitials()}</Text>
        </View>
        <Text style={styles.heroName}>{user?.full_name ?? 'User'}</Text>
        <Text style={styles.heroEmail}>{user?.email ?? ''}</Text>
        <TouchableOpacity onPress={() => Alert.alert('Edit Profile', 'Edit profile coming soon.')}>
          <Text style={styles.editLink}>Edit Profile</Text>
        </TouchableOpacity>
      </View>

      {/* ── Body ── */}
      <ScrollView style={styles.body} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

        {/* ── Account card ── */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>ACCOUNT</Text>
          <Separator />
          <TouchableOpacity style={styles.row} onPress={() => Alert.alert('Edit Profile', 'Edit profile coming soon.')}>
            <View style={styles.rowIcon}><PersonIcon /></View>
            <Text style={styles.rowLabel}>Full Name</Text>
            <Text style={styles.rowValue}>{user?.full_name ?? '—'}</Text>
            <ChevronRight />
          </TouchableOpacity>
          <Separator />
          <TouchableOpacity style={styles.row} onPress={() => Alert.alert('Email', user?.email ?? '—')}>
            <View style={styles.rowIcon}><MailIcon /></View>
            <Text style={styles.rowLabel}>Email</Text>
            <Text style={styles.rowValue} numberOfLines={1}>{user?.email ?? '—'}</Text>
            <ChevronRight />
          </TouchableOpacity>
          <Separator />
          <TouchableOpacity style={styles.row} onPress={handlePasswordReset}>
            <View style={styles.rowIcon}><LockIcon /></View>
            <Text style={styles.rowLabel}>Password</Text>
            <Text style={styles.rowValue}>••••••••</Text>
            <ChevronRight />
          </TouchableOpacity>
          <Separator />
          <TouchableOpacity style={styles.row} onPress={handleSignOut}>
            <View style={styles.rowIcon}><LogoutIcon /></View>
            <Text style={[styles.rowLabel, { color: '#DC3545' }]}>Sign Out</Text>
          </TouchableOpacity>
          <Separator />
          <TouchableOpacity style={styles.row} onPress={handleDeleteAccount} disabled={deleting}>
            <View style={styles.rowIcon}><TrashIcon /></View>
            <Text style={[styles.rowLabel, { color: '#DC3545' }]}>Delete Account</Text>
          </TouchableOpacity>
        </View>

        {/* ── My Style card ── */}
        <View style={[styles.card, { paddingBottom: 16 }]}>
          <Text style={styles.cardLabel}>MY STYLE</Text>

          {/* Segmented bar */}
          <View style={styles.styleBar}>
            {styleSegments.map((s) => (
              <View key={s.key} style={{ flexGrow: s.percent, backgroundColor: s.color, height: 8 }} />
            ))}
          </View>

          {/* Percent labels */}
          <View style={styles.styleLabelRow}>
            {styleSegments.map((s) => (
              <Text key={s.key} style={[styles.stylePercent, { flexGrow: s.percent }]}>{s.percent}%</Text>
            ))}
          </View>

          {/* Name labels */}
          <View style={styles.styleLabelRow}>
            {styleSegments.map((s) => (
              <Text key={s.key} style={[styles.styleName, { flexGrow: s.percent }]} numberOfLines={1}>{s.label}</Text>
            ))}
          </View>

          {/* Retake quiz */}
          <TouchableOpacity style={styles.retakeBtn} onPress={handleRetakeQuiz}>
            <Text style={styles.retakeBtnText}>Retake Style Quiz</Text>
          </TouchableOpacity>
        </View>

        {/* ── Saved Items card ── */}
        <View style={[styles.card, { paddingBottom: 16 }]}>
          <View style={styles.savedHeader}>
            <Text style={styles.cardLabel}>SAVED ITEMS</Text>
            <TouchableOpacity><Text style={styles.viewAll}>View All</Text></TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.savedScroll}>
            {(savedProducts.length > 0
              ? savedProducts.map((p) => (
                <View key={p.id} style={styles.savedThumb}>
                  <Image source={{ uri: p.image_url }} style={styles.savedImg} resizeMode="cover" />
                </View>
              ))
              : SAVED_IMAGES.map((uri, i) => (
                <View key={i} style={styles.savedThumb}>
                  <Image source={{ uri }} style={styles.savedImg} resizeMode="cover" />
                </View>
              ))
            )}
          </ScrollView>
        </View>

        {/* ── Preferences card ── */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>PREFERENCES</Text>
          <Separator />
          <View style={styles.row}>
            <View style={styles.rowIcon}><BellIcon /></View>
            <Text style={styles.rowLabel}>Notifications</Text>
            <Switch
              value={notificationsEnabled}
              onValueChange={setNotificationsEnabled}
              trackColor={{ false: 'rgba(0,0,0,0.15)', true: GOLD }}
              thumbColor="#FFF"
            />
          </View>
          <Separator />
          <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('TokenShop')}>
            <View style={styles.rowIcon}><CreditCardIcon /></View>
            <Text style={styles.rowLabel}>Get More Tokens</Text>
            <Text style={[styles.rowValue, { color: GOLD }]}>999</Text>
            <ChevronRight />
          </TouchableOpacity>
          <Separator />
          <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('TokenHistory')}>
            <View style={styles.rowIcon}><CreditCardIcon /></View>
            <Text style={styles.rowLabel}>Transaction History</Text>
            <ChevronRight />
          </TouchableOpacity>
        </View>

        {/* ── Support card ── */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>SUPPORT</Text>
          <Separator />
          <TouchableOpacity style={styles.row} onPress={() => Linking.openURL('mailto:hellocova@gmail.com')}>
            <View style={styles.rowIcon}><HelpIcon /></View>
            <Text style={styles.rowLabel}>Help Center</Text>
            <ChevronRight />
          </TouchableOpacity>
          <Separator />
          <TouchableOpacity style={styles.row} onPress={() => Linking.openURL('https://cova.ai/terms')}>
            <View style={styles.rowIcon}><DocIcon /></View>
            <Text style={styles.rowLabel}>Terms & Privacy</Text>
            <ChevronRight />
          </TouchableOpacity>
        </View>

        {/* ── Version footer ── */}
        <Text style={styles.version}>Cova v{appVersion}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BG },

  // ── Header ──
  header: {
    backgroundColor: BG,
    paddingHorizontal: 20, paddingBottom: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
  },
  headerBack: { position: 'absolute', left: 16, padding: 4 },
  headerTitle: { color: 'white', fontSize: 18, letterSpacing: 1 },

  // ── Hero ──
  hero: {
    backgroundColor: BG,
    paddingBottom: 28, paddingHorizontal: 20,
    alignItems: 'center',
  },
  avatar: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: 'rgba(196,164,90,0.2)',
    borderWidth: 2, borderColor: GOLD,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: GOLD, fontSize: 32, fontWeight: '400' },
  heroName: { color: 'white', fontSize: 22, fontWeight: '400', marginTop: 12, letterSpacing: 1 },
  heroEmail: { color: 'rgba(255,255,255,0.55)', fontSize: 14, marginTop: 4 },
  editLink: { color: GOLD, fontSize: 14, marginTop: 8, letterSpacing: 0.5 },

  // ── Body ──
  body: { flex: 1, backgroundColor: CREAM },

  // ── Card ──
  card: {
    backgroundColor: 'white', borderRadius: 16,
    marginHorizontal: 16, marginTop: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
    overflow: 'hidden',
  },
  cardLabel: {
    fontSize: 13, fontWeight: '500', letterSpacing: 1,
    color: BG, opacity: 0.5,
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8,
  },

  // ── Row ──
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  rowIcon: { width: 20, height: 20, opacity: 0.6, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { color: BG, fontSize: 16, flex: 1, marginLeft: 12 },
  rowValue: { color: 'rgba(0,0,0,0.4)', fontSize: 14, marginRight: 8 },
  separator: { height: 0.5, backgroundColor: 'rgba(0,0,0,0.06)', marginLeft: 16 },

  // ── Style bar ──
  styleBar: {
    flexDirection: 'row', height: 8, borderRadius: 4,
    marginHorizontal: 16, overflow: 'hidden',
  },
  styleLabelRow: { flexDirection: 'row', marginHorizontal: 16, marginTop: 4 },
  stylePercent: { fontSize: 11, color: 'rgba(0,0,0,0.5)', textAlign: 'center' },
  styleName: { fontSize: 9, color: 'rgba(0,0,0,0.4)', textAlign: 'center', paddingHorizontal: 2 },
  retakeBtn: { alignSelf: 'center', marginTop: 16 },
  retakeBtnText: { color: GOLD, fontSize: 14, letterSpacing: 0.5 },

  // ── Saved items ──
  savedHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12,
  },
  viewAll: { fontSize: 13, color: GOLD, letterSpacing: 0.5 },
  savedScroll: { paddingHorizontal: 16, gap: 10 },
  savedThumb: { width: 72, height: 72, borderRadius: 10, overflow: 'hidden' },
  savedImg: { width: 72, height: 72 },

  // ── Version ──
  version: { textAlign: 'center', marginTop: 20, marginBottom: 20, fontSize: 12, color: 'rgba(0,0,0,0.3)' },
});

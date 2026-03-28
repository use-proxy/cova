import React, { useState, useEffect } from 'react';
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
  TextInput,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import Slider from '@react-native-community/slider';
import Svg, { Path, Circle as SvgCircle, Polyline, Rect, Line } from 'react-native-svg';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppStore } from '../../store';
import { supabase, callEdgeFunction } from '../../lib/supabase';
import type { StyleName, Product, Room } from '@cova/shared';
import type { HomeStackParamList } from '../../navigation/HomeStack';

const BG = '#0A1628';
const GOLD = '#B8860B';
const SCREEN_WIDTH = Dimensions.get('window').width;

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
const STYLE_KEYS: StyleName[] = ['coastal', 'japandi', 'bohemian', 'mid_century', 'minimalist'];

// ── SVG Icons ──

function BackIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Polyline points="15,18 9,12 15,6" stroke="white" strokeWidth={2} fill="none" />
    </Svg>
  );
}

function ChevronRight() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Polyline points="9,18 15,12 9,6" stroke="rgba(255,255,255,0.3)" strokeWidth={2} fill="none" />
    </Svg>
  );
}

// ── Helpers ──

function getDominant(blend: Record<string, number>): StyleName {
  const entries = Object.entries(blend) as [StyleName, number][];
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

function formatBudget(value: number): string {
  if (value >= 10000) return '$10,000+';
  return `$${value.toLocaleString()}`;
}

// ══════════════════════════════════════════════════
// Screen
// ══════════════════════════════════════════════════

export default function ProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const user = useAppStore((s) => s.user);
  const rooms = useAppStore((s) => s.rooms);
  const savedProducts = useAppStore((s) => s.savedProducts);

  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [useMetric, setUseMetric] = useState(false);
  const [defaultBudget, setDefaultBudget] = useState(5000);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(user?.full_name ?? '');
  const [deleting, setDeleting] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [isEmailAuth, setIsEmailAuth] = useState(false);

  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  // Check auth provider
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const provider = data.session?.user?.app_metadata?.provider;
      setIsEmailAuth(provider === 'email' || !provider);
    });
  }, []);

  // Compute stats
  const completedRooms = rooms.filter((r) => r.latest_render_url);
  const totalRenders = rooms.reduce((acc, r) => {
    return acc + (r.latest_render_url ? 1 : 0);
  }, 0);

  // Combined style blend across all rooms with renders (for "My Style")
  const combinedBlend: Record<string, number> = { coastal: 0, japandi: 0, bohemian: 0, mid_century: 0, minimalist: 0 };
  if (completedRooms.length >= 2) {
    for (const r of completedRooms) {
      const blend = r.style_blend as Record<string, number> | null;
      if (!blend) continue;
      for (const k of STYLE_KEYS) combinedBlend[k] += (blend[k] ?? 0);
    }
    const sum = STYLE_KEYS.reduce((a, k) => a + combinedBlend[k], 0);
    if (sum > 0) for (const k of STYLE_KEYS) combinedBlend[k] /= sum;
  }

  const favoriteStyle = completedRooms.length > 0
    ? STYLE_LABELS[getDominant(completedRooms[0].style_blend as Record<string, number>)]
    : '—';

  const getInitials = () => {
    if (user?.full_name) return user.full_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
    if (user?.email) return user.email[0].toUpperCase();
    return '?';
  };

  const memberSince = user ? new Date(
    (user as unknown as Record<string, unknown>).created_at as string ?? Date.now()
  ).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '';

  // ── Avatar upload ──
  const handleAvatarUpload = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    setUploadingAvatar(true);
    try {
      const compressed = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 512 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
      );
      const response = await fetch(compressed.uri);
      const blob = await response.blob();
      const path = `${user!.id}/avatar.jpg`;
      const { error: uploadErr } = await supabase.storage.from('avatars').upload(path, blob, { upsert: true });
      if (uploadErr) throw uploadErr;
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      await supabase.from('users').update({ avatar_url: avatarUrl }).eq('id', user!.id);
      useAppStore.getState().setUser({ ...user!, avatar_url: avatarUrl });
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not upload avatar.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  // ── Name edit ──
  const handleSaveName = async () => {
    if (!nameInput.trim() || !user) return;
    await supabase.from('users').update({ full_name: nameInput.trim() }).eq('id', user.id);
    useAppStore.getState().setUser({ ...user, full_name: nameInput.trim() });
    setEditingName(false);
  };

  // ── Actions ──
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
    Alert.alert('Delete your account?', 'This cannot be undone. All your rooms, renders, and data will be permanently deleted.', [
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
  };

  const handlePasswordReset = async () => {
    if (!user?.email) return;
    try {
      await supabase.auth.resetPasswordForEmail(user.email);
      Alert.alert('Password Reset', 'Password reset email sent.');
    } catch { Alert.alert('Error', 'Could not send reset email.'); }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBack} onPress={() => navigation.goBack()}>
          <BackIcon />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

        {/* ── Avatar + Name + Email ── */}
        <View style={styles.profileHero}>
          <TouchableOpacity onPress={handleAvatarUpload} style={styles.avatarWrap}>
            {user?.avatar_url ? (
              <Image source={{ uri: user.avatar_url }} style={styles.avatarImg} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarText}>{getInitials()}</Text>
              </View>
            )}
            {uploadingAvatar && (
              <View style={styles.avatarOverlay}>
                <ActivityIndicator color="#FFF" />
              </View>
            )}
            <View style={styles.cameraBadge}>
              <Text style={styles.cameraBadgeText}>📷</Text>
            </View>
          </TouchableOpacity>

          {editingName ? (
            <View style={styles.nameEditRow}>
              <TextInput
                style={styles.nameInput}
                value={nameInput}
                onChangeText={setNameInput}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleSaveName}
                placeholderTextColor="rgba(255,255,255,0.3)"
              />
              <TouchableOpacity onPress={handleSaveName}>
                <Text style={styles.saveNameBtn}>Save</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={() => { setNameInput(user?.full_name ?? ''); setEditingName(true); }}>
              <Text style={styles.heroName}>{user?.full_name ?? 'Tap to set name'}</Text>
            </TouchableOpacity>
          )}

          <Text style={styles.heroEmail}>{user?.email ?? ''}</Text>
          {memberSince ? <Text style={styles.memberSince}>Member since {memberSince}</Text> : null}
        </View>

        {/* ── Design History Stats ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Design History</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{rooms.length}</Text>
              <Text style={styles.statLabel}>Total Rooms</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{totalRenders}</Text>
              <Text style={styles.statLabel}>Total Renders</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{favoriteStyle}</Text>
              <Text style={styles.statLabel}>Favorite Style</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{savedProducts.length}</Text>
              <Text style={styles.statLabel}>Products Saved</Text>
            </View>
          </View>
        </View>

        {/* ── My Style (only if 2+ completed rooms) ── */}
        {completedRooms.length >= 2 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>My Style</Text>
            <View style={styles.styleBarWrap}>
              <View style={styles.styleBar}>
                {STYLE_KEYS.map((k) => (
                  <View
                    key={k}
                    style={{
                      flex: Math.max(combinedBlend[k], 0.01),
                      backgroundColor: STYLE_COLORS[k],
                      height: 10,
                    }}
                  />
                ))}
              </View>
              <View style={styles.styleLabelRow}>
                {STYLE_KEYS.filter((k) => combinedBlend[k] > 0.05).map((k) => (
                  <Text key={k} style={styles.styleLabel}>
                    {STYLE_LABELS[k]} {Math.round(combinedBlend[k] * 100)}%
                  </Text>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* ── My Favorites ── */}
        {savedProducts.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>My Favorites</Text>
            <View style={styles.favGrid}>
              {savedProducts.slice(0, 6).map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={styles.favCard}
                  onPress={() => Alert.alert(p.name, `$${p.price} — ${p.retailer}`)}
                >
                  <Image source={{ uri: p.image_url }} style={styles.favImg} resizeMode="cover" />
                  <Text style={styles.favName} numberOfLines={1}>{p.name}</Text>
                  <Text style={styles.favPrice}>${p.price}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ── Settings ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Settings</Text>
          <View style={styles.settingsCard}>
            {/* Default Budget */}
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Default Budget</Text>
              <Text style={styles.settingValue}>{formatBudget(defaultBudget)}</Text>
            </View>
            <Slider
              style={styles.budgetSlider}
              minimumValue={500}
              maximumValue={10000}
              step={100}
              value={defaultBudget}
              onValueChange={setDefaultBudget}
              minimumTrackTintColor={GOLD}
              maximumTrackTintColor="rgba(255,255,255,0.15)"
              thumbTintColor={GOLD}
            />
            <View style={styles.settingSeparator} />

            {/* Notifications */}
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Notifications</Text>
              <Switch
                value={notificationsEnabled}
                onValueChange={setNotificationsEnabled}
                trackColor={{ false: 'rgba(255,255,255,0.15)', true: GOLD }}
                thumbColor="#FFF"
              />
            </View>
            <View style={styles.settingSeparator} />

            {/* Units */}
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Units</Text>
              <TouchableOpacity
                style={styles.unitsToggle}
                onPress={() => setUseMetric(!useMetric)}
              >
                <Text style={[styles.unitOption, !useMetric && styles.unitActive]}>Imperial</Text>
                <Text style={[styles.unitOption, useMetric && styles.unitActive]}>Metric</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ── Tokens ── */}
        <View style={styles.section}>
          <View style={styles.settingsCard}>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Token Balance</Text>
              <Text style={[styles.settingValue, { color: GOLD }]}>999</Text>
            </View>
            <View style={styles.settingSeparator} />
            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => Alert.alert('Coming Soon', 'Token purchases will be available in a future update.')}
            >
              <Text style={[styles.settingLabel, { color: GOLD }]}>Get More Tokens</Text>
              <ChevronRight />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Account ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.settingsCard}>
            {isEmailAuth && (
              <>
                <TouchableOpacity style={styles.settingRow} onPress={handlePasswordReset}>
                  <Text style={styles.settingLabel}>Change Password</Text>
                  <ChevronRight />
                </TouchableOpacity>
                <View style={styles.settingSeparator} />
              </>
            )}
            <TouchableOpacity style={styles.settingRow} onPress={handleSignOut}>
              <Text style={[styles.settingLabel, { color: '#DC3545' }]}>Sign Out</Text>
            </TouchableOpacity>
            <View style={styles.settingSeparator} />
            <TouchableOpacity style={styles.settingRow} onPress={handleDeleteAccount} disabled={deleting}>
              <Text style={[styles.settingLabel, { color: '#DC3545' }]}>
                {deleting ? 'Deleting...' : 'Delete Account'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── App Info ── */}
        <View style={styles.section}>
          <View style={styles.settingsCard}>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Version</Text>
              <Text style={styles.settingValue}>{appVersion}</Text>
            </View>
            <View style={styles.settingSeparator} />
            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => Alert.alert('Coming Soon', 'Privacy Policy will be available soon.')}
            >
              <Text style={styles.settingLabel}>Privacy Policy</Text>
              <ChevronRight />
            </TouchableOpacity>
            <View style={styles.settingSeparator} />
            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => Alert.alert('Coming Soon', 'Terms of Service will be available soon.')}
            >
              <Text style={styles.settingLabel}>Terms of Service</Text>
              <ChevronRight />
            </TouchableOpacity>
            <View style={styles.settingSeparator} />
            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => Linking.openURL('mailto:hellocova@gmail.com')}
            >
              <Text style={styles.settingLabel}>Contact Us</Text>
              <Text style={styles.settingValue}>hellocova@gmail.com</Text>
            </TouchableOpacity>
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ══════════════════════════════════════════════════
// Styles
// ══════════════════════════════════════════════════

const FAV_CARD_W = (SCREEN_WIDTH - 48 - 12) / 3;

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerBack: { position: 'absolute', left: 16, padding: 4 },
  headerTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '600', letterSpacing: 1 },
  body: { flex: 1 },

  // ── Profile hero ──
  profileHero: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 28,
  },
  avatarWrap: { position: 'relative' },
  avatarImg: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    borderColor: GOLD,
  },
  avatarFallback: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(184,134,11,0.2)',
    borderWidth: 2,
    borderColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: GOLD, fontSize: 32, fontWeight: '400' },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 44,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBadgeText: { fontSize: 14 },
  heroName: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '500',
    marginTop: 12,
    letterSpacing: 0.5,
  },
  heroEmail: { color: 'rgba(255,255,255,0.5)', fontSize: 14, marginTop: 4 },
  memberSince: { color: 'rgba(255,255,255,0.35)', fontSize: 12, marginTop: 4 },
  nameEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 8,
  },
  nameInput: {
    color: '#FFFFFF',
    fontSize: 18,
    borderBottomWidth: 1,
    borderBottomColor: GOLD,
    paddingVertical: 4,
    minWidth: 150,
    textAlign: 'center',
  },
  saveNameBtn: { color: GOLD, fontSize: 15, fontWeight: '600' },

  // ── Sections ──
  section: {
    paddingHorizontal: 24,
    marginTop: 24,
  },
  sectionTitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 12,
  },

  // ── Stats grid ──
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    width: (SCREEN_WIDTH - 48 - 12) / 2,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  statValue: { color: GOLD, fontSize: 20, fontWeight: '600' },
  statLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 4 },

  // ── Style bar ──
  styleBarWrap: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 16,
  },
  styleBar: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
  },
  styleLabelRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 10,
  },
  styleLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
  },

  // ── Favorites grid ──
  favGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  favCard: {
    width: FAV_CARD_W,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  favImg: { width: FAV_CARD_W, height: FAV_CARD_W, borderRadius: 10 },
  favName: { color: '#FFFFFF', fontSize: 11, paddingHorizontal: 6, paddingTop: 4 },
  favPrice: { color: GOLD, fontSize: 11, paddingHorizontal: 6, paddingBottom: 6 },

  // ── Settings card ──
  settingsCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  settingLabel: { color: '#FFFFFF', fontSize: 15 },
  settingValue: { color: 'rgba(255,255,255,0.5)', fontSize: 14 },
  settingSeparator: { height: 0.5, backgroundColor: 'rgba(255,255,255,0.08)', marginLeft: 16 },
  budgetSlider: {
    marginHorizontal: 12,
    height: 36,
  },

  // ── Units toggle ──
  unitsToggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    overflow: 'hidden',
  },
  unitOption: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
  },
  unitActive: {
    backgroundColor: GOLD,
    color: BG,
    fontWeight: '600',
    borderRadius: 16,
    overflow: 'hidden',
  },
});

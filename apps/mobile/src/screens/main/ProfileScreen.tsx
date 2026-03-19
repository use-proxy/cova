import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Linking,
  FlatList,
  Image,
  Modal,
  Share,
  Dimensions,
  ActivityIndicator,
  Platform,
} from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { useAppStore } from '../../store';
import { supabase } from '../../lib/supabase';
import { callEdgeFunction } from '../../lib/supabase';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { StyleName } from '@cova/shared';
import TokenBadge from '../../components/TokenBadge';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GALLERY_GAP = 8;
const GALLERY_CELL = (SCREEN_WIDTH - 32 - 40 - GALLERY_GAP) / 2;

const STYLE_DISPLAY: Record<StyleName, string> = {
  coastal: 'Ocean Breeze',
  japandi: 'Zen Garden',
  bohemian: 'Boho Spirit',
  mid_century: 'Mid-Century',
  minimalist: 'Pure Lines',
};

const STYLE_KEYS: StyleName[] = ['coastal', 'japandi', 'bohemian', 'mid_century', 'minimalist'];

const UNITS_KEY = 'cova_units';
type UnitPref = 'ft' | 'm';

interface RenderItem {
  id: string;
  image_url: string;
  created_at: string;
  status: string;
}

export default function ProfileScreen() {
  const navigation = useNavigation();
  const user = useAppStore((s) => s.user);
  const currentRoom = useAppStore((s) => s.currentRoom);
  const colorScheme = useAppStore((s) => s.colorScheme);

  const [renders, setRenders] = useState<RenderItem[]>([]);
  const [rendersLoading, setRendersLoading] = useState(true);
  const [selectedRender, setSelectedRender] = useState<RenderItem | null>(null);
  const [units, setUnits] = useState<UnitPref>('ft');
  const [deleting, setDeleting] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState(user?.full_name ?? '');

  const styleBlend = currentRoom?.style_blend ?? {
    coastal: 0.2, japandi: 0.2, bohemian: 0.2, mid_century: 0.2, minimalist: 0.2,
  };

  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  useEffect(() => {
    fetchRenders();
    loadUnits();
  }, []);

  const fetchRenders = useCallback(async () => {
    if (!user) return;
    setRendersLoading(true);
    const { data } = await supabase
      .from('renders')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .order('created_at', { ascending: false });
    if (data) setRenders(data as RenderItem[]);
    setRendersLoading(false);
  }, [user]);

  const loadUnits = async () => {
    const stored = await AsyncStorage.getItem(UNITS_KEY);
    if (stored === 'ft' || stored === 'm') setUnits(stored);
  };

  const setUnitPref = async (u: UnitPref) => {
    setUnits(u);
    await AsyncStorage.setItem(UNITS_KEY, u);
  };

  const getInitials = (name: string | null | undefined, email: string | undefined) => {
    if (name) return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
    if (email) return email[0].toUpperCase();
    return '?';
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
          useAppStore.getState().signOut();
        },
      },
    ]);
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    setDeleting(true);
    try {
      await callEdgeFunction('delete-account', {});
      useAppStore.getState().signOut();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not delete account. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const confirmDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This permanently deletes all your rooms, renders, and data. This cannot be undone.',
      [
        { text: 'Cancel' },
        { text: 'Delete Everything', style: 'destructive', onPress: handleDeleteAccount },
      ],
    );
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from('users')
        .update({ full_name: editName })
        .eq('id', user.id);
      if (error) throw error;
      useAppStore.getState().setUser({ ...user, full_name: editName } as any);
      setEditMode(false);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not update profile.');
    }
  };

  const handleCancelEdit = () => {
    setEditName(user?.full_name ?? '');
    setEditMode(false);
  };

  const handleSaveRender = async (imageUrl: string) => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow photo library access to save.');
        return;
      }
      await MediaLibrary.saveToLibraryAsync(imageUrl);
      Alert.alert('Saved', 'Render saved to your camera roll.');
    } catch {
      Alert.alert('Error', 'Could not save render.');
    }
  };

  const handleShareRender = async (imageUrl: string) => {
    try {
      await Share.share({ url: imageUrl });
    } catch {
      // user cancelled
    }
  };

  const renderGalleryCell = ({ item }: { item: RenderItem }) => (
    <TouchableOpacity
      style={styles.galleryCell}
      onPress={() => setSelectedRender(item)}
    >
      <Image source={{ uri: item.image_url }} style={styles.galleryCellImage} resizeMode="cover" />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
        <TokenBadge />
      </View>

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
        {/* User card */}
        <View style={styles.userCard}>
          <View style={styles.avatarLarge}>
            <Text style={styles.avatarLargeText}>
              {getInitials(user?.full_name, user?.email)}
            </Text>
          </View>
          {editMode ? (
            <>
              <TextInput
                style={styles.editNameInput}
                value={editName}
                onChangeText={setEditName}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleSaveProfile}
              />
              <View style={styles.editBtnRow}>
                <TouchableOpacity style={styles.editSaveBtn} onPress={handleSaveProfile}>
                  <Text style={styles.editSaveBtnText}>Save</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.editCancelBtn} onPress={handleCancelEdit}>
                  <Text style={styles.editCancelBtnText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <View style={styles.nameRow}>
              <Text style={styles.userName}>{user?.full_name ?? 'Cova User'}</Text>
              <TouchableOpacity onPress={() => { setEditName(user?.full_name ?? ''); setEditMode(true); }}>
                <Text style={styles.editPencil}>✏️</Text>
              </TouchableOpacity>
            </View>
          )}
          <Text style={styles.userEmail}>{user?.email}</Text>
          <View style={styles.accountBadge}>
            <Text style={styles.accountBadgeText}>
              {user?.account_type === 'realtor' ? 'Realtor' : 'Consumer'}
            </Text>
          </View>
        </View>

        {/* Style DNA */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Your Style DNA</Text>
          {STYLE_KEYS.map((key) => {
            const value = styleBlend[key] ?? 0.2;
            const pct = Math.round(value * 100);
            return (
              <View key={key} style={styles.blendRow}>
                <Text style={styles.blendLabel}>{STYLE_DISPLAY[key]}</Text>
                <View style={styles.blendBarBg}>
                  <View style={[styles.blendBarFill, { width: `${pct}%` }]} />
                </View>
                <Text style={styles.blendPct}>{pct}%</Text>
              </View>
            );
          })}
          <TouchableOpacity onPress={() => (navigation as any).navigate('RoomsTab', { screen: 'Room', params: { screen: 'StyleQuiz' } })}>
            <Text style={styles.retakeLink}>Retake Style Quiz</Text>
          </TouchableOpacity>
        </View>

        {/* Render Gallery */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Render Gallery</Text>
          {rendersLoading ? (
            <ActivityIndicator color="#C47B3C" style={{ marginVertical: 20 }} />
          ) : renders.length === 0 ? (
            <Text style={styles.galleryEmpty}>Complete a render to see it here.</Text>
          ) : (
            <FlatList
              data={renders}
              renderItem={renderGalleryCell}
              keyExtractor={(item) => item.id}
              numColumns={2}
              scrollEnabled={false}
              columnWrapperStyle={styles.galleryRow}
              contentContainerStyle={styles.galleryContainer}
            />
          )}
        </View>

        {/* Settings */}
        <View style={styles.sectionCard}>
          <SettingsRow label="Account Type" value={user?.account_type === 'realtor' ? 'Realtor' : 'Consumer'} />
          <SettingsRow label="Token Balance" value="🪙 999" />

          {/* Units toggle */}
          <View style={[styles.settingsRow, styles.settingsRowBorder]}>
            <Text style={styles.settingsLabel}>Units</Text>
            <View style={styles.unitToggle}>
              <TouchableOpacity
                style={[styles.unitPill, units === 'ft' && styles.unitPillActive]}
                onPress={() => setUnitPref('ft')}
              >
                <Text style={[styles.unitPillText, units === 'ft' && styles.unitPillTextActive]}>ft</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.unitPill, units === 'm' && styles.unitPillActive]}
                onPress={() => setUnitPref('m')}
              >
                <Text style={[styles.unitPillText, units === 'm' && styles.unitPillTextActive]}>m</Text>
              </TouchableOpacity>
            </View>
          </View>

          <SettingsRow label="Notifications" value="On" />

          {/* Appearance toggle */}
          <View style={[styles.settingsRow, styles.settingsRowBorder]}>
            <Text style={styles.settingsLabel}>Appearance</Text>
            <View style={styles.unitToggle}>
              <TouchableOpacity
                style={[styles.unitPill, colorScheme === 'dark' && styles.unitPillActive]}
                onPress={() => useAppStore.getState().setColorScheme('dark')}
              >
                <Text style={[styles.unitPillText, colorScheme === 'dark' && styles.unitPillTextActive]}>Dark</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.unitPill, colorScheme === 'light' && styles.unitPillActive]}
                onPress={() => useAppStore.getState().setColorScheme('light')}
              >
                <Text style={[styles.unitPillText, colorScheme === 'light' && styles.unitPillTextActive]}>Light</Text>
              </TouchableOpacity>
            </View>
          </View>

          <SettingsRow
            label="Transaction History"
            value="›"
            onPress={() => (navigation as any).navigate('TokenHistory')}
          />
          <SettingsRow
            label="Privacy Policy"
            value="›"
            onPress={() => Linking.openURL('https://ai.cova.app/privacy')}
          />
          <SettingsRow
            label="Terms of Service"
            value="›"
            onPress={() => Linking.openURL('https://ai.cova.app/terms')}
          />
          <TouchableOpacity
            style={styles.settingsRow}
            onPress={confirmDeleteAccount}
            disabled={deleting}
          >
            <Text style={styles.deleteLabel}>Delete Account</Text>
            {deleting ? (
              <ActivityIndicator color="#CC3333" size="small" />
            ) : (
              <Text style={styles.deleteChevron}>›</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Sign out */}
        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        {/* App version */}
        <Text style={styles.versionText}>Cova V{appVersion}</Text>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Full-screen render modal */}
      <Modal visible={selectedRender !== null} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalClose} onPress={() => setSelectedRender(null)}>
            <Text style={styles.modalCloseText}>✕</Text>
          </TouchableOpacity>

          {selectedRender && (
            <Image
              source={{ uri: selectedRender.image_url }}
              style={styles.modalImage}
              resizeMode="contain"
            />
          )}

          <View style={styles.modalActions}>
            <TouchableOpacity
              style={styles.modalActionBtn}
              onPress={() => selectedRender && handleSaveRender(selectedRender.image_url)}
            >
              <Text style={styles.modalActionText}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalActionBtn}
              onPress={() => selectedRender && handleShareRender(selectedRender.image_url)}
            >
              <Text style={styles.modalActionText}>Share</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function SettingsRow({
  label,
  value,
  onPress,
  isLast,
}: {
  label: string;
  value: string;
  onPress?: () => void;
  isLast?: boolean;
}) {
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <Wrapper onPress={onPress} style={[styles.settingsRow, !isLast && styles.settingsRowBorder]}>
      <Text style={styles.settingsLabel}>{label}</Text>
      <Text style={styles.settingsValue}>{value}</Text>
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F0E8',
  },
  header: {
    backgroundColor: '#1B3A2D',
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: 'white',
  },
  body: {
    flex: 1,
    paddingHorizontal: 16,
  },
  userCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginTop: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  avatarLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#C47B3C',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarLargeText: {
    color: 'white',
    fontSize: 28,
    fontWeight: '700',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  userName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1B3A2D',
  },
  editPencil: {
    fontSize: 16,
  },
  editNameInput: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1B3A2D',
    borderBottomWidth: 2,
    borderBottomColor: '#C47B3C',
    paddingVertical: 4,
    paddingHorizontal: 8,
    minWidth: 180,
    textAlign: 'center',
    marginBottom: 8,
  },
  editBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 4,
  },
  editSaveBtn: {
    backgroundColor: '#C47B3C',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  editSaveBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  editCancelBtn: {
    borderWidth: 1.5,
    borderColor: '#1B3A2D',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 7,
  },
  editCancelBtnText: {
    color: '#1B3A2D',
    fontSize: 14,
    fontWeight: '600',
  },
  userEmail: {
    fontSize: 14,
    color: '#888888',
    marginBottom: 8,
  },
  accountBadge: {
    backgroundColor: 'rgba(27,58,45,0.08)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  accountBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1B3A2D',
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginTop: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1B3A2D',
    marginBottom: 16,
  },
  blendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  blendLabel: {
    width: 90,
    fontSize: 13,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  blendBarBg: {
    flex: 1,
    height: 8,
    backgroundColor: '#E8E0D0',
    borderRadius: 4,
    marginHorizontal: 8,
    overflow: 'hidden',
  },
  blendBarFill: {
    height: '100%',
    backgroundColor: '#C47B3C',
    borderRadius: 4,
  },
  blendPct: {
    width: 36,
    fontSize: 13,
    fontWeight: '700',
    color: '#C47B3C',
    textAlign: 'right',
  },
  retakeLink: {
    color: '#C47B3C',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 12,
    textAlign: 'center',
  },

  // Render Gallery
  galleryContainer: {
    gap: GALLERY_GAP,
  },
  galleryRow: {
    gap: GALLERY_GAP,
  },
  galleryCell: {
    width: GALLERY_CELL,
    height: GALLERY_CELL,
    borderRadius: 8,
    overflow: 'hidden',
  },
  galleryCellImage: {
    width: '100%',
    height: '100%',
  },
  galleryEmpty: {
    color: '#888888',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 16,
  },

  // Settings
  settingsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
  },
  settingsRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  settingsLabel: {
    fontSize: 15,
    color: '#1A1A1A',
  },
  settingsValue: {
    fontSize: 15,
    color: '#888888',
    fontWeight: '500',
  },

  // Units toggle
  unitToggle: {
    flexDirection: 'row',
    gap: 6,
  },
  unitPill: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#1B3A2D',
  },
  unitPillActive: {
    backgroundColor: '#1B3A2D',
  },
  unitPillText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1B3A2D',
  },
  unitPillTextActive: {
    color: '#FFFFFF',
  },

  // Delete Account
  deleteLabel: {
    fontSize: 15,
    color: '#CC3333',
    fontWeight: '600',
  },
  deleteChevron: {
    fontSize: 15,
    color: '#CC3333',
    fontWeight: '500',
  },

  // Sign Out
  signOutButton: {
    backgroundColor: 'rgba(204,51,51,0.1)',
    borderRadius: 28,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  signOutText: {
    color: '#CC3333',
    fontSize: 16,
    fontWeight: '700',
  },

  // Version
  versionText: {
    color: '#888888',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 20,
  },

  // Full-screen modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalClose: {
    position: 'absolute',
    top: 56,
    right: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  modalCloseText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  modalImage: {
    width: SCREEN_WIDTH - 32,
    height: SCREEN_WIDTH - 32,
    borderRadius: 12,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 24,
  },
  modalActionBtn: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  modalActionText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});

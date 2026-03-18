import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Linking,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAppStore } from '../../store';
import { supabase } from '../../lib/supabase';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { StyleName } from '@cova/shared';

const STYLE_DISPLAY: Record<StyleName, string> = {
  coastal: 'Ocean Breeze',
  japandi: 'Zen Garden',
  bohemian: 'Boho Spirit',
  mid_century: 'Mid-Century',
  minimalist: 'Pure Lines',
};

const STYLE_KEYS: StyleName[] = ['coastal', 'japandi', 'bohemian', 'mid_century', 'minimalist'];

export default function ProfileScreen() {
  const navigation = useNavigation();
  const user = useAppStore((s) => s.user);
  const currentRoom = useAppStore((s) => s.currentRoom);

  const styleBlend = currentRoom?.style_blend ?? {
    coastal: 0.2, japandi: 0.2, bohemian: 0.2, mid_century: 0.2, minimalist: 0.2,
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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
      </View>

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
        {/* User card */}
        <View style={styles.userCard}>
          <View style={styles.avatarLarge}>
            <Text style={styles.avatarLargeText}>
              {getInitials(user?.full_name, user?.email)}
            </Text>
          </View>
          <Text style={styles.userName}>{user?.full_name ?? 'Cova User'}</Text>
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

        {/* Settings */}
        <View style={styles.sectionCard}>
          <SettingsRow label="Account Type" value={user?.account_type === 'realtor' ? 'Realtor' : 'Consumer'} />
          <SettingsRow label="Token Balance" value="🪙 999" />
          <SettingsRow label="Notifications" value="On" />
          <SettingsRow
            label="Privacy Policy"
            value="›"
            onPress={() => Linking.openURL('https://ai.cova.app/privacy')}
          />
          <SettingsRow
            label="Terms of Service"
            value="›"
            onPress={() => Linking.openURL('https://ai.cova.app/terms')}
            isLast
          />
        </View>

        {/* Sign out */}
        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
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
  userName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1B3A2D',
    marginBottom: 2,
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
});

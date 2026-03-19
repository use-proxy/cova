import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAppStore } from '../store';

export default function TokenBadge() {
  const navigation = useNavigation<any>();
  const user = useAppStore((s) => s.user);
  const balance = (user as any)?.token_balance ?? 999;

  const handlePress = () => {
    try {
      navigation.navigate('TokenShop');
    } catch {
      // TokenShop may not be in current navigator
    }
  };

  return (
    <TouchableOpacity style={styles.badge} onPress={handlePress} activeOpacity={0.7}>
      <View style={styles.dot} />
      <Text style={styles.count}>{balance}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#C4A45A',
  },
  count: {
    fontSize: 14,
    fontWeight: '500',
    color: 'white',
  },
});

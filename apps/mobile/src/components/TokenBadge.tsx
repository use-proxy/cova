import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';

export default function TokenBadge() {
  const navigation = useNavigation<any>();

  const handlePress = () => {
    try {
      navigation.navigate('TokenShop');
    } catch {
      // TokenShop may not be in current navigator
    }
  };

  return (
    <TouchableOpacity style={styles.badge} onPress={handlePress} activeOpacity={0.7}>
      <Text style={styles.coin}>🪙</Text>
      <Text style={styles.count}>999</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(196,123,60,0.15)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  coin: {
    fontSize: 14,
  },
  count: {
    fontSize: 13,
    fontWeight: '700',
    color: '#C47B3C',
  },
});

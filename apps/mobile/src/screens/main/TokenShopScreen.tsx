import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';

export default function TokenShopScreen() {
  const navigation = useNavigation();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.overlay}>
        <Text style={styles.coinEmoji}>🪙</Text>
        <Text style={styles.title}>Token Shop</Text>
        <Text style={styles.subtitle}>Coming Soon</Text>
        <Text style={styles.body}>
          Token packs and premium features will be available in a future update.
        </Text>
        <TouchableOpacity style={styles.button} onPress={() => navigation.goBack()}>
          <Text style={styles.buttonText}>Got it</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.restoreBtn} onPress={() => {}}>
          <Text style={styles.restoreText}>Restore Purchases</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1B3A2D',
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  coinEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#C47B3C',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#F5F0E8',
    marginBottom: 16,
  },
  body: {
    fontSize: 15,
    color: 'rgba(245,240,232,0.7)',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  button: {
    backgroundColor: '#C47B3C',
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: 28,
    marginBottom: 16,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  restoreBtn: {
    paddingVertical: 8,
  },
  restoreText: {
    fontSize: 14,
    color: 'rgba(245,240,232,0.5)',
  },
});

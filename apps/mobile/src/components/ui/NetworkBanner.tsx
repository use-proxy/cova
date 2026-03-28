import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

export function NetworkBanner() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOffline(!(state.isConnected ?? true));
    });
    return () => unsubscribe();
  }, []);

  if (!isOffline) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>No internet connection — some features unavailable</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: 'rgba(198,40,40,0.9)',
    paddingVertical: 6,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  text: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
});

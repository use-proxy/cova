import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function RenderViewScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Render View Screen</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F0E8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    color: '#1B3A2D',
    fontSize: 18,
    fontWeight: '600',
  },
});

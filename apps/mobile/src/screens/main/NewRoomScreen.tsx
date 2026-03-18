import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function NewRoomScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>New Room Screen</Text>
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

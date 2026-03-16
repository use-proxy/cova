import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../../App';

type HomeScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Home'>;

export function HomeScreen() {
  const navigation = useNavigation<HomeScreenNavigationProp>();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Cova</Text>
      <TouchableOpacity
        style={styles.button}
        onPress={() =>
          navigation.navigate('RoomViewer3D', { room_id: 'default' })
        }
      >
        <Text style={styles.buttonText}>View 3D Room</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B1729',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    color: '#C9A84C',
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#C9A84C',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  buttonText: {
    color: '#0B1729',
    fontSize: 16,
    fontWeight: '700',
  },
});

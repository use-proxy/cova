import 'react-native-url-polyfill/auto';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import { HomeScreen } from './src/screens/main/HomeScreen';
import { RoomCalibrationScreen } from './src/screens/main/RoomCalibrationScreen';
import { RoomViewer3DScreen } from './src/screens/main/RoomViewer3DScreen';

export type RootStackParamList = {
  Home: undefined;
  RoomCalibration: { room_id: string; image_url: string };
  RoomViewer3D: { room_id: string; image_url?: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <GestureHandlerRootView style={styles.container}>
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName="Home"
          screenOptions={{
            headerStyle: { backgroundColor: '#0B1729' },
            headerTintColor: '#FAF7F2',
            headerTitleStyle: { fontWeight: '700' },
          }}
        >
          <Stack.Screen
            name="Home"
            component={HomeScreen}
            options={{ title: 'Cova' }}
          />
          <Stack.Screen
            name="RoomCalibration"
            component={RoomCalibrationScreen}
            options={{ title: 'Calibrate Room' }}
          />
          <Stack.Screen
            name="RoomViewer3D"
            component={RoomViewer3DScreen}
            options={{ title: 'My Room in 3D' }}
          />
        </Stack.Navigator>
      </NavigationContainer>
      <StatusBar style="light" />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});

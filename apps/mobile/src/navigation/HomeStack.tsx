import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../screens/main/HomeScreen';
import NewRoomScreen from '../screens/main/NewRoomScreen';
import RoomNavigator from './RoomNavigator';

export type HomeStackParamList = {
  Home: undefined;
  NewRoom: undefined;
  Room: undefined;
};

const Stack = createNativeStackNavigator<HomeStackParamList>();

export default function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="NewRoom" component={NewRoomScreen} />
      <Stack.Screen name="Room" component={RoomNavigator} />
    </Stack.Navigator>
  );
}

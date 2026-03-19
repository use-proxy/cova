import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../screens/main/HomeScreen';
import NewRoomScreen from '../screens/main/NewRoomScreen';
import TokenShopScreen from '../screens/main/TokenShopScreen';
import TokenHistoryScreen from '../screens/main/TokenHistoryScreen';
import RenderGalleryScreen from '../screens/main/RenderGalleryScreen';
import RoomNavigator from './RoomNavigator';
import type { RoomStackParamList } from './RoomNavigator';

export type HomeStackParamList = {
  Home: undefined;
  NewRoom: undefined;
  Room: { initialRoute?: keyof RoomStackParamList; room_id?: string };
  TokenShop: undefined;
  TokenHistory: undefined;
  RenderGallery: undefined;
};

const Stack = createNativeStackNavigator<HomeStackParamList>();

function RoomNavigatorWrapper({ route }: { route: { params?: { initialRoute?: keyof RoomStackParamList } } }) {
  const initialRoute = route.params?.initialRoute ?? 'RoomCapture';
  return <RoomNavigator initialRouteName={initialRoute} />;
}

export default function HomeStack({ initialRouteName = 'Home' }: { initialRouteName?: 'Home' | 'NewRoom' }) {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName={initialRouteName}>
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="NewRoom" component={NewRoomScreen} />
      <Stack.Screen name="Room" component={RoomNavigatorWrapper as any} />
      <Stack.Screen name="TokenShop" component={TokenShopScreen} />
      <Stack.Screen name="TokenHistory" component={TokenHistoryScreen} />
      <Stack.Screen name="RenderGallery" component={RenderGalleryScreen} />
    </Stack.Navigator>
  );
}

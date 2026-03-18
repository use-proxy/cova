import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import RoomCaptureScreen from '../screens/main/RoomCaptureScreen';
import StyleQuizScreen from '../screens/main/StyleQuizScreen';
import { RoomViewer3DScreen } from '../screens/main/RoomViewer3DScreen';
import RenderViewScreen from '../screens/main/RenderViewScreen';

export type RoomStackParamList = {
  RoomCapture: undefined;
  StyleQuiz: undefined;
  Viewer3D: undefined;
  RenderView: undefined;
};

const Stack = createNativeStackNavigator<RoomStackParamList>();

export default function RoomNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="RoomCapture" component={RoomCaptureScreen} />
      <Stack.Screen name="StyleQuiz" component={StyleQuizScreen} />
      <Stack.Screen name="Viewer3D" component={RoomViewer3DScreen} />
      <Stack.Screen name="RenderView" component={RenderViewScreen} />
    </Stack.Navigator>
  );
}

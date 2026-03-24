import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer, NavigationContainerRef, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { useAppStore } from '../store';
import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';

type RootParamList = Record<string, object | undefined>;

export default function RootNavigator() {
  const user = useAppStore((s) => s.user);
  const isLoading = useAppStore((s) => s.isLoading);
  const colorScheme = useAppStore((s) => s.colorScheme);
  const [initialRoute, setInitialRoute] = useState<'Home' | 'NewRoom' | null>(null);
  const [checkedRooms, setCheckedRooms] = useState(false);
  const navigationRef = React.useRef<NavigationContainerRef<RootParamList>>(null);

  useEffect(() => {
    if (!user) {
      setCheckedRooms(false);
      setInitialRoute(null);
      return;
    }

    let cancelled = false;
    useAppStore.getState().fetchRooms().then(() => {
      if (cancelled) return;
      const currentRooms = useAppStore.getState().rooms;
      setInitialRoute(currentRooms.length === 0 ? 'NewRoom' : 'Home');
      setCheckedRooms(true);
    }).catch(() => {
      if (cancelled) return;
      // If fetch fails, default to Home and let HomeScreen handle the empty state
      setInitialRoute('Home');
      setCheckedRooms(true);
    });

    return () => { cancelled = true; };
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color="#C4A45A" />
      </View>
    );
  }

  if (user && !checkedRooms) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color="#C4A45A" />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef} theme={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      {user ? <MainNavigator initialRoute={initialRoute ?? 'Home'} /> : <AuthNavigator />}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: '#0A1628',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

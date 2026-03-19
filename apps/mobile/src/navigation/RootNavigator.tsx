import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { NavigationContainer, NavigationContainerRef, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { useAppStore } from '../store';
import { supabase } from '../lib/supabase';
import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';

export default function RootNavigator() {
  const user = useAppStore((s) => s.user);
  const isLoading = useAppStore((s) => s.isLoading);
  const colorScheme = useAppStore((s) => s.colorScheme);
  const [initialRoute, setInitialRoute] = useState<'Home' | 'NewRoom' | null>(null);
  const [checkedRooms, setCheckedRooms] = useState(false);
  const navigationRef = React.useRef<NavigationContainerRef<any>>(null);

  useEffect(() => {
    if (!user) {
      setCheckedRooms(false);
      setInitialRoute(null);
      return;
    }

    let cancelled = false;
    (async () => {
      const { data: rooms } = await supabase
        .from('rooms')
        .select('id')
        .eq('user_id', user.id)
        .limit(1);

      if (cancelled) return;

      if (!rooms || rooms.length === 0) {
        setInitialRoute('NewRoom');
      } else {
        setInitialRoute('Home');
      }
      setCheckedRooms(true);
    })();

    return () => { cancelled = true; };
  }, [user]);

  if (isLoading) {
    return <View style={styles.splash} />;
  }

  if (user && !checkedRooms) {
    return <View style={styles.splash} />;
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
    backgroundColor: '#1B3A2D',
  },
});

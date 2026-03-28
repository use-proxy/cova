import 'react-native-url-polyfill/auto';
import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as TrackingTransparency from 'expo-tracking-transparency';
import { initSentry, Sentry } from './src/lib/sentry';
import { initPostHog, track, identify } from './src/lib/posthog';
import { ErrorBoundary } from './src/components/ui/ErrorBoundary';
import { NetworkBanner } from './src/components/ui/NetworkBanner';
import RootNavigator from './src/navigation/RootNavigator';
import { useAppStore } from './src/store';
import { supabase } from './src/lib/supabase';

initSentry();
void initPostHog();

function App() {
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      useAppStore.getState().setSession(session);
      if (session?.user) {
        useAppStore.getState().setUser(session.user as any);
        identify(session.user.id, { email: session.user.email });
        const rooms = useAppStore.getState().rooms;
        track('app_opened', { returning_user: true, rooms_count: rooms.length });
      } else {
        track('app_opened', { returning_user: false, rooms_count: 0 });
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      useAppStore.getState().setSession(session);
      if (session?.user) useAppStore.getState().setUser(session.user as any);
      else useAppStore.getState().setUser(null);
    });

    if (Platform.OS === 'ios') {
      (async () => {
        try {
          const { status } = await TrackingTransparency.getTrackingPermissionsAsync();
          if (status === 'undetermined') {
            await TrackingTransparency.requestTrackingPermissionsAsync();
          }
        } catch {
          // ATT not available on this device/OS version
        }
      })();
    }

    const rejectionHandler = (event: PromiseRejectionEvent) => {
      Sentry.captureException(event.reason);
    };
    // @ts-ignore — globalThis.addEventListener available in Hermes/JSC
    globalThis.addEventListener?.('unhandledrejection', rejectionHandler);

    return () => {
      subscription.unsubscribe();
      // @ts-ignore
      globalThis.removeEventListener?.('unhandledrejection', rejectionHandler);
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <StatusBar style="light" />
          <NetworkBanner />
          <RootNavigator />
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(App);

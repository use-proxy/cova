import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import HomeStack from './HomeStack';
import ProfileScreen from '../screens/main/ProfileScreen';

export type MainTabParamList = {
  HomeTab: undefined;
  InspirationTab: undefined;
  ProfileTab: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

function InspirationComingSoon() {
  return (
    <View style={csStyles.screen}>
      <Text style={csStyles.title}>Inspiration</Text>
      <Text style={csStyles.sub}>Coming Soon</Text>
    </View>
  );
}

const csStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0A1628', alignItems: 'center', justifyContent: 'center' },
  title: { color: '#B8860B', fontSize: 22, fontWeight: '600' },
  sub: { color: 'rgba(255,255,255,0.5)', fontSize: 16, marginTop: 8 },
});

export default function MainNavigator({ initialRoute = 'Home' }: { initialRoute?: string }) {
  const HomeStackWithRoute = React.useMemo(
    () => () => <HomeStack initialRouteName={initialRoute as 'Home' | 'NewRoom'} />,
    [initialRoute],
  );

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: '#B8860B',
        tabBarInactiveTintColor: 'rgba(255,255,255,0.4)',
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeStackWithRoute}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color }) => <Text style={[styles.tabIcon, { color }]}>⌂</Text>,
        }}
      />
      <Tab.Screen
        name="InspirationTab"
        component={InspirationComingSoon}
        options={{
          tabBarLabel: 'Inspiration',
          tabBarIcon: ({ color }) => <Text style={[styles.tabIcon, { color }]}>✦</Text>,
        }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileScreen}
        options={{
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color }) => <Text style={[styles.tabIcon, { color }]}>☺</Text>,
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#0A1628',
    height: 60,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  tabIcon: {
    fontSize: 18,
  },
});

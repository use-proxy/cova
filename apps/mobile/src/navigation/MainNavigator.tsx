import React from 'react';
import { Alert, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import HomeStack from './HomeStack';
import ShopScreen from '../screens/main/ShopScreen';
import ProfileScreen from '../screens/main/ProfileScreen';

export type MainTabParamList = {
  RoomsTab: undefined;
  ShopTab: undefined;
  ProfileTab: undefined;
  DiscoverTab: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

function DiscoverPlaceholder() {
  return null;
}

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
        tabBarActiveTintColor: '#C47B3C',
        tabBarInactiveTintColor: 'rgba(255,255,255,0.5)',
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tab.Screen
        name="RoomsTab"
        component={HomeStackWithRoute}
        options={{
          tabBarLabel: 'Rooms',
          tabBarIcon: ({ color }) => <Text style={[styles.tabIcon, { color }]}>⌂</Text>,
        }}
      />
      <Tab.Screen
        name="ShopTab"
        component={ShopScreen}
        options={{
          tabBarLabel: 'Shop',
          tabBarIcon: ({ color }) => <Text style={[styles.tabIcon, { color }]}>$</Text>,
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
      <Tab.Screen
        name="DiscoverTab"
        component={DiscoverPlaceholder}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            Alert.alert('Coming Soon', 'Discover is coming soon. You\'ll be able to browse and get inspired by rooms from other Cova users.');
          },
        }}
        options={{
          tabBarLabel: 'Discover',
          tabBarIcon: ({ color }) => <Text style={[styles.tabIcon, { color }]}>✦</Text>,
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#1B3A2D',
    height: 60,
    paddingBottom: 8,
    borderTopWidth: 0,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  tabIcon: {
    fontSize: 18,
  },
});

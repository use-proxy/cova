import React, { useEffect, useRef } from 'react';
import {
  Animated,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Easing,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppStore } from '../../store';
import type { AuthStackParamList } from '../../navigation/AuthNavigator';

const BG = '#0A1628';
const GOLD = '#C4A45A';

type Nav = NativeStackNavigationProp<AuthStackParamList>;

export default function SplashScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const user = useAppStore((s) => s.user);

  const logoOpacity = useRef(new Animated.Value(0)).current;
  const btnTranslateY = useRef(new Animated.Value(80)).current;
  const btnOpacity = useRef(new Animated.Value(0)).current;

  const bottomPad = Math.max(insets.bottom + 20, 60);

  useEffect(() => {
    if (user) {
      return; // RootNavigator renders MainNavigator when user is set — no action needed here
    }

    Animated.timing(logoOpacity, {
      toValue: 1,
      duration: 2000,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start(() => {
      Animated.parallel([
        Animated.spring(btnTranslateY, {
          toValue: 0,
          useNativeDriver: true,
          damping: 14,
          stiffness: 90,
        }),
        Animated.spring(btnOpacity, {
          toValue: 1,
          useNativeDriver: true,
          damping: 14,
          stiffness: 90,
        }),
      ]).start();
    });
  }, [user, navigation, logoOpacity, btnTranslateY, btnOpacity]);

  return (
    <View testID="splash-screen" style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={BG} />

      {/* ── Logo group ── */}
      <Animated.View style={[styles.logoWrap, { opacity: logoOpacity }]}>
        <View style={styles.logoRow}>
          {/* Double-arch SVG mark */}
          <View style={styles.archWrap}>
            <Svg width={90} height={120} viewBox="0 0 90 120" fill="none" style={styles.archOuter}>
              <Path
                d="M3 120 V45 Q3 3 45 3 Q87 3 87 45 V120"
                stroke={GOLD}
                strokeWidth={3}
                fill="none"
                strokeLinecap="round"
              />
            </Svg>
            <Svg width={70} height={95} viewBox="0 0 70 95" fill="none" style={styles.archInner}>
              <Path
                d="M2 95 V35 Q2 2 35 2 Q68 2 68 35 V95"
                stroke={GOLD}
                strokeWidth={2}
                fill="none"
                strokeLinecap="round"
              />
            </Svg>
          </View>

          {/* Wordmark + tagline */}
          <View style={styles.textCol}>
            <Text style={styles.wordmark}>cova</Text>
            <View style={styles.goldRule} />
            <Text style={styles.tagline}>tinder for your home</Text>
          </View>
        </View>
      </Animated.View>

      {/* ── CTA buttons ── */}
      <Animated.View
        style={[
          styles.buttonsWrap,
          {
            bottom: bottomPad,
            opacity: btnOpacity,
            transform: [{ translateY: btnTranslateY }],
          },
        ]}
      >
        <TouchableOpacity
          style={styles.createBtn}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('Auth', { mode: 'signup' })}
        >
          <Text style={styles.createBtnText}>Create Account</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.signInBtn}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('Auth', { mode: 'signin' })}
        >
          <Text style={styles.signInBtnText}>Sign In</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },
  logoWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  archWrap: {
    width: 90,
    height: 120,
    marginRight: 24,
  },
  archOuter: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  archInner: {
    position: 'absolute',
    left: 10,
    top: 25,
  },
  textCol: {
    flexDirection: 'column',
  },
  wordmark: {
    fontSize: 52,
    fontWeight: '400',
    color: '#FFFFFF',
    letterSpacing: 4,
    lineHeight: 52,
  },
  goldRule: {
    width: '100%',
    height: 1,
    backgroundColor: GOLD,
    marginTop: 8,
  },
  tagline: {
    fontStyle: 'italic',
    color: GOLD,
    fontSize: 14,
    letterSpacing: 3,
    marginTop: 8,
  },
  buttonsWrap: {
    position: 'absolute',
    left: 32,
    right: 32,
  },
  createBtn: {
    backgroundColor: GOLD,
    borderRadius: 28,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  createBtnText: {
    color: BG,
    fontWeight: '600',
    fontSize: 16,
  },
  signInBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 28,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signInBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
});

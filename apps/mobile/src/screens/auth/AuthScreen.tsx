import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  Linking,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import * as Crypto from 'expo-crypto';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store';
import type { User } from '@cova/shared';
import type { AuthStackParamList } from '../../navigation/AuthNavigator';

WebBrowser.maybeCompleteAuthSession();

const BG = '#0A1628';
const GOLD = '#C4A45A';

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '';
const isGoogleConfigured =
  GOOGLE_CLIENT_ID !== '' && GOOGLE_CLIENT_ID !== 'YOUR_GOOGLE_CLIENT_ID_HERE';

type Props = NativeStackScreenProps<AuthStackParamList, 'Auth'>;
type AuthMode = 'signin' | 'signup';
type LoadingTarget = 'apple' | 'google' | 'email' | null;

export default function AuthScreen({ route }: Props) {
  const initialMode = route.params?.mode === 'signup' ? 'signup' : 'signin';
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState<LoadingTarget>(null);
  const [error, setError] = useState<string | null>(null);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [_googleRequest, googleResponse, googlePromptAsync] =
    Google.useIdTokenAuthRequest({ clientId: GOOGLE_CLIENT_ID });

  useEffect(() => {
    if (googleResponse?.type === 'success') {
      const idToken = googleResponse.params.id_token;
      if (idToken) handleGoogleToken(idToken);
    }
  }, [googleResponse]); // eslint-disable-line react-hooks/exhaustive-deps

  const showError = (msg: string) => {
    setError(msg);
    if (errorTimer.current) clearTimeout(errorTimer.current);
    errorTimer.current = setTimeout(() => setError(null), 4000);
  };

  const anyLoading = loading !== null;

  // ── Apple ──
  const handleAppleSignIn = async () => {
    try {
      setLoading('apple');
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      const { error: err } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken!,
      });
      if (err) throw err;
    } catch (e: unknown) {
      if ((e as { code?: string }).code !== 'ERR_REQUEST_CANCELED') {
        Alert.alert('Sign In Failed', (e as Error).message ?? 'Apple Sign In failed.');
      }
    } finally {
      setLoading(null);
    }
  };

  // ── Google ──
  const handleGoogleToken = async (idToken: string) => {
    try {
      setLoading('google');
      const { data, error: err } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
      });
      if (err) throw err;
      if (data.user) {
        useAppStore.getState().setUser(data.user as unknown as User);
        useAppStore.getState().setSession(data.session);
      }
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Google sign in failed');
    } finally {
      setLoading(null);
    }
  };

  const handleGoogleSignIn = async () => {
    if (!isGoogleConfigured) {
      Alert.alert(
        'Google Sign In',
        'Google Sign In requires configuration. Please use email sign in for now.',
      );
      return;
    }
    try {
      setLoading('google');
      await googlePromptAsync();
    } catch (e: unknown) {
      if ((e as { code?: string }).code !== 'ERR_REQUEST_CANCELED') {
        showError(e instanceof Error ? e.message : 'Google sign in failed');
      }
      setLoading(null);
    }
  };

  // ── Email ──
  const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

  const handleEmailSubmit = async () => {
    if (mode === 'signup' && !fullName.trim()) {
      return showError('Please enter your full name');
    }
    if (!email.trim()) return showError('Please enter your email address');
    if (!isValidEmail(email)) return showError('Please enter a valid email address');
    if (password.length < 8) return showError('Password must be at least 8 characters');

    setLoading('email');
    try {
      if (mode === 'signin') {
        const { data, error: err } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (err) throw err;
        useAppStore.getState().setUser(data.user as unknown as User);
        useAppStore.getState().setSession(data.session);
      } else {
        const { error: err } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName.trim() } },
        });
        if (err) throw err;
        useAppStore.getState().setUser({ email, full_name: fullName.trim() } as unknown as User);
      }
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Authentication failed');
    } finally {
      setLoading(null);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={BG} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          {/* ── Logo ── */}
          <View style={styles.logoRow}>
            <View style={styles.archWrap}>
              <Svg width={60} height={80} viewBox="0 0 60 80" fill="none" style={styles.archOuter}>
                <Path
                  d="M2 80 V30 Q2 2 30 2 Q58 2 58 30 V80"
                  stroke={GOLD}
                  strokeWidth={2.5}
                  fill="none"
                  strokeLinecap="round"
                />
              </Svg>
              <Svg width={44} height={60} viewBox="0 0 44 60" fill="none" style={styles.archInner}>
                <Path
                  d="M2 60 V22 Q2 2 22 2 Q42 2 42 22 V60"
                  stroke={GOLD}
                  strokeWidth={2}
                  fill="none"
                  strokeLinecap="round"
                />
              </Svg>
            </View>

            <View style={styles.textCol}>
              <Text style={styles.wordmark}>cova</Text>
              <View style={styles.goldRule} />
              <Text style={styles.tagline}>tinder for your home</Text>
            </View>
          </View>

          {/* ── Mode toggle ── */}
          <View style={styles.modeRow}>
            <TouchableOpacity onPress={() => setMode('signin')} disabled={anyLoading}>
              <Text style={[styles.modeText, mode === 'signin' && styles.modeActive]}>
                Sign In
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setMode('signup')} disabled={anyLoading}>
              <Text style={[styles.modeText, mode === 'signup' && styles.modeActive]}>
                Create Account
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── Social buttons ── */}
          <View style={styles.socialSection}>
            {/* Apple */}
            <TouchableOpacity
              style={styles.appleBtn}
              activeOpacity={0.7}
              onPress={handleAppleSignIn}
              disabled={anyLoading}
            >
              {loading === 'apple' ? (
                <ActivityIndicator color="#000" />
              ) : (
                <>
                  <Svg width={20} height={24} viewBox="0 0 17 20" fill="black">
                    <Path
                      d="M8.5 1.8C9.3.7 10.6 0 12 0c.1 1.3-.4 2.6-1.2 3.5-.8 1-2 1.6-3.2 1.5-.2-1.3.4-2.5 1-3.2zM15.2 10.5c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.3-.9C4.3 4.7 2.2 6.7 2.2 10.7c0 2.4.9 4.9 2.1 6.5.9 1.4 2 2.9 3.4 2.8 1.4-.1 1.9-.9 3.5-.9 1.6 0 2.1.9 3.5.8 1.5-.1 2.4-1.4 3.3-2.7.7-1 1.2-2 1.5-2.6-1.5-.6-2.8-2.3-2.8-4.4z"
                      fill="black"
                    />
                  </Svg>
                  <Text style={styles.appleBtnText}>Continue with Apple</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Google */}
            <TouchableOpacity
              style={[styles.googleBtn, !isGoogleConfigured && { opacity: 0.4 }]}
              activeOpacity={0.7}
              onPress={handleGoogleSignIn}
              disabled={anyLoading}
            >
              {loading === 'google' ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Svg width={20} height={20} viewBox="0 0 24 24">
                    <Path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.79-.07-1.54-.19-2.27h-11.3v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
                    />
                    <Path
                      fill="#34A853"
                      d="M12.255 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96h-3.98v3.09C3.515 21.3 7.565 24 12.255 24z"
                    />
                    <Path
                      fill="#FBBC05"
                      d="M5.525 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62h-3.98a11.86 11.86 0 000 10.76l3.98-3.09z"
                    />
                    <Path
                      fill="#EA4335"
                      d="M12.255 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C18.205 1.19 15.495 0 12.255 0c-4.69 0-8.74 2.7-10.71 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
                    />
                  </Svg>
                  <Text style={styles.googleBtnText}>Continue with Google</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* ── Divider ── */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>— or —</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* ── Form ── */}
          <View style={styles.formSection}>
            {mode === 'signup' && (
              <TextInput
                style={styles.input}
                placeholder="Full name"
                placeholderTextColor="rgba(255,255,255,0.4)"
                value={fullName}
                onChangeText={setFullName}
                autoCapitalize="words"
                editable={!anyLoading}
              />
            )}

            <TextInput
              style={styles.input}
              placeholder="Email address"
              placeholderTextColor="rgba(255,255,255,0.4)"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!anyLoading}
            />

            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="rgba(255,255,255,0.4)"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!anyLoading}
            />

            <TouchableOpacity
              style={styles.submitBtn}
              activeOpacity={0.85}
              onPress={handleEmailSubmit}
              disabled={anyLoading}
            >
              {loading === 'email' ? (
                <ActivityIndicator color={BG} />
              ) : (
                <Text style={styles.submitBtnText}>
                  {mode === 'signin' ? 'Sign In' : 'Create Account'}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {/* ── Error ── */}
          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* ── Spacer ── */}
          <View style={styles.spacer} />

          {/* ── Legal ── */}
          <View style={styles.legalRow}>
            <TouchableOpacity onPress={() => Linking.openURL('https://cova.ai/privacy')}>
              <Text style={styles.legalLink}>Privacy Policy</Text>
            </TouchableOpacity>
            <Text style={styles.legalDot}>•</Text>
            <TouchableOpacity onPress={() => Linking.openURL('https://cova.ai/terms')}>
              <Text style={styles.legalLink}>Terms of Service</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },
  flex: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 60,
    paddingBottom: 32,
  },

  // ── Logo ──
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 32,
  },
  archWrap: {
    width: 60,
    height: 80,
    marginRight: 16,
  },
  archOuter: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  archInner: {
    position: 'absolute',
    left: 8,
    top: 20,
  },
  textCol: {
    flexDirection: 'column',
  },
  wordmark: {
    fontSize: 32,
    fontWeight: '400',
    color: '#FFFFFF',
    letterSpacing: 4,
    lineHeight: 32,
  },
  goldRule: {
    width: '100%',
    height: 1,
    backgroundColor: GOLD,
    marginTop: 6,
  },
  tagline: {
    fontStyle: 'italic',
    color: GOLD,
    fontSize: 12,
    letterSpacing: 2,
    marginTop: 6,
  },

  // ── Mode toggle ──
  modeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
    marginBottom: 40,
  },
  modeText: {
    fontSize: 16,
    letterSpacing: 1,
    color: 'rgba(255,255,255,0.4)',
  },
  modeActive: {
    color: GOLD,
  },

  // ── Social ──
  socialSection: {
    width: '100%',
  },
  appleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    height: 56,
    gap: 12,
    marginBottom: 12,
  },
  appleBtnText: {
    color: '#000000',
    fontSize: 17,
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: 28,
    height: 56,
    gap: 12,
    marginBottom: 0,
  },
  googleBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
  },

  // ── Divider ──
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  dividerText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 14,
    marginHorizontal: 12,
  },

  // ── Form ──
  formSection: {
    width: '100%',
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    height: 52,
    paddingHorizontal: 16,
    color: '#FFFFFF',
    fontSize: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    marginBottom: 12,
  },
  submitBtn: {
    backgroundColor: GOLD,
    borderRadius: 28,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  submitBtnText: {
    color: BG,
    fontWeight: '600',
    fontSize: 17,
  },

  // ── Error ──
  errorBox: {
    width: '100%',
    marginTop: 16,
    backgroundColor: 'rgba(255,0,0,0.15)',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 14,
    textAlign: 'center',
  },

  // ── Spacer + legal ──
  spacer: {
    flex: 1,
    minHeight: 32,
  },
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 32,
  },
  legalLink: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
  },
  legalDot: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    marginHorizontal: 16,
  },
});

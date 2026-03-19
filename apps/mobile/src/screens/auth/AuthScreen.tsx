import React, { useState, useRef, useEffect } from 'react';
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
  Animated,
  Easing,
} from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import * as Crypto from 'expo-crypto';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store';
import { SafeAreaView } from 'react-native-safe-area-context';

WebBrowser.maybeCompleteAuthSession();

type AuthMode = 'signin' | 'signup';
type Phase = 'splash' | 'auth';

export default function AuthScreen() {
  const [phase, setPhase] = useState<Phase>('splash');
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const logoOpacity = useRef(new Animated.Value(0)).current;
  const buttonsOpacity = useRef(new Animated.Value(0)).current;

  const [_googleRequest, googleResponse, googlePromptAsync] = Google.useIdTokenAuthRequest({
    clientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '',
  });

  useEffect(() => {
    if (googleResponse?.type === 'success') {
      const idToken = googleResponse.params.id_token;
      if (idToken) {
        handleGoogleToken(idToken);
      }
    }
  }, [googleResponse]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    Animated.sequence([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 2000,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.delay(300),
      Animated.timing(buttonsOpacity, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setPhase('auth');
    });
  }, [logoOpacity, buttonsOpacity]);

  const handleAppleSignIn = async () => {
    try {
      setAuthLoading(true);
      const rawBytes = new Uint8Array(32);
      crypto.getRandomValues(rawBytes);
      const rawNonce = Array.from(rawBytes, (b) => b.toString(16).padStart(2, '0')).join('');
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce,
      );
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken!,
        nonce: rawNonce,
      });
      if (error) throw error;
      if (data.user) {
        useAppStore.getState().setUser(data.user as any);
        useAppStore.getState().setSession(data.session);
      }
    } catch (e: any) {
      if (e.code !== 'ERR_REQUEST_CANCELED') {
        Alert.alert('Sign In Failed', e.message);
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleToken = async (idToken: string) => {
    try {
      setAuthLoading(true);
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
      });
      if (error) throw error;
      if (data.user) {
        useAppStore.getState().setUser(data.user as any);
        useAppStore.getState().setSession(data.session);
      }
    } catch (e: any) {
      Alert.alert('Sign In Failed', e.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      await googlePromptAsync();
    } catch (e: any) {
      Alert.alert('Sign In Failed', e.message);
    }
  };

  const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  const handleEmailSignIn = async () => {
    if (!email || !password) return Alert.alert('Missing fields', 'Please enter email and password.');
    if (!isValidEmail(email)) return Alert.alert('Invalid email', 'Please enter a valid email address.');
    if (password.length < 8) return Alert.alert('Password too short', 'Password must be at least 8 characters.');
    setAuthLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setAuthLoading(false);
    if (error) return Alert.alert('Sign In Failed', error.message);
    useAppStore.getState().setUser(data.user as any);
    useAppStore.getState().setSession(data.session);
  };

  const handleEmailSignUp = async () => {
    if (!email || !password || !fullName) return Alert.alert('Missing fields', 'Please fill all fields.');
    if (!isValidEmail(email)) return Alert.alert('Invalid email', 'Please enter a valid email address.');
    if (password.length < 8) return Alert.alert('Password too short', 'Password must be at least 8 characters.');
    setAuthLoading(true);
    const { data: _data, error } = await supabase.auth.signUp({
      email, password, options: { data: { full_name: fullName } },
    });
    setAuthLoading(false);
    if (error) return Alert.alert('Sign Up Failed', error.message);
    Alert.alert('Check your email', 'We sent you a confirmation link.');
  };

  const handleEmailSubmit = () => {
    if (mode === 'signin') handleEmailSignIn();
    else handleEmailSignUp();
  };

  if (phase === 'splash') {
    return (
      <View style={styles.container}>
        <Animated.View style={[styles.splashCenter, { opacity: logoOpacity }]}>
          <View style={styles.logoMark} />
          <Text style={styles.logoWordmark}>cova</Text>
          <Text style={styles.logoTagline}>tinder for your home</Text>
        </Animated.View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {/* Logo */}
          <View style={styles.logoSection}>
            <View style={styles.logoMark} />
            <Text style={styles.logoWordmark}>cova</Text>
            <Text style={styles.logoTagline}>tinder for your home</Text>
          </View>

          {/* Auth buttons */}
          <Animated.View style={[styles.authSection, { opacity: buttonsOpacity }]}>
            <TouchableOpacity style={styles.socialButton} onPress={handleAppleSignIn} disabled={authLoading}>
              {authLoading ? (
                <ActivityIndicator color="#1A1A1A" />
              ) : (
                <>
                  <Text style={styles.appleIcon}>🍎</Text>
                  <Text style={styles.socialButtonText}>Continue with Apple</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.socialButton} onPress={handleGoogleSignIn} disabled={authLoading}>
              <Text style={styles.googleIcon}>G</Text>
              <Text style={styles.socialButtonText}>Continue with Google</Text>
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or continue with email</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Email form */}
            {mode === 'signup' && (
              <TextInput
                style={styles.input}
                placeholder="Full Name"
                placeholderTextColor="rgba(255,255,255,0.5)"
                value={fullName}
                onChangeText={setFullName}
                autoCapitalize="words"
              />
            )}
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="rgba(255,255,255,0.5)"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="rgba(255,255,255,0.5)"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />

            <TouchableOpacity style={styles.emailButton} onPress={handleEmailSubmit} disabled={authLoading}>
              {authLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.emailButtonText}>
                  {mode === 'signin' ? 'Sign In' : 'Create Account'}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
              <Text style={styles.toggleText}>
                {mode === 'signin' ? 'New here? Create account' : 'Already have an account? Sign in'}
              </Text>
            </TouchableOpacity>
          </Animated.View>

          {/* Terms */}
          <View style={styles.termsSection}>
            <Text style={styles.termsText}>
              By continuing you agree to our Terms & Privacy Policy
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1B3A2D',
  },
  flex: {
    flex: 1,
  },
  splashCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoMark: {
    width: 64,
    height: 32,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    backgroundColor: '#C47B3C',
    marginBottom: 12,
  },
  logoWordmark: {
    fontSize: 32,
    fontWeight: '300',
    color: '#C47B3C',
    letterSpacing: 8,
  },
  logoTagline: {
    fontSize: 12,
    color: '#C47B3C',
    fontStyle: 'italic',
    letterSpacing: 2,
    marginTop: 4,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  logoSection: {
    flex: 0.35,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 24,
    marginBottom: 40,
  },
  authSection: {
    gap: 12,
  },
  socialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    height: 56,
    borderRadius: 28,
    gap: 10,
  },
  appleIcon: {
    fontSize: 20,
  },
  googleIcon: {
    fontSize: 20,
    fontWeight: '800',
    color: '#4285F4',
  },
  socialButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  dividerText: {
    color: '#888888',
    fontSize: 13,
    marginHorizontal: 12,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    height: 52,
    paddingHorizontal: 16,
    color: '#FFFFFF',
    fontSize: 16,
  },
  emailButton: {
    backgroundColor: '#C47B3C',
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  emailButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  toggleText: {
    color: '#C47B3C',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 4,
  },
  termsSection: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  termsText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    textAlign: 'center',
  },
});

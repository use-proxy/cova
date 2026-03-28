import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import * as Sentry from '@sentry/react-native';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    Sentry.captureException(error, { extra: { componentStack: info.componentStack } });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </Text>
          <TouchableOpacity style={styles.retryBtn} onPress={this.handleRetry}>
            <Text style={styles.retryText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A1628',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 12,
  },
  message: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  retryBtn: {
    backgroundColor: '#B8860B',
    borderRadius: 28,
    paddingHorizontal: 32,
    paddingVertical: 14,
  },
  retryText: {
    color: '#0A1628',
    fontSize: 16,
    fontWeight: '700',
  },
});

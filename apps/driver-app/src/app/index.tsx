import { useEffect, useState } from 'react';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { config } from '../config';
import { PRODUCT_NAME } from '../product';

type BffStatus =
  { state: 'checking' } | { state: 'ok'; body: string } | { state: 'error'; message: string };

// A skeleton screen only — proves the app boots and can actually reach the driver
// BFF over the network, the same "run it for real" standard M1.3 set for core's own
// /health check. Real screens (sign in, profiles, plan route, ...) land in M5.2+.
export default function IndexScreen() {
  const [bff, setBff] = useState<BffStatus>({ state: 'checking' });

  useEffect(() => {
    let cancelled = false;
    fetch(`${config.bffUrl}/health`)
      .then((res) => res.text())
      .then((body) => {
        if (!cancelled) setBff({ state: 'ok', body });
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setBff({ state: 'error', message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>{PRODUCT_NAME}</Text>
        <Text style={styles.subtitle}>Driver app skeleton — M5.1</Text>
        <Text style={styles.label}>Driver BFF ({config.bffUrl})</Text>
        <Text style={styles.status} testID="bff-status">
          {bff.state === 'checking' && 'Checking…'}
          {bff.state === 'ok' && `Reachable: ${bff.body}`}
          {bff.state === 'error' && `Unreachable: ${bff.message}`}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B1220',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 12,
  },
  title: {
    fontSize: 40,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 18,
    color: '#9CA3AF',
  },
  label: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 24,
  },
  status: {
    fontSize: 18,
    color: '#FFFFFF',
    textAlign: 'center',
  },
});

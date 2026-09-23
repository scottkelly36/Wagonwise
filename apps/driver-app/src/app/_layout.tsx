import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { queryClient } from '../api/query-client';
import { useHazardQueueFlush } from '../hooks/use-hazard-queue-flush';
import { useOpportunisticRefresh } from '../hooks/use-opportunistic-refresh';
import { useAuthStore } from '../state/auth-store';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const restore = useAuthStore((s) => s.restore);

  useEffect(() => {
    void restore();
  }, [restore]);

  useOpportunisticRefresh();
  useHazardQueueFlush();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack screenOptions={{ headerShown: false }} />
        <StatusBar style="auto" />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { queryClient } from '../api/query-client';
import { useHazardQueueFlush } from '../hooks/use-hazard-queue-flush';
import { useCheckQueueFlush } from '../hooks/use-check-queue-flush';
import { useProofOfDeliveryQueueFlush } from '../hooks/use-proof-of-delivery-queue-flush';
import { useOpportunisticRefresh } from '../hooks/use-opportunistic-refresh';
import { useRegisterPushToken } from '../hooks/use-register-push-token';
import { useShareHours } from '../hooks/use-share-hours';
import { useRerouteNotifications } from '../hooks/use-reroute-notifications';
import { useAuthStore } from '../state/auth-store';
import { useGuidanceStore } from '../state/guidance-store';
import { useShiftStore } from '../state/shift-store';
import { useThemeStore } from '../state/theme-store';

export default function RootLayout() {
  const mode = useThemeStore((s) => s.mode);
  const restoreAuth = useAuthStore((s) => s.restore);
  const restoreTheme = useThemeStore((s) => s.restore);
  const restoreGuidance = useGuidanceStore((s) => s.restore);
  const restoreShift = useShiftStore((s) => s.restore);

  useEffect(() => {
    void restoreAuth();
    void restoreTheme();
    void restoreGuidance();
    void restoreShift();
  }, [restoreAuth, restoreTheme, restoreGuidance, restoreShift]);

  useOpportunisticRefresh();
  useHazardQueueFlush();
  useProofOfDeliveryQueueFlush();
  useCheckQueueFlush();
  useShareHours();
  useRegisterPushToken();
  useRerouteNotifications();

  return (
    <QueryClientProvider client={queryClient}>
      {/* The driver's own choice (`state/theme-store.ts`), not the OS's `useColorScheme()` —
          a trucker's phone might already be locked to one OS-level mode for other reasons
          (docs/progress.md's field-testing backlog, 2026-09-25). */}
      <ThemeProvider value={mode === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack screenOptions={{ headerShown: false }} />
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

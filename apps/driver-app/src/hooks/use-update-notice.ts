import { useQuery } from '@tanstack/react-query';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { getAppVersionInfo } from '../api/app-version';
import { buildStatus, chooseNotice, type UpdateNotice } from '../lib/app-version';
import { useUpdateNoticeStore } from '../state/update-notice-store';

const CHECK_EVERY_MS = 10 * 60 * 1000;

/** The version baked into this build. An over-the-air update does not change it. */
const thisBuild = (): string | undefined =>
  Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? undefined;

/**
 * What to tell the driver about updates, if anything: a downloaded over-the-air update that needs a restart (one tap, no store),
 * a newer build in the store, or a build too old to go on with. It looks when the app opens and each time it comes back to the
 * front (at most every ten minutes), and downloads an over-the-air update in the background as soon as one is found, so it is
 * waiting rather than needing the app closed and opened twice.
 */
export function useUpdateNotice(): UpdateNotice {
  const { isUpdatePending } = Updates.useUpdates();
  const dismissedVersion = useUpdateNoticeStore((s) => s.dismissedVersion);
  const info = useQuery({
    queryKey: ['app-version'],
    queryFn: getAppVersionInfo,
    staleTime: CHECK_EVERY_MS,
    retry: false,
  });
  const refetch = info.refetch;
  const lastCheck = useRef(0);

  useEffect(() => {
    function check(): void {
      const now = Date.now();
      if (now - lastCheck.current < CHECK_EVERY_MS) return;
      lastCheck.current = now;
      void refetch();
      if (!Updates.isEnabled) return;
      Updates.checkForUpdateAsync()
        .then((result) => (result.isAvailable ? Updates.fetchUpdateAsync() : undefined))
        .catch(() => undefined);
    }
    check();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') check();
    });
    return () => subscription.remove();
  }, [refetch]);

  return chooseNotice({
    build: buildStatus(thisBuild(), info.data ?? {}),
    otaReady: isUpdatePending,
    latestVersion: info.data?.latestVersion,
    updateUrl: info.data?.updateUrl,
    dismissedVersion,
  });
}

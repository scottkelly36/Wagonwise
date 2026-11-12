import { useQuery } from '@tanstack/react-query';
import type { AnnouncementDto } from '@wagonwise/contracts/announcements';
import * as Updates from 'expo-updates';

import { getLatestAnnouncement } from '../api/announcements';
import { shouldShowWhatsNew } from '../lib/whats-new';
import { useAuthStore } from '../state/auth-store';
import { useWhatsNewStore } from '../state/whats-new-store';

const STALE_MS = 10 * 60 * 1000;

/**
 * The note to show on the home screen, if any: the newest one from WagonWise that this driver has not said "Got it" to. Asked when the driver is signed in,
 * at most every ten minutes. A failed ask shows nothing: it is news, not something to interrupt anyone for.
 */
export function useWhatsNew(): {
  readonly announcement: AnnouncementDto | undefined;
  dismiss(): void;
} {
  const state = useAuthStore((s) => s.state);
  const accessToken =
    state.status === 'signedIn' && state.accessToken !== '' ? state.accessToken : undefined;
  const { seenId, restored, markSeen } = useWhatsNewStore();
  const { isUpdatePending } = Updates.useUpdates();
  const latest = useQuery({
    queryKey: ['whats-new'],
    queryFn: () => getLatestAnnouncement(accessToken ?? ''),
    enabled: accessToken !== undefined,
    staleTime: STALE_MS,
    retry: false,
  });

  const announcement = latest.data ?? undefined;
  const show =
    restored && shouldShowWhatsNew({ announcement, seenId, updateWaiting: isUpdatePending });
  return {
    announcement: show ? announcement : undefined,
    dismiss: () => {
      if (announcement !== undefined) void markSeen(announcement.id);
    },
  };
}

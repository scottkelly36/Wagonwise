import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';

import { CURRENT_JOB_KEY } from '../api/use-jobs';
import { queryClient } from '../api/query-client';
import { assignedJobIdFrom } from '../lib/job-notification';
import { newRoutePlanIdFrom } from '../lib/reroute-notification';
import { useAuthStore } from '../state/auth-store';

// Foreground notifications are suppressed by expo-notifications unless a handler says otherwise
// (its own documented default) — a driver mid-trip needs to see/hear a reroute alert immediately,
// not only when they later pull down the tray, so this always shows it. Module scope, not inside
// the hook below, since it's process-wide state, not something that needs re-registering per
// render (same reasoning as api/query-client.ts's module-scope QueryClient).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Design doc §6: "Opening the notification shows old vs new route; driver accepts or keeps the
 * original. Never switch silently." — this hook is what gets a driver from "a push arrived" to
 * that screen, for both ways a driver can encounter one: tapping it from the notification tray
 * (`addNotificationResponseReceivedListener`, the app was backgrounded or closed) and it arriving
 * while the app is already open (`addNotificationReceivedListener` — the handler above still
 * shows a banner, but a driver looking at the active-trip screen right now shouldn't have to
 * leave it and come back via the tray to act on it). Reads `useAuthStore.getState()` at event
 * time rather than depending on the current render's `state` — these listeners are registered
 * once and must stay live across a sign-in that happens after mount (e.g. app cold-launched into
 * the sign-in screen with a stale queued notification).
 */
export function useRerouteNotifications(): void {
  const router = useRouter();

  useEffect(() => {
    function handle(newRoutePlanId: string | undefined): void {
      if (newRoutePlanId === undefined) return;
      if (useAuthStore.getState().state.status !== 'signedIn') return;
      router.push({ pathname: '/reroute/[id]', params: { id: newRoutePlanId } });
    }

    // A job assigned to the driver: refresh their job straight away, so it is there when they open the app, and
    // take them to it when they tap the notification.
    function handleAssigned(data: unknown, opened: boolean): void {
      if (assignedJobIdFrom(data) === undefined) return;
      if (useAuthStore.getState().state.status !== 'signedIn') return;
      void queryClient.invalidateQueries({ queryKey: CURRENT_JOB_KEY });
      if (opened) router.push('/jobs');
    }

    const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
      handle(newRoutePlanIdFrom(notification.request.content.data));
      handleAssigned(notification.request.content.data, false);
    });
    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      handle(newRoutePlanIdFrom(response.notification.request.content.data));
      handleAssigned(response.notification.request.content.data, true);
    });

    return () => {
      receivedSub.remove();
      responseSub.remove();
    };
  }, [router]);
}

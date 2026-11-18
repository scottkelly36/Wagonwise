import * as Updates from 'expo-updates';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { postFlowEvents } from '../api/usage';
import { clearFlowEvents, listFlowEvents, removeFlowEvents } from '../db/flow-event-queue';
import { getAppVersion } from '../lib/app-info';
import { planFlowBatch } from '../lib/flow-batch';
import { updateDay } from '../lib/update-day';
import { FLOW_SESSION_ID } from '../lib/flow-events';
import { useAuthStore } from '../state/auth-store';
import { useFlowEventsStore } from '../state/flow-events-store';

const EVERY_MS = 60 * 1000;
const VERSION = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;

let sending = false;

/** One pass: throw away what is too old, send the oldest batch, and remove it once the server has it. A failure keeps the queue for
 *  next time and says nothing: this must never get in a driver's way. With sharing off, the queue is emptied instead. */
export async function sendFlowEvents(accessToken: string, now: Date = new Date()): Promise<void> {
  if (sending) return;
  sending = true;
  try {
    if (useFlowEventsStore.getState().status === 'off') {
      await clearFlowEvents();
      return;
    }
    const version = getAppVersion();
    if (!VERSION.test(version) || (Platform.OS !== 'ios' && Platform.OS !== 'android')) return;
    const { send, drop } = planFlowBatch(await listFlowEvents(200), now);
    if (drop.length > 0) await removeFlowEvents(drop);
    if (send.length === 0) return;
    await postFlowEvents(accessToken, {
      sessionId: FLOW_SESSION_ID,
      appVersion: version,
      platform: Platform.OS,
      // Which over-the-air release: the store version (above) stays the same across them.
      ...withUpdateDay(updateDay(Updates.createdAt, Updates.isEmbeddedLaunch)),
      events: send.map((e) => ({
        event: e.event as never,
        ...(e.choice === undefined ? {} : { choice: e.choice }),
        at: e.at,
      })),
    });
    await removeFlowEvents(send.map((e) => e.id));
  } finally {
    sending = false;
  }
}

/** Sends waiting events when the app opens, every minute while it is open, and as it goes to the background. */
export function useFlowEventsFlush(): void {
  const state = useAuthStore((s) => s.state);

  useEffect(() => {
    if (state.status !== 'signedIn') return;
    const { accessToken } = state;
    const send = () => void sendFlowEvents(accessToken).catch(() => undefined);

    send();
    const timer = setInterval(send, EVERY_MS);
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'background' || next === 'active') send();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [state]);
}

function withUpdateDay(day: string | undefined): { updateDate?: string } {
  return day === undefined ? {} : { updateDate: day };
}

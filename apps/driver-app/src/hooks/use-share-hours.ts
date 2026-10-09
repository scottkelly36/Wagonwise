import { useEffect, useRef } from 'react';

import * as hoursApi from '../api/hours';
import { statusToShare } from '../lib/hours-share';
import { useAuthStore } from '../state/auth-store';
import { sharingWith, useHoursSharingStore } from '../state/hours-sharing-store';
import { useShiftStore } from '../state/shift-store';

const SEND_EVERY_MS = 60_000;

const clockNow = (): number => Date.now();

/**
 * Sends the driver's driving-hours status to the company they chose to share it with, and only then: the driver agreed
 * (and the firm allows it), and the server still checks both and that they are on a job. Sent when the driver changes what
 * they are doing and once a minute, so the office sees a fresh figure; when the shift ends the status is removed. A
 * refused or failed send is simply dropped: nothing is queued and nothing is retried beyond the next minute.
 */
export function useShareHours(): void {
  const signedIn = useAuthStore((s) => s.state.status === 'signedIn');
  const refresh = useHoursSharingStore((s) => s.refresh);
  const reset = useHoursSharingStore((s) => s.reset);
  const sharing = useHoursSharingStore((s) => sharingWith(s.companies).length > 0);
  const log = useShiftStore((s) => s.log);
  const rules = useShiftStore((s) => s.rules);
  const extensionsLeft = useShiftStore((s) => s.extensionsLeft);
  const clearedRef = useRef(true);

  // Learn what the driver has chosen whenever they sign in; forget it when they sign out.
  useEffect(() => {
    if (signedIn) void refresh();
    else reset();
  }, [signedIn, refresh, reset]);

  useEffect(() => {
    if (!signedIn || !sharing) return;

    async function send(): Promise<void> {
      const state = useAuthStore.getState().state;
      if (state.status !== 'signedIn') return;
      const payload = statusToShare(log, { rules, extensionsLeft }, clockNow());
      try {
        if (payload === null) {
          if (!clearedRef.current) await hoursApi.clearHoursStatus(state.accessToken);
          clearedRef.current = true;
        } else {
          await hoursApi.reportHoursStatus(state.accessToken, payload);
          clearedRef.current = false;
        }
      } catch {
        // Not on a job, a switch was turned off, or no signal: nothing to do until the next minute.
      }
    }

    void send();
    const timer = setInterval(() => void send(), SEND_EVERY_MS);
    return () => clearInterval(timer);
  }, [signedIn, sharing, log, rules, extensionsLeft]);
}

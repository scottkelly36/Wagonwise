import * as Speech from 'expo-speech';
import { useEffect } from 'react';

import type { Utterance } from '../lib/turn-guidance';

/**
 * Speaks turn instructions (P2-M10), British English like the hazard warnings. `enabled` is false
 * while muted or while the voice hazard-report flow is listening/speaking: talking over that would
 * be worse than a missed turn announcement.
 *
 * A turn that is about to happen is always spoken (it cuts in on anything else); an early "in half a
 * mile" heads-up is dropped if something is already being said, since the next one will follow.
 */
export function useTurnAnnouncements(utterance: Utterance | undefined, enabled: boolean): void {
  useEffect(() => {
    if (!utterance || !enabled) return;
    let cancelled = false;
    void (async () => {
      if (!utterance.urgent && (await Speech.isSpeakingAsync())) return;
      if (cancelled) return;
      if (utterance.urgent) await Speech.stop();
      Speech.speak(utterance.text, { language: 'en-GB' });
    })();
    return () => {
      cancelled = true;
    };
  }, [utterance, enabled]);
}

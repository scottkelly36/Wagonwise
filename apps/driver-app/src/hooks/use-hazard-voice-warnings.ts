import type { HazardTypeDto } from '@wagonwise/contracts/hazards';
import * as Speech from 'expo-speech';
import { useEffect, useRef } from 'react';

import { HAZARD_TYPE_LABELS } from '../lib/hazard-labels';
import { hazardsAheadWithinRange, type HazardAheadInput } from '../lib/hazard-voice-warnings';
import type { RoutePoint } from '../lib/route-progress';

// Enough warning to react at a rural-road speed without being so far out that it reads as
// unrelated to anything visible yet (field-testing backlog, 2026-09-25: voice _output_
// complementing M7's voice input) — distinct from `active-trip.tsx`'s own
// `ON_ROUTE_HAZARD_RADIUS_M`, which is a lateral "is this near the route at all" corridor width,
// not a distance-ahead.
const HAZARD_WARNING_AHEAD_METRES = 500;

export interface VoiceWarningHazard extends HazardAheadInput {
  readonly type: HazardTypeDto;
}

/**
 * Speaks a hazard once as it comes within `HAZARD_WARNING_AHEAD_METRES` ahead along the route —
 * the narrower "warn about a hazard ahead" half of the backlog's text-to-speech idea, not full
 * turn-by-turn directions (deferred, phase 3 per the user: that needs live maneuver detection off
 * the route geometry, which is a sat-nav's job, not this app's). Never repeats a hazard once
 * spoken for the life of this hook instance — `active-trip.tsx` only mounts this for the
 * duration of one trip, so a fresh trip gets a fresh set.
 *
 * `enabled` lets the caller mute this while the voice hazard-report flow is itself
 * listening/speaking — talking over that would be worse than a missed warning.
 */
export function useHazardVoiceWarnings(
  routeLine: readonly (readonly [number, number])[] | undefined,
  position: RoutePoint | undefined,
  hazards: readonly VoiceWarningHazard[] | undefined,
  enabled: boolean,
): void {
  const announcedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled || !routeLine || !position || !hazards || hazards.length === 0) return;

    const aheadIds = hazardsAheadWithinRange(
      routeLine,
      position,
      hazards,
      HAZARD_WARNING_AHEAD_METRES,
    );

    for (const id of aheadIds) {
      if (announcedRef.current.has(id)) continue;
      announcedRef.current.add(id);
      const hazard = hazards.find((h) => h.id === id);
      if (!hazard) continue;
      Speech.speak(`Hazard ahead: ${HAZARD_TYPE_LABELS[hazard.type]}`, { language: 'en-GB' });
    }
  }, [routeLine, position, hazards, enabled]);
}

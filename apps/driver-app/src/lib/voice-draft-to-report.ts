import { hazardReportIdSchema, type ReportHazardRequest } from '@wagonwise/contracts/hazards';

import type { MapPoint } from '../components/route-map';
import type { VoiceHazardDraft } from '../db/voice-draft-queue';

/**
 * Turns a saved draft (M7.3) into a real filing request, once a driver reviews it and chooses to
 * report it (M7.4). `id` and `origin` are supplied by the caller rather than generated here —
 * `id` needs a fresh native UUID (`expo-crypto`, an effectful call), and `origin` may need to
 * fall back to the driver's current position if the draft was captured with no GPS fix (mirrors
 * `report-hazard.tsx`'s own `effectivePin ?? location.point`) — keeping both out of this function
 * is what keeps it a pure, directly testable mapping.
 */
export function reportRequestForDraft(
  draft: VoiceHazardDraft,
  id: string,
  origin: MapPoint,
): ReportHazardRequest {
  return {
    id: hazardReportIdSchema.parse(id),
    type: draft.parsed.type,
    location: origin,
    note: draft.parsed.note,
    measurement: draft.parsed.measurement,
    source: 'voice',
  };
}

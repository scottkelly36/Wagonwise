import type { ParsedVoiceHazardReportDto } from '@wagonwise/contracts/hazards';

import { HAZARD_TYPE_LABELS } from './hazard-labels';

const UNIT_WORD: Record<'m' | 't', string> = {
  m: 'metres',
  t: 'tonnes',
};

/**
 * The spoken confirmation summary design doc §7 step 4 asks for verbatim — "Low bridge, about
 * 3.5 metres, here — save it?" — built from the same plain-word labels the tap-to-drop screen
 * uses (`HAZARD_TYPE_LABELS`), not domain jargon. Falls back to "here" when the driver gave no
 * position hint, matching the example's own wording.
 */
export function summaryFor(parsed: ParsedVoiceHazardReportDto): string {
  const parts = [HAZARD_TYPE_LABELS[parsed.type]];
  if (parsed.measurement) {
    parts.push(`about ${parsed.measurement.value} ${UNIT_WORD[parsed.measurement.unit]}`);
  }
  parts.push(parsed.positionHint ?? 'here');
  return `${parts.join(', ')} — save it?`;
}

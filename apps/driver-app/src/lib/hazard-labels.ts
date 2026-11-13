import type { HazardStatusDto, HazardTypeDto, MeasurementDto } from '@wagonwise/contracts/hazards';

import { formatHeightWithFeetInches, type LengthUnit } from './units';

/** Plain words, not domain jargon (AGENTS.md: "Low bridge", "Too heavy for this road" — not
 *  "restriction" or "prohibition"). The type picker on the report-hazard screen renders every
 *  entry here, in this order — an eight-item grid, not a dropdown, so nothing needs typing or
 *  scrolling to pick from while parked. */
export const HAZARD_TYPE_LABELS: Record<HazardTypeDto, string> = {
  low_bridge: 'Low bridge',
  weight_limit: 'Too heavy for this road',
  width_restriction: 'Too narrow for this road',
  tight_bend: 'Tight bend',
  roadworks: 'Roadworks',
  flooding: 'Flooding',
  speed_camera: 'Speed camera',
  mobile_camera: 'Mobile speed camera',
  no_hgv: 'No HGVs allowed',
  other: 'Something else',
};

/** Only the three measured restriction types (design doc §5) have anything to attach a number
 *  to — the rest describe a hazard with no useful measurement. */
const MEASUREMENT_KIND: Partial<Record<HazardTypeDto, MeasurementDto['kind']>> = {
  low_bridge: 'height',
  weight_limit: 'weight',
  width_restriction: 'width',
};

export function measurementKindFor(type: HazardTypeDto): MeasurementDto['kind'] | undefined {
  return MEASUREMENT_KIND[type];
}

const MEASUREMENT_UNIT: Record<MeasurementDto['kind'], MeasurementDto['unit']> = {
  height: 'm',
  width: 'm',
  weight: 't',
};

export function measurementUnitFor(kind: MeasurementDto['kind']): MeasurementDto['unit'] {
  return MEASUREMENT_UNIT[kind];
}

const MEASUREMENT_LABEL: Record<MeasurementDto['kind'], string> = {
  height: 'Height in metres, for example 4.2 (optional)',
  width: 'Width in metres, for example 2.5 (optional)',
  weight: 'Weight limit (tonnes, optional)',
};

const MEASUREMENT_LABEL_FEET: Partial<Record<MeasurementDto['kind'], string>> = {
  height: 'Height in feet and inches, as on the sign (optional)',
  width: 'Width in feet and inches, as on the sign (optional)',
};

/** The label for the measurement box. Height and width can be given in feet and inches when that is how the driver reads signs. */
export function measurementLabelFor(
  kind: MeasurementDto['kind'],
  unit: LengthUnit = 'metres',
): string {
  return (unit === 'feet' ? MEASUREMENT_LABEL_FEET[kind] : undefined) ?? MEASUREMENT_LABEL[kind];
}

/** Whether this kind of measurement can be typed in feet and inches: UK height and width signs use both; weight is tonnes only. */
export function canTypeInFeet(kind: MeasurementDto['kind']): boolean {
  return kind === 'height' || kind === 'width';
}

/**
 * What to show under the box as the driver types, so a mistake is seen before it is sent: in metres, a height also in feet and inches (13.9 m reads
 * as 45'7", plainly not a bridge); in feet and inches, what that is in metres. Nothing while the box is empty or not a positive number.
 */
export function measurementEcho(
  kind: MeasurementDto['kind'],
  metresText: string,
  unit: LengthUnit,
): string | undefined {
  const metres = Number(metresText.trim());
  if (metresText.trim() === '' || !Number.isFinite(metres) || metres <= 0) return undefined;
  if (unit === 'feet' && canTypeInFeet(kind)) return `${metres.toFixed(2)} m`;
  return kind === 'height' ? formatHeightWithFeetInches(metres) : undefined;
}

/** A recorded measurement, formatted for display — height gets the feet-and-inches aside UK
 *  drivers actually think in (`lib/units.ts`), width/weight just their plain number and unit. */
export function formatMeasurement(measurement: MeasurementDto): string {
  if (measurement.kind === 'height') {
    return formatHeightWithFeetInches(measurement.value);
  }
  return `${measurement.value}${measurement.unit}`;
}

/** Plain words for a hazard's lifecycle state (design doc §8's hazard-detail screen) — shared
 *  between the full detail screen (`app/hazards/[id].tsx`) and the map drawer
 *  (`components/hazard-detail-drawer.tsx`). */
export const HAZARD_STATUS_LABELS: Record<HazardStatusDto, string> = {
  active: 'Active',
  expired: 'Expired',
  dismissed: 'Marked not there',
};

/** What is said as a hazard comes up ahead: a camera is "Speed camera ahead", the rest "Hazard ahead: Low bridge". */
export function hazardWarningSpeech(type: HazardTypeDto): string {
  return type === 'speed_camera' || type === 'mobile_camera'
    ? `${HAZARD_TYPE_LABELS[type]} ahead`
    : `Hazard ahead: ${HAZARD_TYPE_LABELS[type]}`;
}

export type HazardSeverity = 'high' | 'caution';

/** Same four types core's `isBlocking()` (hazards/domain/hazard-report.ts) treats as blocking —
 *  a vehicle genuinely can't pass, not just a "slow down" — mirrored here rather than shared,
 *  since the driver app only ever sees `HazardTypeDto` off the wire, never core's domain
 *  (AGENTS.md rule 7's boundary applies the same way to this app as it does to routing). Drives
 *  the map marker's colour (design decision, 2026-09-24: red for "can't get through", yellow for
 *  "take care") — a `Record` over every `HazardTypeDto` so a ninth type fails to compile here
 *  until someone decides which bucket it's in. */
const HAZARD_SEVERITY: Record<HazardTypeDto, HazardSeverity> = {
  low_bridge: 'high',
  weight_limit: 'high',
  width_restriction: 'high',
  no_hgv: 'high',
  tight_bend: 'caution',
  roadworks: 'caution',
  flooding: 'caution',
  speed_camera: 'caution',
  mobile_camera: 'caution',
  other: 'caution',
};

export function hazardSeverityFor(type: HazardTypeDto): HazardSeverity {
  return HAZARD_SEVERITY[type];
}

import type { HazardTypeDto, MeasurementDto } from '@wagonwise/contracts/hazards';

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
  no_hgv: 'No lorries allowed',
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
  height: 'Height (metres, optional)',
  width: 'Width (metres, optional)',
  weight: 'Weight limit (tonnes, optional)',
};

export function measurementLabelFor(kind: MeasurementDto['kind']): string {
  return MEASUREMENT_LABEL[kind];
}

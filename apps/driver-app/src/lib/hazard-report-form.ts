import type { HazardTypeDto, MeasurementDto } from '@wagonwise/contracts/hazards';
import type { GeoPointDto } from '@wagonwise/contracts/routing';

import { measurementKindFor, measurementUnitFor } from './hazard-labels';

// Pure parsing/validation, no React — same split as vehicle-profile-form.ts.

export interface HazardReportFormValues {
  readonly type: HazardTypeDto | undefined;
  readonly location: GeoPointDto | undefined;
  readonly note: string;
  readonly measurementValue: string;
}

export const EMPTY_HAZARD_REPORT_FORM: HazardReportFormValues = {
  type: undefined,
  location: undefined,
  note: '',
  measurementValue: '',
};

export interface ParsedHazardReport {
  readonly type: HazardTypeDto;
  readonly location: GeoPointDto;
  readonly note: string | undefined;
  readonly measurement: MeasurementDto | undefined;
}

export type ParseHazardReportFormResult =
  | { readonly ok: true; readonly value: ParsedHazardReport }
  | { readonly ok: false; readonly message: string };

/** Mirrors core's own validateMeasurement (hazards/domain/hazard-report.ts) so a driver sees the
 *  same "not a positive number" rule before a network round trip. The measurement field itself
 *  only appears in the UI for a type `measurementKindFor` returns a kind for — this still checks
 *  defensively rather than trusting the caller never passes one for an unmeasured type. */
export function parseHazardReportForm(values: HazardReportFormValues): ParseHazardReportFormResult {
  if (values.type === undefined) {
    return { ok: false, message: 'Choose what kind of hazard this is.' };
  }
  if (values.location === undefined) {
    return { ok: false, message: 'Tap the map to drop a pin where it is.' };
  }

  const note = values.note.trim() === '' ? undefined : values.note.trim();

  const kind = measurementKindFor(values.type);
  let measurement: MeasurementDto | undefined;
  if (kind !== undefined && values.measurementValue.trim() !== '') {
    const value = Number(values.measurementValue.trim());
    if (!Number.isFinite(value) || value <= 0) {
      return { ok: false, message: 'The measurement must be a positive number.' };
    }
    measurement = { kind, value, unit: measurementUnitFor(kind) };
  }

  return {
    ok: true,
    value: { type: values.type, location: values.location, note, measurement },
  };
}

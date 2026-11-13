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

/** What to say when a number is bigger than any sign could carry, which is nearly always a height typed in feet into the metres box (13.9 for 13 ft 9 in): a bridge that high would stop nothing. */
export function implausibleMeasurementMessage(
  kind: MeasurementDto['kind'],
  value: number,
): string | undefined {
  if (kind === 'height' && value > 7) {
    return 'That is too high for a bridge. Heights are in metres, for example 4.2. 13 ft 9 in is 4.19 m.';
  }
  if (kind === 'width' && value > 8) {
    return 'That is too wide for a road. Widths are in metres, for example 2.5.';
  }
  if (kind === 'weight' && value > 100) {
    return 'That is too heavy for a weight limit. Weights are in tonnes, for example 7.5.';
  }
  return undefined;
}

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
    const tooBig = implausibleMeasurementMessage(kind, value);
    if (tooBig !== undefined) return { ok: false, message: tooBig };
    measurement = { kind, value, unit: measurementUnitFor(kind) };
  }

  return {
    ok: true,
    value: { type: values.type, location: values.location, note, measurement },
  };
}

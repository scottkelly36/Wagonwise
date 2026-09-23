import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { HazardReport } from './hazard-report.js';
import { hazardConfirmedEvent, hazardReportedEvent } from './events.js';

function report(overrides: Partial<HazardReport> = {}): HazardReport {
  return {
    id: makeId<'HazardReportId'>('report-1'),
    reporterId: makeId<'DriverId'>('driver-1'),
    type: 'low_bridge',
    location: { lat: 54.9707, lon: -2.1013 },
    source: 'tap',
    confirmations: 0,
    dismissals: 0,
    status: 'active',
    createdAt: new Date('2026-06-15T08:00:00.000Z'),
    ...overrides,
  };
}

describe('hazardReportedEvent', () => {
  it('carries the report id, reporter, type, location and measurement', () => {
    const event = hazardReportedEvent(
      'event-1',
      report({ measurement: { kind: 'height', value: 3.5, unit: 'm' } }),
    );
    expect(event).toEqual({
      eventId: 'event-1',
      aggregateType: 'HazardReport',
      aggregateId: 'report-1',
      eventType: 'HazardReported',
      payload: {
        hazardId: 'report-1',
        reporterId: 'driver-1',
        type: 'low_bridge',
        location: { lat: 54.9707, lon: -2.1013 },
        measurement: { kind: 'height', value: 3.5, unit: 'm' },
      },
    });
  });

  it('omits measurement when the report has none', () => {
    const event = hazardReportedEvent('event-1', report());
    expect(event.payload.measurement).toBeUndefined();
  });
});

describe('hazardConfirmedEvent', () => {
  it('carries the report id, type, location and measurement, but not the reporter', () => {
    const event = hazardConfirmedEvent('event-2', report({ confirmations: 1 }));
    expect(event).toEqual({
      eventId: 'event-2',
      aggregateType: 'HazardReport',
      aggregateId: 'report-1',
      eventType: 'HazardConfirmed',
      payload: {
        hazardId: 'report-1',
        type: 'low_bridge',
        location: { lat: 54.9707, lon: -2.1013 },
        measurement: undefined,
      },
    });
  });
});

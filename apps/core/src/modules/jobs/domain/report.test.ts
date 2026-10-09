import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { Job, JobStatus } from './job.js';
import { jobReportRow, summariseJobReport } from './report.js';

const at = (iso: string) => new Date(iso);
const company = makeId<'CompanyId'>('11111111-1111-4111-8111-111111111111');

function job(overrides: Partial<Job> & { timeline: Job['timeline'] }): Job {
  return {
    id: makeId<'JobId'>('job-1'),
    companyId: company,
    reference: 'WW-1',
    status: 'draft',
    stops: [
      { kind: 'pickup', name: 'Depot', location: { lat: 54.9, lon: -2.1 } },
      { kind: 'delivery', name: 'Port A', location: { lat: 55.0, lon: -1.6 } },
      { kind: 'delivery', name: 'Port B', location: { lat: 55.1, lon: -1.5 } },
    ],
    requiresProofOfDelivery: false,
    hasProofOfDelivery: false,
    currentStop: 0,
    proofStops: [],
    ...overrides,
  };
}

const step = (status: JobStatus, iso: string) => ({ status, at: at(iso) });

describe('jobReportRow', () => {
  it('reads the milestones from the timeline and the stops from the job', () => {
    const row = jobReportRow(
      job({
        status: 'delivered',
        dueBy: at('2026-10-05T17:00:00Z'),
        timeline: [
          step('draft', '2026-10-05T07:00:00Z'),
          step('assigned', '2026-10-05T07:10:00Z'),
          step('accepted', '2026-10-05T08:00:00Z'),
          step('en_route', '2026-10-05T09:00:00Z'),
          step('delivered', '2026-10-05T12:30:00Z'),
        ],
      }),
    );
    expect(row.pickup).toBe('Depot');
    expect(row.delivery).toBe('Port B'); // the last delivery
    expect(row.createdAt).toEqual(at('2026-10-05T07:00:00Z'));
    expect(row.acceptedAt).toEqual(at('2026-10-05T08:00:00Z'));
    expect(row.setOffAt).toEqual(at('2026-10-05T09:00:00Z'));
    expect(row.deliveredAt).toEqual(at('2026-10-05T12:30:00Z'));
    expect(row.minutesAcceptedToDelivered).toBe(270);
    expect(row.onTime).toBe(true);
  });

  it('says late when delivered after the due time, and nothing when there was no due time', () => {
    const late = jobReportRow(
      job({
        status: 'delivered',
        dueBy: at('2026-10-05T10:00:00Z'),
        timeline: [
          step('draft', '2026-10-05T07:00:00Z'),
          step('delivered', '2026-10-05T12:30:00Z'),
        ],
      }),
    );
    expect(late.onTime).toBe(false);
    const noDue = jobReportRow(
      job({ status: 'delivered', timeline: [step('delivered', '2026-10-05T12:30:00Z')] }),
    );
    expect(noDue.onTime).toBeUndefined();
  });

  it('leaves the delivery facts empty for a job that is still going, and notes when one ended', () => {
    const open = jobReportRow(
      job({ status: 'en_route', timeline: [step('draft', '2026-10-05T07:00:00Z')] }),
    );
    expect(open.deliveredAt).toBeUndefined();
    expect(open.minutesAcceptedToDelivered).toBeUndefined();
    expect(open.onTime).toBeUndefined();
    const cancelled = jobReportRow(
      job({
        status: 'cancelled',
        timeline: [
          step('draft', '2026-10-05T07:00:00Z'),
          step('cancelled', '2026-10-05T07:30:00Z'),
        ],
      }),
    );
    expect(cancelled.endedAt).toEqual(at('2026-10-05T07:30:00Z'));
  });
});

describe('summariseJobReport', () => {
  it('counts by outcome, on time against late, the average time and proof received', () => {
    const rows = [
      jobReportRow(
        job({
          status: 'delivered',
          dueBy: at('2026-10-05T17:00:00Z'),
          requiresProofOfDelivery: true,
          hasProofOfDelivery: true,
          timeline: [
            step('accepted', '2026-10-05T08:00:00Z'),
            step('delivered', '2026-10-05T10:00:00Z'),
          ],
        }),
      ),
      jobReportRow(
        job({
          status: 'delivered',
          dueBy: at('2026-10-05T09:00:00Z'),
          requiresProofOfDelivery: true,
          hasProofOfDelivery: false,
          currentStop: 0,
          proofStops: [],
          timeline: [
            step('accepted', '2026-10-05T08:00:00Z'),
            step('delivered', '2026-10-05T12:00:00Z'),
          ],
        }),
      ),
      jobReportRow(
        job({ status: 'cancelled', timeline: [step('cancelled', '2026-10-05T08:00:00Z')] }),
      ),
      jobReportRow(job({ status: 'failed', timeline: [step('failed', '2026-10-05T08:00:00Z')] })),
      jobReportRow(job({ status: 'loaded', timeline: [step('draft', '2026-10-05T08:00:00Z')] })),
    ];
    expect(summariseJobReport(rows)).toEqual({
      total: 5,
      delivered: 2,
      cancelled: 1,
      failed: 1,
      inProgress: 1,
      deliveredOnTime: 1,
      deliveredLate: 1,
      averageMinutes: 180,
      proofRequired: 2,
      proofReceived: 1,
      revenuePence: 0,
      deliveredWithoutPrice: 2,
    });
  });

  it('adds up the price of jobs delivered in the period, and counts delivered jobs with no price', () => {
    const delivered = (price: number | undefined, iso: string, customer?: string) =>
      jobReportRow(
        job({
          status: 'delivered',
          pricePence: price,
          customer,
          timeline: [step('draft', '2026-10-01T08:00:00Z'), step('delivered', iso)],
        }),
      );
    const rows = [
      delivered(10_000, '2026-10-05T10:00:00Z', 'Acme'),
      delivered(2_550, '2026-10-06T10:00:00Z'),
      delivered(undefined, '2026-10-07T10:00:00Z'),
      // Delivered before the period: it was last month's revenue, not this period's.
      delivered(99_999, '2026-09-30T10:00:00Z'),
      jobReportRow(
        job({
          status: 'cancelled',
          pricePence: 5_000,
          timeline: [step('cancelled', '2026-10-05T08:00:00Z')],
        }),
      ),
    ];
    const period = { from: at('2026-10-01T00:00:00Z'), to: at('2026-11-01T00:00:00Z') };
    const summary = summariseJobReport(rows, period);
    expect(summary.revenuePence).toBe(12_550);
    expect(summary.deliveredWithoutPrice).toBe(1);
    expect(rows[0]?.customer).toBe('Acme');
    // With no period given every delivered job counts.
    expect(summariseJobReport(rows).revenuePence).toBe(112_549);
  });

  it('has no average when nothing was delivered', () => {
    expect(summariseJobReport([]).averageMinutes).toBeUndefined();
    expect(summariseJobReport([]).total).toBe(0);
  });
});

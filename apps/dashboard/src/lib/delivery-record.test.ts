import type { JobDto } from '@wagonwise/contracts/jobs';
import { describe, expect, it } from 'vitest';
import { deliveryRecordHtml, escapeHtml, stopTimes } from './delivery-record';

const stop = (kind: 'pickup' | 'delivery', name: string, notes?: string) => ({
  kind,
  name,
  location: { lat: 1, lon: 1 },
  ...(notes === undefined ? {} : { notes }),
});
const entry = (status: JobDto['status'], at: string, stopIndex?: number) => ({
  status,
  at,
  ...(stopIndex === undefined ? {} : { stopIndex }),
});

function job(overrides: Partial<JobDto> = {}): JobDto {
  return {
    id: 'abcdef12-0000-4000-8000-000000000000',
    companyId: 'c',
    reference: 'JOB-7',
    stops: [
      stop('pickup', 'Quarry', 'Ask for Jim'),
      stop('delivery', 'Mart'),
      stop('delivery', 'Depot'),
    ],
    status: 'delivered',
    timeline: [
      entry('assigned', '2026-10-08T07:00:00.000Z'),
      entry('accepted', '2026-10-08T07:05:00.000Z', 0),
      entry('at_pickup', '2026-10-08T07:30:00.000Z', 0),
      entry('loaded', '2026-10-08T07:50:00.000Z', 0),
      entry('en_route', '2026-10-08T07:52:00.000Z', 1),
      entry('at_delivery', '2026-10-08T08:30:00.000Z', 1),
      entry('loaded', '2026-10-08T08:40:00.000Z', 1),
      entry('en_route', '2026-10-08T08:41:00.000Z', 2),
      entry('at_delivery', '2026-10-08T09:10:00.000Z', 2),
      entry('delivered', '2026-10-08T09:20:00.000Z', 2),
    ],
    requiresProofOfDelivery: true,
    hasProofOfDelivery: true,
    currentStop: 3,
    proofStops: [1, 2],
    driverId: 'd',
    ...overrides,
  } as JobDto;
}

describe('stopTimes', () => {
  it('reads when each stop was arrived at and finished', () => {
    const times = stopTimes(job());
    expect(times[0]).toEqual({
      arrivedAt: '2026-10-08T07:30:00.000Z',
      completedAt: '2026-10-08T07:50:00.000Z',
    });
    expect(times[1]?.completedAt).toBe('2026-10-08T08:40:00.000Z');
    expect(times[2]?.completedAt).toBe('2026-10-08T09:20:00.000Z');
  });

  it('does not mistake "loaded and ready" on a delivery-first job for finishing that stop', () => {
    const j = job({
      stops: [stop('delivery', 'Mart')] as JobDto['stops'],
      timeline: [
        entry('accepted', '2026-10-08T07:05:00.000Z', 0),
        entry('loaded', '2026-10-08T07:30:00.000Z', 0),
        entry('en_route', '2026-10-08T07:31:00.000Z', 0),
        entry('at_delivery', '2026-10-08T08:00:00.000Z', 0),
        entry('delivered', '2026-10-08T08:10:00.000Z', 0),
      ],
    });
    expect(stopTimes(j)[0]).toEqual({
      arrivedAt: '2026-10-08T08:00:00.000Z',
      completedAt: '2026-10-08T08:10:00.000Z',
    });
  });
});

describe('escapeHtml', () => {
  it('escapes what could break out of the page', () => {
    expect(escapeHtml(`<script>alert("x")</script> & 'y'`)).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;',
    );
  });
});

describe('deliveryRecordHtml', () => {
  const photos = new Map([
    [1, { dataUrl: 'data:image/jpeg;base64,AAAA', capturedAt: '2026-10-08T08:35:00.000Z' }],
  ]);
  const base = { job: job(), photos, generatedAt: new Date('2026-10-09T10:00:00.000Z') };

  it('the customer copy has the stops, times and photos, and nothing about the driver or vehicle', () => {
    const html = deliveryRecordHtml({
      ...base,
      variant: 'customer',
      driverLabel: 'driver@example.com',
      vehicleName: 'Scania 1',
    });
    expect(html).toContain('JOB-7');
    expect(html).toContain('Quarry');
    expect(html).toContain('Mart');
    expect(html).toContain('data:image/jpeg;base64,AAAA');
    expect(html).not.toContain('driver@example.com');
    expect(html).not.toContain('Scania 1');
    expect(html).not.toContain('Ask for Jim');
    expect(html).not.toContain('Internal');
    expect(html).not.toContain('Status history');
  });

  it('the internal record adds the driver, vehicle, instructions and status history', () => {
    const html = deliveryRecordHtml({
      ...base,
      variant: 'internal',
      driverLabel: 'driver@example.com',
      vehicleName: 'Scania 1',
    });
    expect(html).toContain('driver@example.com');
    expect(html).toContain('Scania 1');
    expect(html).toContain('Ask for Jim');
    expect(html).toContain('Status history');
    expect(html).toContain('Internal copy');
  });

  it('escapes names, and says when there is no photo', () => {
    const html = deliveryRecordHtml({
      ...base,
      job: job({ stops: [stop('delivery', '<img src=x onerror=alert(1)>')] as JobDto['stops'] }),
      photos: new Map(),
      variant: 'customer',
    });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
    expect(html).toContain('No delivery photo is held');
  });

  it('includes no GPS positions', () => {
    const html = deliveryRecordHtml({
      ...base,
      job: job({
        timeline: [
          {
            status: 'accepted',
            at: '2026-10-08T07:05:00.000Z',
            position: { lat: 54.123, lon: -2.456 },
          },
        ] as JobDto['timeline'],
      }),
      variant: 'internal',
    });
    expect(html).not.toContain('54.123');
  });
});

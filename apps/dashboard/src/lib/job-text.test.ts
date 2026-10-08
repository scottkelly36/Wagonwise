import type { JobDto } from '@wagonwise/contracts/jobs';
import { describe, expect, it } from 'vitest';
import { jobHasPickup, jobStatusText } from './job-text';

const stop = (kind: 'pickup' | 'delivery') => ({ kind, name: kind, location: { lat: 1, lon: 1 } });
const both = { stops: [stop('pickup'), stop('delivery')] } as unknown as Pick<JobDto, 'stops'>;
const deliveryOnly = { stops: [stop('delivery')] } as unknown as Pick<JobDto, 'stops'>;

describe('jobStatusText', () => {
  it('reads a status as words', () => {
    expect(jobStatusText({ ...both, status: 'at_pickup' })).toBe('At pickup');
    expect(jobStatusText({ ...both, status: 'accepted' })).toBe('Accepted');
  });

  it('says an accepted job with no pickup is not loaded yet', () => {
    expect(jobStatusText({ ...deliveryOnly, status: 'accepted' })).toBe('Accepted, not loaded yet');
    expect(jobStatusText({ ...deliveryOnly, status: 'loaded' })).toBe('Loaded');
    expect(jobHasPickup(deliveryOnly)).toBe(false);
  });
});

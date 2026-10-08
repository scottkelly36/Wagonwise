import type { JobDto } from '@wagonwise/contracts/jobs';
import { describe, expect, it } from 'vitest';
import { jobHasPickup, jobStatusText } from './job-text';

const stop = (kind: 'pickup' | 'delivery') => ({ kind, name: kind, location: { lat: 1, lon: 1 } });
const both = { stops: [stop('pickup'), stop('delivery')] } as unknown as Pick<JobDto, 'stops'>;
const deliveryOnly = { stops: [stop('delivery')] } as unknown as Pick<JobDto, 'stops'>;
const drops = {
  stops: [stop('pickup'), stop('delivery'), stop('delivery')],
} as unknown as Pick<JobDto, 'stops'>;

describe('jobStatusText', () => {
  it('reads a status as words', () => {
    expect(jobStatusText({ ...both, status: 'at_pickup' })).toBe('At pickup');
    expect(jobStatusText({ ...both, status: 'accepted' })).toBe('Accepted');
  });

  it('says an accepted job that starts with a delivery is not loaded yet', () => {
    expect(jobStatusText({ ...deliveryOnly, status: 'accepted', currentStop: 0 })).toBe(
      'Accepted, not loaded yet',
    );
    expect(jobStatusText({ ...deliveryOnly, status: 'loaded' })).toBe('Loaded');
    expect(jobHasPickup(deliveryOnly)).toBe(false);
  });

  it('says which stop a longer job is on', () => {
    expect(jobStatusText({ ...drops, status: 'en_route', currentStop: 1 })).toBe(
      'En route · stop 2 of 3',
    );
    expect(jobStatusText({ ...drops, status: 'delivered', currentStop: 3 })).toBe('Delivered');
    expect(jobStatusText({ ...drops, status: 'draft' })).toBe('Draft');
  });
});

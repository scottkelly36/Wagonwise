import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import type { JobId } from '../domain/job.js';
import { pruneJobPositions } from './prune-job-positions.js';
import { InMemoryJobPositionRepository } from './testing/in-memory-job-position-repository.js';
import { InMemoryJobRepository } from './testing/in-memory-job-repository.js';

const now = new Date('2026-10-07T12:00:00.000Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
const jobId = '11111111-1111-4111-8111-111111111111' as JobId;
const at = (recordedAt: Date) => ({ jobId, location: { lat: 54.97, lon: -2.1 }, recordedAt });

describe('pruneJobPositions', () => {
  it('deletes positions older than the retention period and keeps newer ones', async () => {
    const positions = new InMemoryJobPositionRepository(new InMemoryJobRepository());
    await positions.record(at(daysAgo(40)));
    await positions.record(at(daysAgo(31)));
    await positions.record(at(daysAgo(29)));
    await positions.record(at(daysAgo(0)));

    const removed = await pruneJobPositions(
      { positions, clock: new FakeClock(now) },
      { retentionDays: 30 },
    );

    expect(removed).toBe(2);
    expect(positions.recorded.map((p) => p.recordedAt)).toEqual([daysAgo(29), daysAgo(0)]);
  });

  it('does nothing, and says so, when there is nothing old', async () => {
    const positions = new InMemoryJobPositionRepository(new InMemoryJobRepository());
    await positions.record(at(daysAgo(1)));
    expect(
      await pruneJobPositions({ positions, clock: new FakeClock(now) }, { retentionDays: 30 }),
    ).toBe(0);
    expect(positions.recorded).toHaveLength(1);
  });
});

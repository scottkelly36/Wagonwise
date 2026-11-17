import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import { pruneFlowEvents, recordFlowEvents } from './flow-events.js';
import { InMemoryFlowEventRepository } from './testing/in-memory-flow-event-repository.js';

const NOW = '2026-11-17T12:00:00.000Z';
const minutesAgo = (m: number) => new Date(new Date(NOW).getTime() - m * 60 * 1000);
const daysAgo = (d: number) => minutesAgo(d * 24 * 60);

function setUp() {
  const repo = new InMemoryFlowEventRepository();
  return { repo, deps: { repo, clock: new FakeClock(NOW), ids: new SequentialIdGenerator() } };
}

const session = { sessionId: 'session-1', appVersion: '1.2.1', platform: 'android' as const };

describe('recordFlowEvents', () => {
  it('stores each event with the session, version and platform, and nothing about the driver', async () => {
    const { repo, deps } = setUp();
    const recorded = await recordFlowEvents(deps, {
      ...session,
      events: [
        { event: 'load_chosen', choice: 'normal', at: minutesAgo(3) },
        { event: 'route_shown', at: minutesAgo(1) },
      ],
    });
    expect(recorded).toBe(2);
    expect(
      repo.events.map((e) => [e.sessionId, e.event, e.choice, e.appVersion, e.platform]),
    ).toEqual([
      ['session-1', 'load_chosen', 'normal', '1.2.1', 'android'],
      ['session-1', 'route_shown', undefined, '1.2.1', 'android'],
    ]);
    expect(Object.keys(repo.events[0] ?? {})).not.toContain('driverId');
  });

  it('leaves out an event over a day old, or more than five minutes ahead, and keeps the rest', async () => {
    const { repo, deps } = setUp();
    const recorded = await recordFlowEvents(deps, {
      ...session,
      events: [
        { event: 'route_shown', at: minutesAgo(25 * 60) },
        { event: 'route_shown', at: minutesAgo(-10) },
        { event: 'route_shown', at: minutesAgo(-4) },
        { event: 'route_shown', at: minutesAgo(23 * 60) },
      ],
    });
    expect(recorded).toBe(2);
    expect(repo.events).toHaveLength(2);
  });

  it('stores nothing when nothing is believable', async () => {
    const { repo, deps } = setUp();
    expect(
      await recordFlowEvents(deps, {
        ...session,
        events: [{ event: 'route_shown', at: daysAgo(3) }],
      }),
    ).toBe(0);
    expect(repo.events).toEqual([]);
  });
});

describe('pruneFlowEvents', () => {
  it('deletes events over 90 days old and keeps the rest', async () => {
    const { repo, deps } = setUp();
    const at = (d: number) => ({ id: `e${d}`, ...session, event: 'route_shown', at: daysAgo(d) });
    await repo.insert([at(91), at(90.5), at(89), at(1)]);
    expect(await pruneFlowEvents(deps)).toBe(2);
    expect(repo.events.map((e) => e.id)).toEqual(['e89', 'e1']);
  });
});

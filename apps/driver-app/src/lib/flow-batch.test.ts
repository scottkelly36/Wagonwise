import { planFlowBatch } from './flow-batch';

const now = new Date('2026-11-17T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();

describe('planFlowBatch', () => {
  it('sends the fresh ones, oldest first, and drops anything over a day old or unreadable', () => {
    const plan = planFlowBatch(
      [
        { id: 1, event: 'route_shown', at: hoursAgo(25) },
        { id: 2, event: 'route_shown', at: hoursAgo(2) },
        { id: 3, event: 'route_shown', at: 'not a time' },
        { id: 4, event: 'load_chosen', choice: 'normal', at: hoursAgo(1) },
      ],
      now,
    );
    expect(plan.drop).toEqual([1, 3]);
    expect(plan.send.map((e) => e.id)).toEqual([2, 4]);
  });

  it('sends no more than the server takes in one request', () => {
    const many = Array.from({ length: 70 }, (_, i) => ({
      id: i,
      event: 'route_shown',
      at: hoursAgo(1),
    }));
    expect(planFlowBatch(many, now).send).toHaveLength(50);
  });
});

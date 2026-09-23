import type { ReportHazardRequest } from '@wagonwise/contracts/hazards';

import { flushQueuedReports } from './hazard-queue-flush';

function request(id: string): ReportHazardRequest {
  return {
    id,
    type: 'low_bridge',
    location: { lat: 54.9707, lon: -2.1013 },
    source: 'tap',
  } as unknown as ReportHazardRequest;
}

describe('flushQueuedReports', () => {
  it('sends every item and reports nothing remaining when every submit succeeds', async () => {
    const submitted: string[] = [];
    const result = await flushQueuedReports([request('a'), request('b')], async (r) => {
      submitted.push(r.id);
    });
    expect(result).toEqual({ sent: ['a', 'b'], remaining: [] });
    expect(submitted).toEqual(['a', 'b']);
  });

  it('stops at the first failure, leaving it and everything after it remaining', async () => {
    const submitted: string[] = [];
    const result = await flushQueuedReports(
      [request('a'), request('b'), request('c')],
      async (r) => {
        submitted.push(r.id);
        if (r.id === 'b') throw new Error('network request failed');
      },
    );
    expect(result.sent).toEqual(['a']);
    expect(result.remaining.map((r) => r.id)).toEqual(['b', 'c']);
    // 'c' was never attempted — no point trying more once one has already failed.
    expect(submitted).toEqual(['a', 'b']);
  });

  it('returns everything remaining, nothing sent, when the first item fails', async () => {
    const result = await flushQueuedReports([request('a')], async () => {
      throw new Error('offline');
    });
    expect(result).toEqual({ sent: [], remaining: [request('a')] });
  });

  it('does nothing for an empty queue', async () => {
    const submit = jest.fn();
    const result = await flushQueuedReports([], submit);
    expect(result).toEqual({ sent: [], remaining: [] });
    expect(submit).not.toHaveBeenCalled();
  });
});

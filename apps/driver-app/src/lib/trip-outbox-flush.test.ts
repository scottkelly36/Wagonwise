import { ApiError } from '../api/errors';
import type { PendingTripEnd } from '../db/trip-outbox';
import { flushTripOutbox } from './trip-outbox-flush';

const refused = (status: number) => new ApiError('Refused', status);
const offline = () => new TypeError('Network request failed');

function deps(overrides: {
  advanceJob?: jest.Mock;
  endTrip?: jest.Mock;
}): Parameters<typeof flushTripOutbox>[1] & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    advanceJob:
      overrides.advanceJob ??
      jest.fn(
        async (jobId: string, status: string) => void calls.push(`advance ${jobId} ${status}`),
      ),
    endTrip:
      overrides.endTrip ?? jest.fn(async (tripId: string) => void calls.push(`end ${tripId}`)),
  };
}

const arrival: PendingTripEnd = {
  tripId: 'trip-1',
  jobAdvance: { jobId: 'job-1', status: 'at_delivery' },
};

describe('flushTripOutbox', () => {
  it('says the job has arrived before it ends the trip, then moves on to the next trip', async () => {
    const d = deps({});
    const result = await flushTripOutbox([arrival, { tripId: 'trip-2' }], d);
    expect(d.calls).toEqual(['advance job-1 at_delivery', 'end trip-1', 'end trip-2']);
    expect(result).toEqual({ done: ['trip-1', 'trip-2'], remaining: [] });
  });

  it('stops at no signal and leaves that trip and the ones after it queued, in order', async () => {
    const endTrip = jest.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(offline());
    const result = await flushTripOutbox(
      [{ tripId: 'a' }, { tripId: 'b' }, { tripId: 'c' }],
      deps({ endTrip }),
    );
    expect(result.done).toEqual(['a']);
    expect(result.remaining.map((i) => i.tripId)).toEqual(['b', 'c']);
    expect(endTrip).toHaveBeenCalledTimes(2);
  });

  it('keeps a trip queued when the server errors or the token is about to refresh', async () => {
    for (const status of [500, 401, 408, 429]) {
      const result = await flushTripOutbox(
        [{ tripId: 'a' }],
        deps({ endTrip: jest.fn().mockRejectedValue(refused(status)) }),
      );
      expect(result.done).toEqual([]);
      expect(result.remaining).toHaveLength(1);
    }
  });

  it('counts a refusal retrying cannot fix as dealt with, so the queue is never stuck on it', async () => {
    const endTrip = jest.fn().mockRejectedValue(refused(404));
    const result = await flushTripOutbox([{ tripId: 'a' }, { tripId: 'b' }], deps({ endTrip }));
    expect(result).toEqual({ done: ['a', 'b'], remaining: [] });
  });

  it('still ends the trip when the job refuses the arrival, for good', async () => {
    const d = deps({ advanceJob: jest.fn().mockRejectedValue(refused(409)) });
    const result = await flushTripOutbox([arrival], d);
    expect(d.endTrip).toHaveBeenCalledWith('trip-1', undefined);
    expect(result.done).toEqual(['trip-1']);
  });

  it('does not end the trip when the arrival could not be sent for want of signal', async () => {
    const d = deps({ advanceJob: jest.fn().mockRejectedValue(offline()) });
    const result = await flushTripOutbox([arrival], d);
    expect(d.endTrip).not.toHaveBeenCalled();
    expect(result.remaining).toEqual([arrival]);
  });

  it('tells the server when the driver ended the trip, not when the signal came back', async () => {
    const d = deps({});
    await flushTripOutbox([{ tripId: 'trip-1', endedAt: '2026-11-12T09:30:00.000Z' }], d);
    expect(d.endTrip).toHaveBeenCalledWith('trip-1', '2026-11-12T09:30:00.000Z');
  });

  it('does nothing for an empty queue', async () => {
    expect(await flushTripOutbox([], deps({}))).toEqual({ done: [], remaining: [] });
  });
});

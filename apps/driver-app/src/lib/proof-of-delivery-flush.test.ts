import { ApiError } from '../api/errors';
import {
  flushQueuedProofs,
  isPermanentRejection,
  type QueuedProofOfDelivery,
} from './proof-of-delivery-flush';

function item(jobId: string): QueuedProofOfDelivery {
  return { jobId, contentType: 'image/jpeg', dataBase64: 'aGVsbG8=' };
}

describe('isPermanentRejection', () => {
  it('treats client errors as permanent', () => {
    expect(isPermanentRejection(new ApiError('JobNotFound', 404))).toBe(true);
    expect(isPermanentRejection(new ApiError('Forbidden', 403))).toBe(true);
    expect(isPermanentRejection(new ApiError('InvalidRequest', 400))).toBe(true);
  });

  it('keeps retrying when the problem is the moment, not the photo', () => {
    expect(isPermanentRejection(new ApiError('Unauthorized', 401))).toBe(false);
    expect(isPermanentRejection(new ApiError('Timeout', 408))).toBe(false);
    expect(isPermanentRejection(new ApiError('Slow', 429))).toBe(false);
    expect(isPermanentRejection(new ApiError('Boom', 500))).toBe(false);
    expect(isPermanentRejection(new TypeError('Network request failed'))).toBe(false);
  });
});

describe('flushQueuedProofs', () => {
  it('sends everything in order', async () => {
    const submit = jest.fn().mockResolvedValue(undefined);
    const result = await flushQueuedProofs([item('a'), item('b')], submit);
    expect(result).toEqual({ sent: ['a', 'b'], discarded: [], remaining: [] });
    expect(submit.mock.calls.map(([i]) => (i as QueuedProofOfDelivery).jobId)).toEqual(['a', 'b']);
  });

  it('stops at the first connectivity failure and leaves the rest queued', async () => {
    const submit = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new TypeError('Network request failed'));
    const queued = [item('a'), item('b'), item('c')];
    const result = await flushQueuedProofs(queued, submit);
    expect(result.sent).toEqual(['a']);
    expect(result.remaining).toEqual([item('b'), item('c')]);
    expect(submit).toHaveBeenCalledTimes(2);
  });

  it('drops a photo the server will never accept and carries on with the next', async () => {
    const submit = jest
      .fn()
      .mockRejectedValueOnce(new ApiError('JobNotFound', 404))
      .mockResolvedValueOnce(undefined);
    const result = await flushQueuedProofs([item('gone'), item('b')], submit);
    expect(result).toEqual({ sent: ['b'], discarded: ['gone'], remaining: [] });
  });

  it('does nothing with an empty queue', async () => {
    const submit = jest.fn();
    expect(await flushQueuedProofs([], submit)).toEqual({
      sent: [],
      discarded: [],
      remaining: [],
    });
    expect(submit).not.toHaveBeenCalled();
  });
});

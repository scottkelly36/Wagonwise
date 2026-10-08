import type { SubmitCheckRequest } from '@wagonwise/contracts/checks';

import { ApiError } from '../api/errors';
import { flushQueuedChecks, type QueuedCheck } from './check-queue-flush';

function queued(id: string, photoItems: string[] = []): QueuedCheck {
  return {
    request: {
      id,
      templateId: 't1',
      vehicleId: 'v1',
      answers: [{ itemId: 'tyres', value: 'ok' }],
    } as unknown as SubmitCheckRequest,
    photos: photoItems.map((itemId) => ({
      itemId,
      contentType: 'image/jpeg' as const,
      dataBase64: 'aGVsbG8=',
    })),
  };
}

const offline = new TypeError('Network request failed');

describe('flushQueuedChecks', () => {
  it('sends each check, then its photos, in order', async () => {
    const calls: string[] = [];
    const result = await flushQueuedChecks(
      [queued('a', ['tyres']), queued('b')],
      (request) => {
        calls.push(`check ${request.id}`);
        return Promise.resolve();
      },
      (checkId, photo) => {
        calls.push(`photo ${checkId}/${photo.itemId}`);
        return Promise.resolve();
      },
    );
    expect(calls).toEqual(['check a', 'photo a/tyres', 'check b']);
    expect(result).toEqual({
      sent: ['a', 'b'],
      discarded: [],
      photosDone: [{ checkId: 'a', itemId: 'tyres' }],
      remaining: [],
    });
  });

  it('stops at the first connectivity failure on a check and leaves it and the rest queued', async () => {
    const submit = jest.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(offline);
    const result = await flushQueuedChecks(
      [queued('a'), queued('b'), queued('c')],
      submit,
      jest.fn(),
    );
    expect(result.sent).toEqual(['a']);
    expect(result.remaining.map((q) => q.request.id)).toEqual(['b', 'c']);
    expect(submit).toHaveBeenCalledTimes(2);
  });

  it('keeps a check queued when its photo cannot go yet, having already sent the check', async () => {
    const send = jest.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(offline);
    const result = await flushQueuedChecks(
      [queued('a', ['tyres', 'load']), queued('b')],
      () => Promise.resolve(),
      send,
    );
    expect(result.sent).toEqual([]);
    expect(result.photosDone).toEqual([{ checkId: 'a', itemId: 'tyres' }]);
    expect(result.remaining.map((q) => q.request.id)).toEqual(['a', 'b']);
  });

  it('drops a check the server will never accept and carries on with the next', async () => {
    const submit = jest
      .fn()
      .mockRejectedValueOnce(new ApiError('InvalidAnswers', 400))
      .mockResolvedValueOnce(undefined);
    const result = await flushQueuedChecks([queued('a'), queued('b')], submit, jest.fn());
    expect(result).toEqual({ sent: ['b'], discarded: ['a'], photosDone: [], remaining: [] });
  });

  it('drops just a photo the server will never accept, and still counts the check as sent', async () => {
    const send = jest.fn().mockRejectedValueOnce(new ApiError('NoPhotoWanted', 400));
    const result = await flushQueuedChecks([queued('a', ['tyres'])], () => Promise.resolve(), send);
    expect(result.sent).toEqual(['a']);
    expect(result.photosDone).toEqual([{ checkId: 'a', itemId: 'tyres' }]);
  });

  it('keeps retrying when the problem is the moment: a sign-in that is expiring, or a server fault', async () => {
    for (const error of [new ApiError('Unauthorized', 401), new ApiError('Boom', 500)]) {
      const result = await flushQueuedChecks([queued('a')], () => Promise.reject(error), jest.fn());
      expect(result.remaining).toHaveLength(1);
      expect(result.discarded).toEqual([]);
    }
  });
});

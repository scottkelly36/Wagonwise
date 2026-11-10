import { ApiError } from '../api/errors';
import { flushQueuedSignatures, type QueuedSignature } from './signature-flush';

function item(jobId: string): QueuedSignature {
  return {
    jobId,
    strokes: [
      [
        [1, 1],
        [5, 5],
      ],
    ],
  };
}

describe('flushQueuedSignatures', () => {
  it('sends in order, drops what the server will never take, and stops on no signal', async () => {
    const submit = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new ApiError('JobNotFound', 404))
      .mockRejectedValueOnce(new TypeError('Network request failed'));
    const result = await flushQueuedSignatures(
      [item('a'), item('b'), item('c'), item('d')],
      submit,
    );
    expect(result.sent).toEqual(['a']);
    expect(result.discarded).toEqual(['b']);
    expect(result.remaining.map((i) => i.jobId)).toEqual(['c', 'd']);
  });
});

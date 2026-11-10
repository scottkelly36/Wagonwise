import type { AttachSignatureRequest } from '@wagonwise/contracts/jobs';

import { flushQueuedProofs } from './proof-of-delivery-flush';

export interface QueuedSignature extends AttachSignatureRequest {
  readonly jobId: string;
}

/** Sends queued signatures with the same rules as the photos: a permanent rejection is dropped, anything else stops the pass. */
export function flushQueuedSignatures(
  queued: readonly QueuedSignature[],
  submit: (item: QueuedSignature) => Promise<unknown>,
) {
  return flushQueuedProofs<QueuedSignature>(queued, submit);
}
